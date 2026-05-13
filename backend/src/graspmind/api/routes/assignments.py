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

from graspmind.api.deps import AuthUser, ServiceSupabase, TeacherUser, get_service_supabase, verify_faculty_access
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
    # ── SECURITY: Verify Faculty Access (Owner or TA) ─────────────────
    await verify_faculty_access(class_id, teacher.id, supabase)

    # Fetch course name for the notification message
    cls_res = await supabase.table("classes").select("name").eq("id", str(class_id)).single().execute()
    course_name = cls_res.data.get("name", "your course") if cls_res.data else "your course"

    # If a notebook is linked, verify access
    if body.notebook_id:
        # Check ownership or share
        nb = await supabase.table("notebooks").select("id, user_id").eq("id", str(body.notebook_id)).maybe_single().execute()
        if not nb.data:
            raise HTTPException(status_code=404, detail="Notebook not found")
        
        # If not the owner, check if it's shared with this faculty member
        if nb.data["user_id"] != teacher.id:
            share = await supabase.table("notebook_shares").select("id").eq("notebook_id", str(body.notebook_id)).eq("user_id", teacher.id).maybe_single().execute()
            if not share.data:
                raise HTTPException(status_code=403, detail="You do not have access to this notebook to assign it.")

    data = {
        "class_id": str(class_id),
        "title": sanitize_text(body.title),
        "description": sanitize_text(body.description) if body.description else None,
        "type": body.type,
        "notebook_id": str(body.notebook_id) if body.notebook_id else None,
        "due_date": body.due_date.isoformat() if body.due_date else None,
        "is_proctored": body.is_proctored,
        "time_limit_mins": body.time_limit_mins,
        "require_fullscreen": body.require_fullscreen,
    }

    result = await supabase.table("assignments").insert(data).select().single().execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment")
    
    assignment = result.data
    
    # ── BROADCAST: Notify Class Members ──────────────────────────────
    try:
        # 1. Fetch all members
        members = await supabase.table("class_members").select("student_id").eq("class_id", str(class_id)).execute()
        student_ids = [m["student_id"] for m in (members.data or [])]
        
        if student_ids:
            # 2. Prepare notifications
            # Link to the class page or specifically to the notebook if it's a read task
            link = f"/classes"
            if assignment.get("notebook_id"):
                link = f"/dashboard?notebook={assignment['notebook_id']}"
                
            notifications = [
                {
                    "user_id": sid,
                    "title": f"New Assignment: {assignment['title']}",
                    "message": f"A new {assignment['type']} assignment has been posted in {course_name}.",
                    "type": "assignment",
                    "link": link,
                    "assignment_id": str(assignment["id"]),
                    "class_id": str(class_id),
                }
                for sid in student_ids
            ]
            
            # 3. Batch insert
            await supabase.table("notifications").insert(notifications).execute()
            logger.info("Broadcasted notification for assignment %s to %d students", assignment["id"], len(student_ids))
            
    except Exception as exc:
        # Don't fail the assignment creation if notification fails
        logger.warning("Failed to broadcast assignment notification: %s", exc)

    # ── SECURITY: Audit Log ───────────────────────────────────────────
    try:
        await supabase.table("audit_logs").insert({
            "user_id": teacher.id,
            "event_type": "assignment_created",
            "action": f"POST /api/v1/classes/{class_id}/assignments",
            "metadata": {"assignment_id": assignment["id"], "class_id": str(class_id)}
        }).execute()
    except Exception: pass

    return assignment


@router.get("/assignments/{assignment_id}/submissions")
async def list_submissions(
    assignment_id: UUID,
    teacher: TeacherUser,
    supabase: ServiceSupabase,
):
    """List all submissions for an assignment (faculty only)."""
    # 1. Get assignment and class_id
    a_res = await supabase.table("assignments").select("class_id").eq("id", str(assignment_id)).single().execute()
    if not a_res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # 2. Verify faculty access to that class
    await verify_faculty_access(a_res.data["class_id"], teacher.id, supabase)

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
        .select("id, teacher_id, is_archived")
        .eq("id", str(class_id))
        .single()
        .execute()
    )
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    is_teacher = cls.data["teacher_id"] == user.id
    if not is_teacher:
        if cls.data.get("is_archived"):
            raise HTTPException(status_code=403, detail="This class has been archived")
        
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
        .order("due_date", desc=False)
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
        .select("teacher_id, is_archived")
        .eq("id", assignment.data["class_id"])
        .single()
        .execute()
    )
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    is_teacher = cls.data["teacher_id"] == user.id
    if not is_teacher:
        if cls.data.get("is_archived"):
            raise HTTPException(status_code=403, detail="This class has been archived")
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

    # Verify class is not archived
    cls = await supabase.table("classes").select("is_archived").eq("id", assignment.data["class_id"]).single().execute()
    if cls.data and cls.data.get("is_archived"):
        raise HTTPException(status_code=403, detail="Cannot submit work to an archived class")

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
        "focus_lost_count": body.focus_lost_count,
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


@router.post("/submissions/{submission_id}/alert")
async def record_integrity_alert_api(
    submission_id: UUID,
    event_type: str,
    user: AuthUser,
    supabase: ServiceSupabase,
    metadata: dict | None = None,
):
    """Record an integrity alert (e.g. tab switch) during a proctored assessment."""
    # Verify submission belongs to user
    sub = await supabase.table("assignment_submissions").select("student_id").eq("id", str(submission_id)).single().execute()
    if not sub.data or sub.data["student_id"] != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Call RPC function to log and update counters
    await supabase.rpc("record_integrity_alert", {
        "p_submission_id": str(submission_id),
        "p_event_type": event_type,
        "p_metadata": metadata or {}
    }).execute()
    
    return {"status": "recorded"}
