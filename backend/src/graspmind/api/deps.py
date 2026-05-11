"""Shared FastAPI dependencies used across multiple route modules."""

import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from supabase import AsyncClient, acreate_client

from graspmind.config import Settings, get_settings
from graspmind.security.auth import CurrentUser, get_current_user

logger = logging.getLogger(__name__)

# Re-export for convenient importing
AuthUser = Annotated[CurrentUser, Depends(get_current_user)]

_supabase_service_client: AsyncClient | None = None


async def get_service_supabase(settings: Settings = Depends(get_settings)) -> AsyncClient:
    """Lazy singleton Supabase client (uses service key for background/admin ops).

    WARNING: This client bypasses RLS. Use ONLY for background tasks that run
    outside of a user request context (e.g., ingestion workers).
    """
    global _supabase_service_client  # noqa: PLW0603
    if _supabase_service_client is None:
        _supabase_service_client = await acreate_client(
            settings.supabase_url,
            settings.supabase_service_key,
        )
    return _supabase_service_client


async def get_user_supabase(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AsyncClient:
    """Creates a Supabase client scoped to the current user's session.

    Uses the anon key and injects the user's JWT via set_session(), which
    instructs Postgres to evaluate RLS policies as that user. If no valid
    token is found, raises HTTP 401 to prevent silent RLS bypass.
    """
    # Extract JWT token from cookie or Authorization header
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.removeprefix("Bearer ").strip()

    # Enforce that a token is present — never return an unauthenticated client
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create a fresh per-request client with anon key
    client = await acreate_client(settings.supabase_url, settings.supabase_anon_key)

    # Inject the user's JWT so Postgres evaluates RLS as this user
    # refresh_token is not needed here — we are only setting DB context
    await client.auth.set_session(access_token=token, refresh_token=token)

    return client


# Typed aliases for cleaner route signatures
UserSupabase = Annotated[AsyncClient, Depends(get_user_supabase)]
ServiceSupabase = Annotated[AsyncClient, Depends(get_service_supabase)]


async def require_teacher(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    supabase: AsyncClient = Depends(get_service_supabase),
) -> CurrentUser:
    """Dependency that enforces teacher role by querying public.users.

    IMPORTANT: This must NOT use user.role from the JWT (user_metadata) because
    that field is set by the client at signup and can be spoofed. The DB is the
    canonical source of truth for role checks on privileged operations.
    """
    result = await supabase.table("users").select("role").eq("id", user.id).single().execute()
    if not result.data or result.data.get("role") != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher access required.",
        )
    return user


# Typed alias: use this in teacher-only routes instead of AuthUser
TeacherUser = Annotated[CurrentUser, Depends(require_teacher)]
