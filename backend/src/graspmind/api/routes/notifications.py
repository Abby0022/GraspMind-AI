"""Notifications API routes — student alerts.

Endpoints:
- GET    /notifications          List current user's notifications
- PATCH  /notifications/{id}     Mark notification as read
- DELETE /notifications/{id}     Remove notification
- POST   /notifications/read-all Mark all as read
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from graspmind.api.deps import AuthUser, get_service_supabase
from graspmind.models.schemas import NotificationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    user: AuthUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """List notifications for the current user."""
    result = (
        await supabase.table("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return result.data or []


@router.patch("/{notification_id}", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: UUID,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Mark a notification as read."""
    result = (
        await supabase.table("notifications")
        .update({"is_read": True})
        .eq("id", str(notification_id))
        .eq("user_id", user.id)
        .select()
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Notification not found")
    return result.data


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read(
    user: AuthUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Mark all unread notifications as read for the current user."""
    await (
        supabase.table("notifications")
        .update({"is_read": True})
        .eq("user_id", user.id)
        .eq("is_read", False)
        .execute()
    )


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: UUID,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Remove a notification."""
    result = (
        await supabase.table("notifications")
        .delete()
        .eq("id", str(notification_id))
        .eq("user_id", user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Notification not found")
