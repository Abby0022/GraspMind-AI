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
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from graspmind.api.deps import AuthUser, ServiceSupabase, TeacherUser, FacultyUser, get_service_supabase, get_user_supabase, verify_faculty_access, require_faculty
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
        raise HTTPException(status_code=500, detail="Failed to create course")
    
    # ── SECURITY: Audit Log ───────────────────────────────────────────
    try:
        await supabase.table("audit_logs").insert({
            "user_id": teacher.id,
            "event_type": "course_created",
            "action": f"POST /api/v1/classes",
            "metadata": {"class_id": result.data["id"], "name": result.data["name"]}
        }).execute()
    except Exception: pass

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


@router.post("/{class_id}/archive", response_model=ClassResponse)
async def archive_class(
    class_id: UUID,
    teacher: TeacherUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Archive a class (teacher only)."""
    result = await supabase.table("classes").update({"is_archived": True}).eq("id", str(class_id)).eq("teacher_id", teacher.id).select().single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Course not found")
        
    # ── SECURITY: Audit Log ───────────────────────────────────────────
    try:
        await supabase.table("audit_logs").insert({
            "user_id": teacher.id,
            "event_type": "course_archived",
            "action": f"POST /api/v1/classes/{class_id}/archive",
            "metadata": {"class_id": str(class_id)}
        }).execute()
    except Exception: pass

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
    """List members of a class (faculty only)."""
    await verify_faculty_access(class_id, teacher.id, supabase)
    
    # Use the RPC for detailed analytics or just fetch members
    result = await supabase.table("class_members").select("*, users(name, email)").eq("class_id", str(class_id)).execute()
    return result.data


@router.patch("/{class_id}/members/{student_id}")
async def update_member(
    class_id: UUID,
    student_id: UUID,
    teacher: FacultyUser,
    supabase: AsyncClient = Depends(get_service_supabase),
    section_id: UUID | None = None,
):
    """Update a class member (e.g. assign to a section)."""
    await verify_faculty_access(class_id, teacher.id, supabase)
    
    # Verify section belongs to class
    if section_id:
        sec = await supabase.table("course_sections").select("id").eq("id", str(section_id)).eq("class_id", str(class_id)).maybe_single().execute()
        if not sec.data:
            raise HTTPException(status_code=404, detail="Section not found in this course")

    result = await supabase.table("class_members").update({"section_id": str(section_id) if section_id else None}).eq("class_id", str(class_id)).eq("student_id", str(student_id)).execute()
    return result.data


@router.delete("/{class_id}/members/{student_id}")
async def remove_student(
    class_id: UUID,
    student_id: UUID,
    teacher: TeacherUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Remove a student from a class (faculty only)."""
    await verify_faculty_access(class_id, teacher.id, supabase)

    await supabase.table("class_members").delete().eq("class_id", str(class_id)).eq("student_id", str(student_id)).execute()
    return {"message": "Student removed"}


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

    # ── SECURITY: Audit Log ───────────────────────────────────────────
    try:
        await supabase.table("audit_logs").insert({
            "user_id": user.id,
            "event_type": "course_joined",
            "action": f"POST /api/v1/classes/join",
            "metadata": {"class_id": class_id, "name": cls.data["name"]}
        }).execute()
    except Exception: pass

    return {
        "class_id": class_id,
        "name": cls.data["name"],
        "subject": cls.data["subject"],
        "message": "Successfully joined the course",
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
        .select("id, name, subject, created_at, is_archived")
        .in_("id", class_ids)
        .eq("is_archived", False) # Students only see active classes
        .execute()
    )
    return result.data or []


@router.get("/{class_id}")
async def get_class(
    class_id: UUID,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Get class detail. Faculty sees everything, students see limited."""
    # 1. Try Faculty Access (Owner or Staff)
    is_faculty = False
    try:
        await verify_faculty_access(class_id, user.id, supabase)
        is_faculty = True
    except HTTPException:
        pass

    if is_faculty:
        result = await supabase.table("classes").select("*, course_sections(*)").eq("id", str(class_id)).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Course not found")
        return result.data

    # 2. Try Student Enrollment
    membership = await supabase.table("class_members").select("class_id").eq("class_id", str(class_id)).eq("student_id", user.id).maybe_single().execute()
    if not membership.data:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await supabase.table("classes").select("id, name, subject, teacher_id, is_archived").eq("id", str(class_id)).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Course not found")
    
    return result.data


# ── Course Sections ────────────────────────────────────────────────────────

class SectionCreate(BaseModel):
    name: str
    room: str | None = None
    schedule: str | None = None

@router.post("/{class_id}/sections", response_model=dict)
async def create_section(
    class_id: UUID,
    body: SectionCreate,
    teacher: FacultyUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Create a new course section (faculty only)."""
    await verify_faculty_access(class_id, teacher.id, supabase)
    
    data = {
        "class_id": str(class_id),
        "name": sanitize_text(body.name),
        "room": sanitize_text(body.room) if body.room else None,
        "schedule": sanitize_text(body.schedule) if body.schedule else None,
    }
    result = await supabase.table("course_sections").insert(data).select().single().execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create section")
    return result.data


@router.delete("/{class_id}/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_section(
    class_id: UUID,
    section_id: UUID,
    teacher: FacultyUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Delete a course section (faculty only)."""
    await verify_faculty_access(class_id, teacher.id, supabase)
    
    await supabase.table("course_sections").delete().eq("id", str(section_id)).eq("class_id", str(class_id)).execute()


@router.post("/{class_id}/clone", response_model=ClassResponse)
async def clone_class(
    class_id: UUID,
    teacher: FacultyUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Clone a course structure for a new semester (faculty only).
    
    Copies: Class info, Sections, Assignments.
    Does NOT copy: Members, Submissions.
    """
    await verify_faculty_access(class_id, teacher.id, supabase)

    # 1. Fetch source course
    source = await supabase.table("classes").select("*").eq("id", str(class_id)).single().execute()
    if not source.data:
        raise HTTPException(status_code=404, detail="Source course not found")
    
    source_data = source.data

    # 2. Create new course (The Clone)
    new_course_data = {
        "teacher_id": teacher.id,
        "name": f"{source_data['name']} (Copy)",
        "subject": source_data.get("subject"),
        "department": source_data.get("department"),
        "settings": source_data.get("settings", {}),
    }
    
    # Generate new invite code (handled by DB default)
    new_cls = await supabase.table("classes").insert(new_course_data).select().single().execute()
    if not new_cls.data:
        raise HTTPException(status_code=500, detail="Failed to create clone")
    
    new_class_id = new_cls.data["id"]

    # 3. Clone Sections
    sections = await supabase.table("course_sections").select("*").eq("class_id", str(class_id)).execute()
    if sections.data:
        new_sections = [
            {
                "class_id": new_class_id,
                "name": s["name"],
                "room": s.get("room"),
                "schedule": s.get("schedule")
            }
            for s in sections.data
        ]
        await supabase.table("course_sections").insert(new_sections).execute()

    # 4. Clone Assignments
    assignments = await supabase.table("assignments").select("*").eq("class_id", str(class_id)).execute()
    if assignments.data:
        new_assignments = [
            {
                "class_id": new_class_id,
                "notebook_id": a.get("notebook_id"),
                "title": a["title"],
                "description": a.get("description"),
                "type": a["type"],
                "due_date": None # Fresh start for due dates
            }
            for a in assignments.data
        ]
        await supabase.table("assignments").insert(new_assignments).execute()

    return new_cls.data
# ── Course Staff & Delegation ──────────────────────────────────────────────

@router.get("/{class_id}/staff")
async def list_course_staff(
    class_id: UUID,
    teacher: FacultyUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """List delegated faculty for this course (faculty only)."""
    await verify_faculty_access(class_id, teacher.id, supabase)
    
    result = await supabase.table("course_staff").select("*, users(name, email)").eq("class_id", str(class_id)).execute()
    return result.data


@router.post("/{class_id}/staff")
async def add_course_staff(
    class_id: UUID,
    email: str,
    teacher: FacultyUser,
    role: str = "ta",
    permissions: dict | None = None,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Invite a faculty member to the course staff (owner only)."""
    # 1. Verify caller is the owner
    await verify_faculty_access(class_id, teacher.id, supabase, require_owner=True)

    # 2. Find the user by email
    user_res = await supabase.table("users").select("id, role").eq("email", email).maybe_single().execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User with this email not found.")
    
    target_user = user_res.data
    if target_user["role"] == "student":
        raise HTTPException(status_code=400, detail="Cannot add a student to course staff.")

    # 3. Add to staff
    data = {
        "class_id": str(class_id),
        "user_id": target_user["id"],
        "role": role,
        "permissions": permissions or {
            "can_manage_roster": True,
            "can_manage_assignments": True,
            "can_archive": False
        }
    }
    
    result = await supabase.table("course_staff").upsert(data).select().single().execute()
    return result.data


@router.delete("/{class_id}/staff/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_course_staff(
    class_id: UUID,
    user_id: UUID,
    teacher: FacultyUser,
    supabase: AsyncClient = Depends(get_service_supabase),
):
    """Remove a faculty member from course staff (owner only)."""
    await verify_faculty_access(class_id, teacher.id, supabase, require_owner=True)
    
    await supabase.table("course_staff").delete().eq("class_id", str(class_id)).eq("user_id", str(user_id)).execute()
