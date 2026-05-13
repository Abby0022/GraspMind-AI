"""Notebook CRUD routes + AI generation (Summary, Mind Map).

All operations are scoped to the authenticated user via the
AuthUser dependency. Supabase RLS provides an additional layer
of data isolation at the database level.
"""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import AsyncClient

from graspmind.api.deps import AuthUser, get_user_supabase
from graspmind.memory.semantic import get_cross_links
from graspmind.models.schemas import NotebookCreate, NotebookResponse, NotebookUpdate
from graspmind.rag.llm_client import complete_chat
from graspmind.security.input_sanitizer import sanitize_text
from graspmind.security.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notebooks", tags=["Notebooks"])


class ShareRequest(BaseModel):
    email: str
    role: str = "viewer"


@router.get("/", response_model=list[NotebookResponse])
async def list_notebooks(
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """List all notebooks (owned and shared)."""
    # Get owned notebooks
    owned = await supabase.table("notebooks").select("*").eq("user_id", user.id).execute()

    # Get shared notebooks
    shares = await supabase.table("notebook_shares").select("notebook_id").eq("user_id", user.id).execute()
    shared_ids = [s["notebook_id"] for s in shares.data]

    shared = []
    if shared_ids:
        shared_nb = await supabase.table("notebooks").select("*").in_("id", shared_ids).execute()
        shared = shared_nb.data

    return owned.data + shared


@router.post("/", response_model=NotebookResponse, status_code=status.HTTP_201_CREATED)
async def create_notebook(
    body: NotebookCreate,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Create a new study notebook."""
    data = {
        "user_id": user.id,
        "title": sanitize_text(body.title),
        "subject": sanitize_text(body.subject) if body.subject else None,
        "color": body.color,
        "exam_date": body.exam_date.isoformat() if body.exam_date else None,
    }
    result = await supabase.table("notebooks").insert(data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create notebook",
        )
    return result.data[0]


@router.get("/{notebook_id}", response_model=NotebookResponse)
async def get_notebook(
    notebook_id: UUID,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Get a specific notebook by ID (must belong to or be shared with current user)."""
    # Try owner check first
    nb = await supabase.table("notebooks").select("*").eq("id", str(notebook_id)).single().execute()
    if not nb.data:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if nb.data["user_id"] == user.id:
        return nb.data

    # Try share check
    share = await supabase.table("notebook_shares").select("role").eq("notebook_id", str(notebook_id)).eq("user_id", user.id).single().execute()
    if share.data:
        return nb.data

    # ── NEW: Try Class Assignment Check (Course Material) ────────────
    # Check if this notebook is assigned in any of the user's active classes
    assigned = await supabase.table("assignments").select("class_id").eq("notebook_id", str(notebook_id)).execute()
    if assigned.data:
        class_ids = [a["class_id"] for a in assigned.data]
        # Verify the student is in one of these classes and it's not archived
        active_classes = await supabase.table("classes").select("id").in_("id", class_ids).eq("is_archived", False).execute()
        active_ids = [c["id"] for c in (active_classes.data or [])]
        if active_ids:
            membership = (
                await supabase.table("class_members")
                .select("class_id")
                .in_("class_id", active_ids)
                .eq("student_id", user.id)
                .execute()
            )
            if membership.data:
                return nb.data

    raise HTTPException(status_code=403, detail="Access denied")


@router.patch("/{notebook_id}", response_model=NotebookResponse)
async def update_notebook(
    notebook_id: UUID,
    body: NotebookUpdate,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Update a notebook's metadata."""
    update_data = body.model_dump(exclude_unset=True)
    if "title" in update_data and update_data["title"]:
        update_data["title"] = sanitize_text(update_data["title"])
    if "subject" in update_data and update_data["subject"]:
        update_data["subject"] = sanitize_text(update_data["subject"])

    if "exam_date" in update_data and update_data["exam_date"] is not None:
        update_data["exam_date"] = update_data["exam_date"].isoformat()

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    result = (
        await supabase.table("notebooks")
        .update(update_data)
        .eq("id", str(notebook_id))
        .eq("user_id", user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notebook not found",
        )
    return result.data[0]


@router.delete("/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notebook(
    notebook_id: UUID,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Delete a notebook and all associated data (cascades via FK)."""
    result = (
        await supabase.table("notebooks")
        .delete()
        .eq("id", str(notebook_id))
        .eq("user_id", user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notebook not found",
        )

    # ── PRIVACY: Cleanup Vectors ─────────────────────────────────────
    try:
        from graspmind.rag.vector_store import delete_notebook_vectors
        await delete_notebook_vectors(user_id=user.id, notebook_id=str(notebook_id))
    except Exception as exc:
        logger.error("Failed to delete vectors for notebook %s: %s", notebook_id, exc)



@router.post("/{notebook_id}/share")
async def share_notebook(
    notebook_id: str,
    body: ShareRequest,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Share a notebook with another user by email."""
    # Only owner can share
    nb = await supabase.table("notebooks").select("user_id").eq("id", notebook_id).single().execute()
    if not nb.data or nb.data["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can share this notebook")

    # Find user by email
    target_user = await supabase.table("profiles").select("id").eq("email", body.email).single().execute()
    if not target_user.data:
        raise HTTPException(status_code=404, detail="User not found with this email")

    target_id = target_user.data["id"]

    # Create share record
    share_data = {
        "notebook_id": notebook_id,
        "user_id": target_id,
        "role": body.role,
    }
    await supabase.table("notebook_shares").upsert(share_data, on_conflict="notebook_id,user_id").execute()

    return {"status": "success", "shared_with": body.email}


@router.get("/{notebook_id}/shares")
async def list_notebook_shares(
    notebook_id: str,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """List users this notebook is shared with."""
    # Verify owner
    nb = await supabase.table("notebooks").select("user_id").eq("id", notebook_id).single().execute()
    if not nb.data or nb.data["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can view shares")

    shares = await supabase.table("notebook_shares").select("role, user_id, profiles(email)").eq("notebook_id", notebook_id).execute()
    return shares.data


@router.get("/{notebook_id}/related-concepts")
async def get_related_notebook_concepts(
    notebook_id: str,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Find concepts in other notebooks related to this one."""
    links = await get_cross_links(user.id, notebook_id)
    if not links:
        return []

    # Fetch notebook titles for the related concepts
    other_nb_ids = list(set(l.notebook_id for l in links if l.notebook_id))
    if not other_nb_ids:
        # If no notebook_ids were stored with the nodes, we just return the concepts
        return [
            {
                "concept": l.concept,
                "mastery": l.mastery,
                "notebook_id": None,
                "notebook_title": "Other Subject",
            }
            for l in links
        ]

    nb_result = await supabase.table("notebooks").select("id, title").in_("id", other_nb_ids).execute()
    nb_map = {nb["id"]: nb["title"] for nb in nb_result.data}

    return [
        {
            "concept": l.concept,
            "mastery": l.mastery,
            "notebook_id": l.notebook_id,
            "notebook_title": nb_map.get(l.notebook_id, "Other Subject"),
        }
        for l in links
    ]


# ── AI Generation Endpoints ─────────────────────────────────

async def _get_notebook_chunks(notebook_id: str, user_id: str, supabase, limit: int = 25) -> list[str]:
    """Fetch text chunks for a notebook's ready sources."""
    sources = await supabase.table("sources").select("id").eq(
        "notebook_id", notebook_id
    ).eq("status", "ready").execute()

    if not sources.data:
        return []

    source_ids = [s["id"] for s in sources.data]
    chunks = await supabase.table("chunks").select("content").in_(
        "source_id", source_ids
    ).eq("chunk_type", "parent").limit(limit).execute()

    return [c["content"] for c in (chunks.data or [])]


@router.post(
    "/{notebook_id}/summary/generate",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=60))],
)
async def generate_summary(
    notebook_id: str,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Generate a structured study summary from notebook sources."""
    # Verify ownership
    nb = await supabase.table("notebooks").select("id, title").eq(
        "id", notebook_id
    ).eq("user_id", user.id).single().execute()
    if not nb.data:
        raise HTTPException(status_code=404, detail="Notebook not found")

    chunks = await _get_notebook_chunks(notebook_id, user.id, supabase)
    if not chunks:
        raise HTTPException(status_code=400, detail="No ready sources found. Upload and process documents first.")

    # Limit to 8 chunks (~4k tokens) to stay safely within free-tier API rate limits (12k TPM)
    context = "\n\n---\n\n".join(chunks[:8])

    prompt = f"""You are an expert study assistant. Analyze the following study material and produce a structured summary.

STUDY MATERIAL:
{context}

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{{
  "overview": "2-3 sentence paragraph summarising the entire material",
  "key_concepts": ["concept 1", "concept 2", "concept 3", "...up to 8 concepts"],
  "key_terms": [
    {{"term": "Term Name", "definition": "Clear, concise definition"}},
    ...up to 10 terms
  ],
  "takeaways": ["Most important point 1", "Most important point 2", "...up to 5 takeaways"]
}}"""

    try:
        raw = await complete_chat([
            {"role": "system", "content": "You are a study assistant. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ], user_id=user.id)

        if "[Error" in raw or "RATE_LIMIT" in raw:
            raise HTTPException(status_code=429, detail="AI API rate limit exceeded. Please wait a moment and try again.")

        # Strip markdown fences if present
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(clean)

        return {
            "notebook_title": nb.data["title"],
            "overview": data.get("overview", ""),
            "key_concepts": data.get("key_concepts", []),
            "key_terms": data.get("key_terms", []),
            "takeaways": data.get("takeaways", []),
        }
    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Summary generation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate summary. Please try again.")


@router.post(
    "/{notebook_id}/mindmap/generate",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=60))],
)
async def generate_mindmap(
    notebook_id: str,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Generate a mind map (concept graph) from notebook sources."""
    nb = await supabase.table("notebooks").select("id, title").eq(
        "id", notebook_id
    ).eq("user_id", user.id).single().execute()
    if not nb.data:
        raise HTTPException(status_code=404, detail="Notebook not found")

    # Limit to 6 chunks (~3k tokens) to stay safely within API limits
    chunks = await _get_notebook_chunks(notebook_id, user.id, supabase, limit=8)
    if not chunks:
        raise HTTPException(status_code=400, detail="No ready sources found. Upload and process documents first.")

    context = "\n\n---\n\n".join(chunks[:6])

    prompt = f"""You are an expert at extracting knowledge graphs from study material.

STUDY MATERIAL:
{context}

Extract the key concepts and their relationships to build a mind map.

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{{
  "nodes": [
    {{"id": "n1", "label": "Central Topic", "group": "main"}},
    {{"id": "n2", "label": "Key Concept A", "group": "concept"}},
    {{"id": "n3", "label": "Sub-concept", "group": "detail"}}
  ],
  "edges": [
    {{"source": "n1", "target": "n2", "label": "includes"}},
    {{"source": "n2", "target": "n3", "label": "leads to"}}
  ]
}}

Rules:
- 8-16 nodes total
- First node (n1) should be the central topic of the material
- Groups: "main" (1 node), "concept" (key ideas, 3-6 nodes), "detail" (supporting points, rest)
- Edge labels should be short relationship verbs (includes, causes, requires, leads to, etc.)
- No duplicate node IDs"""

    try:
        raw = await complete_chat([
            {"role": "system", "content": "You are a knowledge graph extractor. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ], user_id=user.id)

        if "[Error" in raw or "RATE_LIMIT" in raw:
            raise HTTPException(status_code=429, detail="AI API rate limit exceeded. Please wait a moment and try again.")

        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(clean)

        return {
            "notebook_title": nb.data["title"],
            "nodes": data.get("nodes", []),
            "edges": data.get("edges", []),
        }
    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Mind map generation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate mind map. Please try again.")
