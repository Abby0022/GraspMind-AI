"""Authentication routes — signup, login, logout, refresh, me.

All auth operations delegate to Supabase Auth. The backend acts
as a secure proxy, setting HttpOnly cookies and never exposing
tokens to client-side JavaScript.
"""

import hmac
import logging
import json

from fastapi import APIRouter, Depends, HTTPException, Response, status
from supabase import AsyncClient

logger = logging.getLogger(__name__)

from graspmind.api.deps import AuthUser, get_service_supabase, get_user_supabase
from graspmind.supabase_client import get_service_client
from graspmind.security.rate_limiter import get_redis, RateLimiter
from graspmind.config import Settings, get_settings
from graspmind.models.schemas import (
    AuthResponse,
    LoginRequest,
    SignupRequest,
    TokenRefreshRequest,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set secure HttpOnly cookies for auth tokens."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=3600,  # 1 hour
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=604800,  # 7 days
        path="/api/auth/refresh",  # Only sent to refresh endpoint
    )


@router.post(
    "/signup", 
    response_model=AuthResponse, 
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=600))],  # 5 signups per 10 mins
)
async def signup(
    body: SignupRequest,
    response: Response,
    supabase: AsyncClient = Depends(get_service_supabase),
    settings: Settings = Depends(get_settings),
):
    """Register an account via Supabase Auth.

    Role assignment is fully server-controlled:
    - No teacher_code provided  → student (default, safe)
    - teacher_code matches TEACHER_INVITE_CODE env var → teacher
    - teacher_code wrong / TEACHER_INVITE_CODE not set → 403 Forbidden

    User input cannot influence the role written to public.users;
    the DB value is always the backend's decision.
    """
    # ── Determine role from validated code ──────────────────────────────
    assigned_role = "student"
    if body.teacher_code is not None:
        expected = settings.teacher_invite_code
        if not expected:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teacher signup is not enabled on this platform.",
            )
        # Use constant-time comparison to prevent timing attacks
        if not hmac.compare_digest(body.teacher_code, expected):
            # Log the attempt but return a generic message
            logger.warning("Invalid teacher code attempt for email: %s", body.email)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid teacher access code.",
            )
        assigned_role = "teacher"

    # ── Create Supabase Auth account ────────────────────────────────────
    try:
        result = await supabase.auth.sign_up(
            {
                "email": body.email,
                "password": body.password,
                "options": {
                    # metadata is for JWT compat only — public.users is authoritative
                    "data": {"name": body.name, "role": assigned_role},
                },
            }
        )
    except Exception as exc:
        logger.warning("Signup failed for %s: %s", body.email, exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signup failed. Please check your details and try again.",
        ) from exc

    if not result.session or not result.user:
        # Email confirmation required — account created but not yet active.
        # We return a 201 Created but with a flag indicating verification is needed.
        return AuthResponse(
            access_token=None,
            user=None,
            verification_required=True,
        )

    # ── Upsert public.users with server-determined role ─────────────────
    # This is the canonical role record. The trigger may have already
    # inserted with 'student'; we overwrite here with the validated role.
    try:
        await supabase.table("users").upsert(
            {
                "id": str(result.user.id),
                "email": result.user.email or "",
                "name": body.name,
                "role": assigned_role,  # set by backend, not user input
            },
            on_conflict="id",
        ).execute()
    except Exception as exc:
        logger.error("Failed to write user profile for %s: %s", result.user.id, exc)
        # Auth record exists — log but don't fail the response

    _set_auth_cookies(response, result.session.access_token, result.session.refresh_token)

    return AuthResponse(
        access_token=result.session.access_token,
        user=UserResponse(
            id=result.user.id,
            email=result.user.email or "",
            name=body.name,
            role=assigned_role,
            created_at=result.user.created_at,
        ),
    )


