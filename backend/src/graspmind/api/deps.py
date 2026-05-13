"""Shared FastAPI dependencies used across multiple route modules."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from supabase import AsyncClient, acreate_client

from graspmind.config import Settings, get_settings
from graspmind.security.auth import CurrentUser, get_current_user

logger = logging.getLogger(__name__)

# Re-export for convenient importing
AuthUser = Annotated[CurrentUser, Depends(get_current_user)]

from graspmind.supabase_client import create_user_client, get_service_client

async def get_service_supabase(settings: Settings = Depends(get_settings)) -> AsyncClient:
    """FastAPI dependency for the service client."""
    return await get_service_client(settings)


async def get_user_supabase(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> AsyncClient:
    """FastAPI dependency for the user-scoped client (RLS active)."""
    # Extract JWT token from cookie or Authorization header
    token = request.cookies.get("access_token")
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

    return await create_user_client(settings, token)


# Typed aliases for cleaner route signatures
UserSupabase = Annotated[AsyncClient, Depends(get_user_supabase)]
ServiceSupabase = Annotated[AsyncClient, Depends(get_service_supabase)]


async def require_faculty(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    supabase: AsyncClient = Depends(get_service_supabase),
) -> CurrentUser:
    """Enforces faculty access (Teacher, TA, or Admin) via authoritative DB check."""
    result = await supabase.table("users").select("role").eq("id", user.id).single().execute()
    role = result.data.get("role") if result.data else None
    
    if role not in ("teacher", "ta", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Faculty access required.",
        )
    return user


# Aliases for route dependencies
TeacherUser = Annotated[CurrentUser, Depends(require_faculty)]
FacultyUser = Annotated[CurrentUser, Depends(require_faculty)]


async def verify_faculty_access(
    class_id: str | UUID, 
    user_id: str | UUID, 
    supabase: AsyncClient,
    require_owner: bool = False
) -> str:
    """Verifies that a user has faculty access to a specific course.
    
    Returns the role ('owner', 'teacher', 'ta', 'admin').
    Raises HTTPException if access is denied.
    """
    class_id_str = str(class_id)
    user_id_str = str(user_id)

    # 1. Check if user is the primary owner (Teacher)
    cls = await supabase.table("classes").select("teacher_id").eq("id", class_id_str).maybe_single().execute()
    if cls.data and cls.data["teacher_id"] == user_id_str:
        return "owner"

    if require_owner:
        raise HTTPException(status_code=403, detail="Owner-level permission required.")

    # 2. Check if user is delegated staff (TA / Collaborating Teacher)
    staff = await supabase.table("course_staff").select("role").eq("class_id", class_id_str).eq("user_id", user_id_str).maybe_single().execute()
    if staff.data:
        return staff.data["role"]

    raise HTTPException(status_code=403, detail="Faculty access to this course denied.")
