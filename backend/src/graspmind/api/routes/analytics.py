"""Analytics API routes — teacher portal.

Endpoints:
- GET /classes/{class_id}/analytics   Per-class mastery & performance summary (teacher only)

Uses a single Postgres RPC call (get_class_analytics) instead of N+1
Python loops. The service client singleton avoids per-request pool churn.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from graspmind.api.deps import ServiceSupabase, TeacherUser, get_service_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/classes", tags=["Teacher — Analytics"])


@router.get("/{class_id}/analytics")
async def get_class_analytics(
    class_id: UUID,
    teacher: TeacherUser,
    supabase: ServiceSupabase,
):
    """Return aggregated class analytics (teacher only).

    Uses the get_class_analytics() Postgres function defined in migration 010
    to produce the full analytics payload in a single round-trip:
    - student_count
    - avg_mastery (across all enrolled students)
    - weakest_concepts (bottom 5 by average mastery)
    - assignment_completion_rate
    - per_student breakdown
    """
    # Verify teacher owns this class before calling the SECURITY DEFINER fn
    cls = (
        await supabase.table("classes")
        .select("id, name")
        .eq("id", str(class_id))
        .eq("teacher_id", teacher.id)
        .single()
        .execute()
    )
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    try:
        result = await supabase.rpc(
            "get_class_analytics", {"p_class_id": str(class_id)}
        ).execute()
    except Exception as exc:
        logger.error("Analytics RPC failed for class %s: %s", class_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch analytics") from exc

    payload = result.data or {}
    return {
        "class_id": str(class_id),
        "class_name": cls.data["name"],
        **payload,
    }
