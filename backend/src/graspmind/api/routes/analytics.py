"""Analytics API routes — institutional reporting portal.

Endpoints:
- GET /analytics/classes/{class_id}           Per-class mastery summary (teacher/staff)
- GET /analytics/classes/{class_id}/export    CSV performance export (SIS integration)
- GET /analytics/department                  Department-wide overview (Admin/Head)
"""

import csv
import logging
from io import StringIO
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from graspmind.api.deps import FacultyUser, ServiceSupabase, TeacherUser, verify_faculty_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["Teacher — Analytics"])


@router.get("/classes/{class_id}")
async def get_class_analytics(
    class_id: UUID,
    teacher: TeacherUser,
    supabase: ServiceSupabase,
):
    """Return aggregated class analytics (teacher only)."""
    # Verify teacher access
    await verify_faculty_access(class_id, teacher.id, supabase)

    try:
        result = await supabase.rpc(
            "get_class_analytics", {"p_class_id": str(class_id)}
        ).execute()
    except Exception as exc:
        logger.error("Analytics RPC failed for class %s: %s", class_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch analytics") from exc

    return result.data


@router.get("/classes/{class_id}/export")
async def export_class_performance(
    class_id: UUID,
    teacher: FacultyUser,
    supabase: ServiceSupabase,
):
    """Export class performance data as CSV for SIS integration."""
    await verify_faculty_access(class_id, teacher.id, supabase)

    # Fetch student submissions and mastery
    res = await supabase.table("class_members").select("*, users(name, email)").eq("class_id", str(class_id)).execute()
    members = res.data or []

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Student Name", "Email", "Mastery Score", "Assignments Completed", "Avg Quiz Score"])

    for m in members:
        user = m.get("users", {})
        writer.writerow([
            user.get("name"),
            user.get("email"),
            m.get("mastery_score", 0),
            m.get("completed_count", 0),
            m.get("avg_quiz_score", 0)
        ])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=class_performance_{class_id}.csv"}
    )


@router.get("/department")
async def get_department_analytics(
    admin: FacultyUser,
    supabase: ServiceSupabase,
):
    """Aggregation of all classes across the department (Admin/Dept Head only)."""
    # Verify admin role
    if admin.role not in ("admin", "teacher"):
         raise HTTPException(status_code=403, detail="Access denied")

    # Aggregated stats across all classes
    res = await supabase.table("classes").select("id, name, subject, teacher_id, student_count:class_members(count)").execute()
    
    classes_data = res.data or []
    
    # Process counts
    processed_classes = []
    for c in classes_data:
        c["student_count"] = c.get("student_count", [{"count": 0}])[0]["count"]
        processed_classes.append(c)

    return {
        "department_wide": {
            "total_classes": len(processed_classes),
            "total_students": sum(c["student_count"] for c in processed_classes),
            "classes": processed_classes
        }
    }
