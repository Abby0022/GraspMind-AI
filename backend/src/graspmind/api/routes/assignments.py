"""Assignments API routes — teacher portal.

Endpoints:
- POST   /classes/{class_id}/assignments              Create assignment (teacher only)
- GET    /classes/{class_id}/assignments              List assignments (teacher or enrolled student)
- GET    /assignments/{assignment_id}                 Get assignment detail
- PATCH  /assignments/{assignment_id}/submit          Student submits / marks done
- GET    /assignments/{assignment_id}/submissions     All submissions (teacher only)
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from graspmind.api.deps import AuthUser, ServiceSupabase, TeacherUser, get_service_supabase
from graspmind.models.schemas import AssignmentCreate, AssignmentResponse, SubmissionResponse, SubmissionUpdate
from graspmind.security.input_sanitizer import sanitize_text

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Teacher — Assignments"])


# ── Teacher: Create & View Assignments ─────────────────────────────────────

@router.post(
    "/classes/{class_id}/assignments",
    response_model=AssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_assignment(
    class_id: UUID,
    body: AssignmentCreate,
    teacher: TeacherUser,
    supabase: ServiceSupabase,
):
    """Create an assignment for a class (teacher only)."""
    # Verify teacher owns this class
    cls = (
        await supabase.table("classes")
        .select("id")
        .eq("id", str(class_id))
        .eq("teacher_id", teacher.id)
        .single()
        .execute()
    )
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    # If a notebook is linked, verify teacher owns it
    if body.notebook_id:
        nb = (
            await supabase.table("notebooks")
            .select("id")
            .eq("id", str(body.notebook_id))
            .eq("user_id", teacher.id)
            .single()
            .execute()
        )
        if not nb.data:
            raise HTTPException(status_code=404, detail="Notebook not found or not owned by you")

    data = {
        "class_id": str(class_id),
        "title": sanitize_text(body.title),
        "description": sanitize_text(body.description) if body.description else None,
        "type": body.type,
        "notebook_id": str(body.notebook_id) if body.notebook_id else None,
        "due_date": body.due_date.isoformat() if body.due_date else None,
    }

    result = await supabase.table("assignments").insert(data).select().single().execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment")
    return result.data


@router.get("/assignments/{assignment_id}/submissions")
async def list_submissions(
    assignment_id: UUID,
    teacher: TeacherUser,
    supabase: ServiceSupabase,
):
    """List all student submissions for an assignment (teacher only)."""
    # Verify the assignment belongs to one of this teacher's classes
    assignment = (
        await supabase.table("assignments")
        .select("id, class_id")
        .eq("id", str(assignment_id))
        .single()
        .execute()
    )
    if not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    cls = (
        await supabase.table("classes")
        .select("id")
        .eq("id", assignment.data["class_id"])
        .eq("teacher_id", teacher.id)
        .single()
        .execute()
    )
    if not cls.data:
        raise HTTPException(status_code=403, detail="Access denied")

    submissions = (
        await supabase.table("assignment_submissions")
        .select("*, users(name, email)")
        .eq("assignment_id", str(assignment_id))
        .execute()
    )
    return submissions.data or []


# ── Shared: List & View Assignments ────────────────────────────────────────

@router.get("/classes/{class_id}/assignments")
async def list_assignments(
    class_id: UUID,
    user: AuthUser,
    supabase: ServiceSupabase,
):
    """List assignments for a class.

    - Teachers see all assignments.
    - Students see assignments with their own submission status appended.
    Access denied if the user is neither the teacher nor an enrolled student.
    """
    cls = (
        await supabase.table("classes")
        .select("id, teacher_id")
        .eq("id", str(class_id))
        .single()
        .execute()
    )
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    is_teacher = cls.data["teacher_id"] == user.id
    if not is_teacher:
        membership = (
            await supabase.table("class_members")
            .select("class_id")
            .eq("class_id", str(class_id))
            .eq("student_id", user.id)
            .single()
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=403, detail="Access denied")

    assignments = (
        await supabase.table("assignments")
        .select("*")
        .eq("class_id", str(class_id))
        .order("due_date", desc=False, nulls_first=False)
        .execute()
    )

    if is_teacher or not assignments.data:
        return assignments.data or []

    # For students: attach their submission status to each assignment
    assignment_ids = [a["id"] for a in assignments.data]
    submissions = (
        await supabase.table("assignment_submissions")
        .select("assignment_id, status, score, submitted_at")
        .in_("assignment_id", assignment_ids)
        .eq("student_id", user.id)
        .execute()
    )
    sub_map = {s["assignment_id"]: s for s in (submissions.data or [])}

    return [
        {
            **a,
            "my_submission": sub_map.get(a["id"]),
        }
        for a in assignments.data
    ]


@router.get("/assignments/{assignment_id}")
async def get_assignment(
    assignment_id: UUID,
    user: AuthUser,
    supabase: ServiceSupabase,
):
    """Get assignment detail (teacher or enrolled student)."""
    assignment = (
        await supabase.table("assignments")
        .select("*")
        .eq("id", str(assignment_id))
        .single()
        .execute()
    )
    if not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    cls = (
        await supabase.table("classes")
        .select("teacher_id")
        .eq("id", assignment.data["class_id"])
        .single()
        .execute()
    )
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    is_teacher = cls.data["teacher_id"] == user.id
    if not is_teacher:
        membership = (
            await supabase.table("class_members")
            .select("class_id")
            .eq("class_id", assignment.data["class_id"])
            .eq("student_id", user.id)
            .single()
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=403, detail="Access denied")

    return assignment.data


# ── Student: Submit Assignment ─────────────────────────────────────────────

@router.patch("/assignments/{assignment_id}/submit", response_model=SubmissionResponse)
async def submit_assignment(
    assignment_id: UUID,
    body: SubmissionUpdate,
    user: AuthUser,
    supabase: ServiceSupabase,
):
    """Student marks an assignment as submitted (or updates progress).

    Upserts into assignment_submissions. Idempotent — calling again with
    status='submitted' is a no-op that returns the existing record.
    """
    # Verify student is enrolled in the class this assignment belongs to
    assignment = (
        await supabase.table("assignments")
        .select("id, class_id")
        .eq("id", str(assignment_id))
        .single()
        .execute()
    )
    if not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    membership = (
        await supabase.table("class_members")
        .select("class_id")
        .eq("class_id", assignment.data["class_id"])
        .eq("student_id", user.id)
        .single()
        .execute()
    )
    if not membership.data:
        raise HTTPException(status_code=403, detail="You are not enrolled in this class")

    now_iso = datetime.now(UTC).isoformat() if body.status == "submitted" else None

    record = {
        "assignment_id": str(assignment_id),
        "student_id": user.id,
        "status": body.status,
        "score": body.score,
        "submitted_at": now_iso,
    }

    result = (
        await supabase.table("assignment_submissions")
        .upsert(record, on_conflict="assignment_id,student_id")
        .select()
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save submission")
    return result.data