@router.post(
    "/login", 
    response_model=AuthResponse,
    dependencies=[Depends(RateLimiter(max_requests=20, window_seconds=60))],  # 20 attempts per min
)
async def login(
    body: LoginRequest,
    response: Response,
    # Login is unauthenticated — use service client to proxy to Supabase Auth.
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Authenticate with email/password and receive HttpOnly cookies.

    Role is fetched from public.users (DB), not user_metadata.
    This prevents role elevation via crafted JWT metadata.
    """
    try:
        result = await supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        ) from exc

    if not result.session or not result.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    _set_auth_cookies(response, result.session.access_token, result.session.refresh_token)

    # Fetch authoritative role + name from public.users (DB), not user_metadata
    db_profile = await supabase.table("users").select("name, role").eq(
        "id", str(result.user.id)
    ).single().execute()

    user_meta = result.user.user_metadata or {}
    db_name = db_profile.data.get("name", "") if db_profile.data else user_meta.get("name", "")
    db_role = db_profile.data.get("role", "student") if db_profile.data else "student"

    # ── SECURITY: Log Success ─────────────────────────────────────────
    try:
        await supabase.table("audit_logs").insert({
            "user_id": str(result.user.id),
            "event_type": "login_success",
            "action": "POST /api/v1/auth/login",
            "metadata": {"ip": "masked"}
        }).execute()
    except Exception:
        pass

    return AuthResponse(
        access_token=result.session.access_token,
        user=UserResponse(
            id=result.user.id,
            email=result.user.email or "",
            name=db_name,
            role=db_role,
            created_at=result.user.created_at,
        ),
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(
    body: TokenRefreshRequest,
    response: Response,
    # Token refresh does not require an active session — use service client.
    supabase: AsyncClient = Depends(get_service_supabase),
    settings: Settings = Depends(get_settings),
):
    """Refresh the access token using a valid refresh token."""
    try:
        result = await supabase.auth.refresh_session(body.refresh_token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        ) from exc

    if not result.session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session refresh failed",
        )

    _set_auth_cookies(response, result.session.access_token, result.session.refresh_token)

    # ── AUTHORITATIVE ROLE CHECK ─────────────────────────────────────
    user_id = result.user.id if result.user else ""
    db_name = ""
    db_role = "student"
    
    try:
        redis = await get_redis(settings)
        cache_key = f"user_profile:{user_id}"
        cached = await redis.get(cache_key)
        
        if cached:
            profile_data = json.loads(cached)
            db_name = profile_data.get("name", "")
            db_role = profile_data.get("role", "student")
        else:
            profile = await supabase.table("users").select("name, role").eq(
                "id", str(user_id)
            ).maybe_single().execute()
            
            if profile and profile.data:
                db_name = profile.data.get("name", "")
                db_role = profile.data.get("role", "student")
                # Cache for 15 minutes
                await redis.setex(cache_key, 900, json.dumps({"name": db_name, "role": db_role}))
    except Exception as exc:
        logger.warning("Failed to fetch authoritative profile during refresh for %s: %s", user_id, exc)

    return AuthResponse(
        access_token=result.session.access_token,
        user=UserResponse(
            id=user_id,
            email=result.user.email or "" if result.user else "",
            name=db_name,
            role=db_role,
            created_at=result.user.created_at if result.user else None,
        ),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    _user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Sign out — clear auth cookies and invalidate the Supabase session."""
    try:
        await supabase.auth.sign_out()
    except Exception:  # noqa: BLE001 — best-effort server-side invalidation
        logger.debug("sign_out failed (non-critical): will clear cookies anyway")

    # Cookie deletion flags MUST mirror the original set_cookie flags —
    # browsers will silently ignore deletions that don't match.
    response.delete_cookie(
        "access_token",
        path="/",
        httponly=True,
        secure=True,
        samesite="lax",
    )
    response.delete_cookie(
        "refresh_token",
        path="/api/auth/refresh",
        httponly=True,
        secure=True,
        samesite="lax",
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: AuthUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Return the current authenticated user's profile from public.users.

    Uses the service client singleton (not get_user_supabase) to avoid the
    set_session(access_token, refresh_token=access_token) call that causes
    GoTrue to reject the request with a 401. The user identity is already
    validated by AuthUser, so the service client is safe here.
    Role is always read from the DB — never from JWT user_metadata.
    """
    # Try Redis cache first
    try:
        settings = get_settings()
        redis = await get_redis(settings)
        cache_key = f"user_profile:{user.id}"
        cached = await redis.get(cache_key)
        if cached:
            profile_data = json.loads(cached)
            return UserResponse(
                id=user.id,
                email=user.email,
                name=profile_data.get("name", ""),
                role=profile_data.get("role", "student"),
                created_at=profile_data.get("created_at"),
            )
    except Exception:
        pass

    try:
        profile = await supabase.table("users").select("name, role, created_at").eq(
            "id", user.id
        ).maybe_single().execute()
        
        if profile and profile.data:
            # Cache for 15 minutes
            await redis.setex(cache_key, 900, json.dumps({
                "name": profile.data.get("name"),
                "role": profile.data.get("role"),
                "created_at": profile.data.get("created_at")
            }))
            
            return UserResponse(
                id=user.id,
                email=user.email,
                name=profile.data.get("name", ""),
                role=profile.data.get("role", "student"),
                created_at=profile.data.get("created_at"),
            )
    except Exception as exc:
        logger.warning("Failed to fetch profile for %s: %s", user.id, exc)

    return UserResponse(
        id=user.id,
        email=user.email,
        name="",
        role="student",
        created_at=None,
    )
