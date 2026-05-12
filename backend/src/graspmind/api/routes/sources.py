"""Source management routes — upload, list, get, delete.

Handles file uploads with MIME validation, size limits, and
async processing via FastAPI BackgroundTasks.
"""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from supabase import AsyncClient

from graspmind.api.deps import AuthUser, get_user_supabase
from graspmind.models.schemas import SourceResponse
from graspmind.parsers import ALLOWED_MIME_TYPES, MAX_FILE_SIZE, detect_source_type
from graspmind.security.input_sanitizer import sanitize_filename, sanitize_text
from graspmind.security.rate_limiter import RateLimiter

router = APIRouter(prefix="/notebooks/{notebook_id}/sources", tags=["Sources"])


async def _verify_notebook_ownership(
    notebook_id: str, user_id: str, supabase: AsyncClient
) -> None:
    """Verify the notebook belongs to the current user or is shared with them."""
    # 1. Check direct ownership
    result = (
        await supabase.table("notebooks")
        .select("user_id")
        .eq("id", notebook_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notebook not found",
        )

    if result.data[0]["user_id"] == user_id:
        return

    # 2. Check if shared with user
    share_result = (
        await supabase.table("notebook_shares")
        .select("id")
        .eq("notebook_id", notebook_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not share_result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this notebook",
        )


class IngestTextRequest(BaseModel):
    title: str = "Web Snippet"
    content: str


@router.post(
    "/upload",
    response_model=SourceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(max_requests=10, window_seconds=60))],
)
async def upload_source(
    notebook_id: str,
    user: AuthUser,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Upload a document source to a notebook.

    Validates file type and size, stores in Supabase Storage,
    and kicks off ingestion as a FastAPI BackgroundTask.
    """
    await _verify_notebook_ownership(notebook_id, user.id, supabase)

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {content_type}. Allowed: {', '.join(ALLOWED_MIME_TYPES.values())}",
        )

    # Read file and check size
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB.",
        )

    # Sanitize filename and detect type
    safe_name = sanitize_filename(file.filename)
    source_type = detect_source_type(safe_name)
    if not source_type:
        raise HTTPException(status_code=400, detail="Cannot detect file type")

    # Upload to Supabase Storage
    storage_path = f"{user.id}/{notebook_id}/{uuid.uuid4().hex}_{safe_name}"
    try:
        await supabase.storage.from_("sources").upload(
            storage_path,
            file_bytes,
            file_options={"content-type": content_type},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file: {exc}",
        ) from exc

    # Create source record in database
    source_data = {
        "notebook_id": notebook_id,
        "title": safe_name,
        "type": source_type,
        "file_path": storage_path,
        "status": "pending",
        "metadata": {
            "original_name": file.filename,
            "content_type": content_type,
            "file_size": len(file_bytes),
        },
    }

    result = await supabase.table("sources").insert(source_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create source record")

    source = result.data[0]

    # Kick off ingestion as a background task (no separate worker needed)
    background_tasks.add_task(
        _run_ingestion,
        source_id=source["id"],
        notebook_id=notebook_id,
        user_id=user.id,
        file_path=storage_path,
        file_name=safe_name,
    )

    return source


@router.post(
    "/ingest-text",
    response_model=SourceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(max_requests=10, window_seconds=60))],
)
async def ingest_text(
    notebook_id: str,
    body: IngestTextRequest,
    user: AuthUser,
    background_tasks: BackgroundTasks,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Ingest raw text directly (e.g., from bookmarklet)."""
    await _verify_notebook_ownership(notebook_id, user.id, supabase)

    # Sanitize content before uploading as text file
    safe_content = sanitize_text(body.content)
    file_bytes = safe_content.encode("utf-8")
    safe_name = sanitize_filename(body.title)
    if not (safe_name.endswith(".txt") or safe_name.endswith(".md")):
        safe_name += ".txt"

    # Upload to Supabase Storage
    storage_path = f"{user.id}/{notebook_id}/{uuid.uuid4().hex}_{safe_name}"
    try:
        await supabase.storage.from_("sources").upload(
            storage_path,
            file_bytes,
            file_options={"content-type": "text/plain"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload text: {exc}",
        ) from exc

    # Create source record
    source_data = {
        "notebook_id": notebook_id,
        "title": safe_name,
        "type": "markdown",
        "file_path": storage_path,
        "status": "pending",
        "metadata": {
            "original_name": safe_name,
            "content_type": "text/plain",
            "file_size": len(file_bytes),
            "source": "bookmarklet",
        },
    }

    result = await supabase.table("sources").insert(source_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create source record")

    source = result.data[0]

    # Kick off ingestion
    background_tasks.add_task(
        _run_ingestion,
        source_id=source["id"],
        notebook_id=notebook_id,
        user_id=user.id,
        file_path=storage_path,
        file_name=safe_name,
    )

    return source


def _run_ingestion(
    source_id: str,
    notebook_id: str,
    user_id: str,
    file_path: str,
    file_name: str,
) -> None:
    """Run document ingestion synchronously in a background thread."""
    import asyncio
    import logging
    logger = logging.getLogger(__name__)
    try:
        from graspmind.workers.ingestion import ingest_document
        # ingest_document is an async function — run it in a new event loop
        asyncio.run(ingest_document(
            source_id=source_id,
            notebook_id=notebook_id,
            user_id=user_id,
            file_path=file_path,
            file_name=file_name,
        ))
    except Exception as exc:
        logger.exception("Background ingestion failed for source %s: %s", source_id, exc)


@router.get("/", response_model=list[SourceResponse])
async def list_sources(
    notebook_id: str,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """List all sources in a notebook."""
    await _verify_notebook_ownership(notebook_id, user.id, supabase)

    result = (
        await supabase.table("sources")
        .select("*")
        .eq("notebook_id", notebook_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{source_id}", response_model=SourceResponse)
async def get_source(
    notebook_id: str,
    source_id: str,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Get a specific source."""
    await _verify_notebook_ownership(notebook_id, user.id, supabase)

    result = (
        await supabase.table("sources")
        .select("*")
        .eq("id", source_id)
        .eq("notebook_id", notebook_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Source not found")
    return result.data[0]


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    notebook_id: str,
    source_id: str,
    user: AuthUser,
    supabase: AsyncClient = Depends(get_user_supabase),
):
    """Delete a source and its storage file."""
    await _verify_notebook_ownership(notebook_id, user.id, supabase)

    # Get source to find storage path
    source_result = (
        await supabase.table("sources")
        .select("file_path")
        .eq("id", source_id)
        .eq("notebook_id", notebook_id)
        .execute()
    )

    if not source_result.data:
        raise HTTPException(status_code=404, detail="Source not found")

    # Delete from storage
    file_path = source_result.data[0].get("file_path")
    if file_path:
        try:
            await supabase.storage.from_("sources").remove([file_path])
        except Exception:
            pass  # Best-effort storage cleanup

    # Delete from database (cascades to chunks)
    await supabase.table("sources").delete().eq("id", source_id).execute()
