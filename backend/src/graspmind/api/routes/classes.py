"""Classes API routes — teacher portal.

Endpoints:
- POST   /classes                            Create a class (teacher only)
- GET    /classes                            List own classes (teacher) or joined (student)
- GET    /classes/{class_id}                 Class detail
- PATCH  /classes/{class_id}                 Update class (teacher only)
- DELETE /classes/{class_id}                 Delete class (teacher only)
- POST   /classes/join                       Join a class via invite code (student, rate-limited)
- GET    /classes/{class_id}/members         Member list + mastery (teacher only)
- DELETE /classes/{class_id}/members/{sid}   Remove a student (teacher only)
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from graspmind.api.deps import AuthUser, ServiceSupabase, TeacherUser, get_service_supabase, get_user_supabase
from graspmind.models.schemas import ClassCreate, ClassResponse, ClassUpdate, JoinClassRequest
from graspmind.security.input_sanitizer import sanitize_text
from graspmind.security.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/classes", tags=["Teacher — Classes"])


# ── Teacher: Create / Manage Classes ───────────────────────────────────────

@router.post("/", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
async def create_class(
    body: ClassCreate,
    teacher: TeacherUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Create a new class. Restricted to users with role='teacher'."""
    data = {
        "teacher_id": teacher.id,
        "name": sanitize_text(body.name),
        "subject": sanitize_text(body.subject) if body.subject else None,
    }
    result = await supabase.table("classes").insert(data).select().single().execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create class")
    return result.data


@router.patch("/{class_id}", response_model=ClassResponse)
async def update_class(
    class_id: UUID,
    body: ClassUpdate,
    teacher: TeacherUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Update class name or subject (teacher only)."""
    update_data = body.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"]:
        update_data["name"] = sanitize_text(update_data["name"])
    if "subject" in update_data and update_data["subject"]:
        update_data["subject"] = sanitize_text(update_data["subject"])

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        await supabase.table("classes")
        .update(update_data)
        .eq("id", str(class_id))
        .eq("teacher_id", teacher.id)
        .select()
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Class not found")
    return result.data


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: UUID,
    teacher: TeacherUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Delete a class and all associated data (teacher only)."""
    result = (
        await supabase.table("classes")
        .delete()
        .eq("id", str(class_id))
        .eq("teacher_id", teacher.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Class not found")


@router.get("/{class_id}/members")
async def list_class_members(
    class_id: UUID,
    teacher: TeacherUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """List all enrolled students with mastery snapshots (teacher only)."""
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

    members = (
        await supabase.table("class_members")
        .select("student_id, joined_at, users(id, name, email)")
        .eq("class_id", str(class_id))
        .execute()
    )

    student_ids = [m["student_id"] for m in (members.data or [])]
    mastery_map: dict[str, float] = {}

    if student_ids:
        knowledge = (
            await supabase.table("student_knowledge")
            .select("user_id, mastery_score")
            .in_("user_id", student_ids)
            .execute()
        )
        # Average mastery per student
        from collections import defaultdict
        buckets: dict[str, list[float]] = defaultdict(list)
        for row in (knowledge.data or []):
            buckets[row["user_id"]].append(row["mastery_score"] or 0)
        mastery_map = {uid: round(sum(v) / len(v), 3) for uid, v in buckets.items()}

    return [
        {
            "student_id": m["student_id"],
            "joined_at": m["joined_at"],
            "name": (m.get("users") or {}).get("name", ""),
            "email": (m.get("users") or {}).get("email", ""),
            "avg_mastery": mastery_map.get(m["student_id"], 0.0),
        }
        for m in (members.data or [])
    ]


@router.delete("/{class_id}/members/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_class_member(
    class_id: UUID,
    student_id: UUID,
    teacher: TeacherUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Remove a student from a class (teacher only)."""
    # Verify class ownership before deleting member
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

    await (
        supabase.table("class_members")
        .delete()
        .eq("class_id", str(class_id))
        .eq("student_id", str(student_id))
        .execute()
    )


# ── Student: Join a Class ──────────────────────────────────────────────────

@router.post(
    "/join",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(max_requests=10, window_seconds=60))],
)
async def join_class(
    body: JoinClassRequest,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Join a class using an invite code (student-facing, rate-limited).

    Rate limited to 10 attempts/min to prevent brute-force enumeration
    of valid invite codes.
    """
    # Look up class by invite code
    cls = (
        await supabase.table("classes")
        .select("id, name, subject, teacher_id")
        .eq("invite_code", body.invite_code)
        .single()
        .execute()
    )
    if not cls.data:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    # Prevent teacher from joining their own class as a student
    if cls.data["teacher_id"] == user.id:
        raise HTTPException(status_code=400, detail="Teachers cannot join their own class")

    class_id = cls.data["id"]

    # Upsert membership (idempotent — re-joining is a no-op)
    await (
        supabase.table("class_members")
        .upsert(
            {"class_id": class_id, "student_id": user.id},
            on_conflict="class_id,student_id",
        )
        .execute()
    )

    return {
        "class_id": class_id,
        "name": cls.data["name"],
        "subject": cls.data["subject"],
        "message": "Successfully joined the class",
    }


# ── Shared: List Classes ───────────────────────────────────────────────────

@router.get("/")
async def list_classes(
    user: AuthUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """List classes.

    - Teachers see classes they own.
    - Students see classes they have joined.
    """
    # Determine role from DB
    profile = (
        await supabase.table("users")
        .select("role")
        .eq("id", user.id)
        .single()
        .execute()
    )
    role = profile.data.get("role", "student") if profile.data else "student"

    if role == "teacher":
        result = (
            await supabase.table("classes")
            .select("*")
            .eq("teacher_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    # Student: get joined class_ids then fetch class details
    memberships = (
        await supabase.table("class_members")
        .select("class_id, joined_at")
        .eq("student_id", user.id)
        .execute()
    )
    class_ids = [m["class_id"] for m in (memberships.data or [])]
    if not class_ids:
        return []

    result = (
        await supabase.table("classes")
        .select("id, name, subject, created_at")
        .in_("id", class_ids)
        .execute()
    )
    return result.data or []


@router.get("/{class_id}")
async def get_class(
    class_id: UUID,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Get class detail. Accessible to the teacher owner and enrolled students."""
    cls = (
        await supabase.table("classes")
        .select("*")
        .eq("id", str(class_id))
        .single()
        .execute()
    )
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    is_teacher = cls.data["teacher_id"] == user.id
    if not is_teacher:
        # Verify student is a member
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

        # Hide invite code from students
        cls.data.pop("invite_code", None)

    return cls.data
