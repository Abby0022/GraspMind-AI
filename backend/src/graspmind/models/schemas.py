from __future__ import annotations
"""Pydantic v2 schemas for request/response validation.

All API inputs are validated through these schemas. Strict mode
is used where possible to prevent type coercion attacks.
"""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# ── Auth Schemas ─────────────────────────────────────────────


class SignupRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(min_length=1, max_length=100)
    # Present only when requesting teacher role; validated server-side against
    # TEACHER_INVITE_CODE env var. Absent or None → student account.
    teacher_code: str | None = Field(default=None, max_length=64)


class LoginRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    user: UserResponse | None = None
    verification_required: bool = False


class TokenRefreshRequest(BaseModel):
    refresh_token: str


# ── User Schemas ─────────────────────────────────────────────


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: str
    role: str
    created_at: datetime


# ── Notebook Schemas ─────────────────────────────────────────


class NotebookCreate(BaseModel):
    model_config = ConfigDict(strict=True)

    title: str = Field(min_length=1, max_length=200)
    subject: str | None = Field(default=None, max_length=100)
    color: str = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")
    exam_date: date | None = None


class NotebookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    subject: str | None = Field(default=None, max_length=100)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    exam_date: date | None = None


class NotebookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: str
    subject: str | None
    color: str
    exam_date: date | None
    created_at: datetime
    updated_at: datetime


# ── Source Schemas ────────────────────────────────────────────

ALLOWED_SOURCE_TYPES = ("pdf", "docx", "pptx", "audio", "youtube", "web", "markdown", "image")


class SourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    notebook_id: UUID
    title: str
    type: str
    status: str
    metadata: dict
    created_at: datetime


# ── Chat Schemas ─────────────────────────────────────────────


class ChatMessage(BaseModel):
    model_config = ConfigDict(strict=True)

    content: str = Field(min_length=1, max_length=5000)
    notebook_id: UUID


class ChatResponse(BaseModel):
    content: str
    citations: list[dict] = []


# ── Common ───────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str


class ErrorResponse(BaseModel):
    detail: str


# ── Teacher Portal Schemas ────────────────────────────────────


class ClassCreate(BaseModel):
    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=1, max_length=120)
    subject: str | None = Field(default=None, max_length=100)


class ClassUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    subject: str | None = Field(default=None, max_length=100)
    is_archived: bool | None = None


class ClassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    teacher_id: UUID
    name: str
    subject: str | None
    invite_code: str
    is_archived: bool
    created_at: datetime


class JoinClassRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    invite_code: str = Field(
        min_length=1,
        max_length=20,
        description="Invite code shown on the class overview page",
    )


class AssignmentCreate(BaseModel):
    model_config = ConfigDict(strict=True)

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    type: Literal["read", "quiz", "flashcard"]
    notebook_id: UUID | None = None
    due_date: datetime | None = None
    is_proctored: bool = False
    time_limit_mins: int | None = Field(default=None, ge=1, le=240)
    require_fullscreen: bool = False


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    class_id: UUID
    notebook_id: UUID | None
    title: str
    description: str | None
    type: str
    due_date: datetime | None
    is_proctored: bool
    time_limit_mins: int | None
    require_fullscreen: bool
    created_at: datetime


class SubmissionUpdate(BaseModel):
    model_config = ConfigDict(strict=True)

    status: str = Field(pattern=r"^(pending|in_progress|submitted)$")
    score: float | None = Field(default=None, ge=0, le=100)
    focus_lost_count: int | None = 0


class SubmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    assignment_id: UUID
    student_id: UUID
    status: str
    score: float | None
    focus_lost_count: int
    submitted_at: datetime | None


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: str
    message: str
    type: str
    link: str | None = None
    is_read: bool
    created_at: datetime
