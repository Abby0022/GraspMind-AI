"""JWT authentication via Supabase Auth.

Validates JWTs by calling Supabase's auth.get_user() API — this works
with both legacy HS256 and the new ECC P-256 (ES256) signing keys.
"""

import logging
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, status
from pydantic import BaseModel

# Use async client — sync create_client blocks the event loop
from supabase import AsyncClient, acreate_client

from graspmind.config import Settings, get_settings

logger = logging.getLogger(__name__)

# Module-level singleton for the auth verification client.
# Avoids creating a new connection pool on every request.
_auth_client: AsyncClient | None = None


async def _get_auth_client(settings: Settings) -> AsyncClient:
    """Lazy async singleton for Supabase auth verification."""
    global _auth_client  # noqa: PLW0603
    if _auth_client is None:
        _auth_client = await acreate_client(
            settings.supabase_url,
            settings.supabase_anon_key,
        )
    return _auth_client


class CurrentUser(BaseModel):
    """Authenticated user context available to all routes."""

    id: str
    email: str
    role: str


async def get_current_user(
    request: Request,
    access_token: Annotated[str | None, Cookie()] = None,
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    """Extract and validate the current user from cookie or Authorization header.

    Delegates token verification to Supabase's auth.get_user() — works
    with both legacy HS256 and new ECC P-256 JWT signing keys.
    """
    token: str | None = access_token

    # Fallback to Authorization header
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.removeprefix("Bearer ").strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Guard against excessively large tokens to prevent DoS
    if len(token) > 2048:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify token via Supabase using the shared async singleton client
    try:
        client = await _get_auth_client(settings)
        response = await client.auth.get_user(token)
        user = response.user
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # ── AUTHORITATIVE ROLE CHECK (Cached) ──────────────────────────────
    # We do NOT trust the role in user_metadata. We use the public.users table.
    # To avoid hammering the DB on every request, we cache the role in Redis.
    role = "student"
    try:
        from graspmind.security.rate_limiter import get_redis
        import json
        
        redis = await get_redis(settings)
        cache_key = f"user_profile:{user.id}"
        cached = await redis.get(cache_key)
        
        if cached:
            profile_data = json.loads(cached)
            role = profile_data.get("role", "student")
        else:
            from graspmind.supabase_client import get_service_client
            service_client = await get_service_client(settings)
            profile = await service_client.table("users").select("role").eq("id", user.id).maybe_single().execute()
            role = profile.data.get("role", "student") if profile and profile.data else "student"
            # Cache for 15 minutes
            await redis.setex(cache_key, 900, json.dumps({"role": role}))
            
    except Exception as exc:
        logger.warning("Role check failed for %s, falling back to 'student': %s", user.id, exc)
        role = "student"

    return CurrentUser(
        id=user.id,
        email=user.email or "",
        role=role,
    )
