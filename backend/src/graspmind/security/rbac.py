"""Role-Based Access Control (RBAC) dependencies.

Provides FastAPI dependencies that restrict endpoint access
based on the authenticated user's role.
"""

from fastapi import Depends, HTTPException, status

from graspmind.security.auth import CurrentUser, get_current_user

# Ordered from least to most privileged
ROLE_HIERARCHY = {"student": 0, "teacher": 1, "admin": 2}


def _require_role(minimum_role: str):
    """Factory: create a dependency that enforces a minimum role level."""

    async def _checker(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        user_level = ROLE_HIERARCHY.get(current_user.role, -1)
        required_level = ROLE_HIERARCHY.get(minimum_role, 99)

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires '{minimum_role}' role or higher",
            )
        return current_user

    return _checker


# Pre-built dependencies for common role checks
require_student = Depends(_require_role("student"))
require_teacher = Depends(_require_role("teacher"))
require_admin = Depends(_require_role("admin"))
