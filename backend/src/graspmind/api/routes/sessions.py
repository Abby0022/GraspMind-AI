"""Session management routes — create, list, get history.

Handles chat session lifecycle and working memory access.
"""

from fastapi import APIRouter, Depends, HTTPException

from graspmind.api.deps import AuthUser, get_user_supabase
from graspmind.memory.working import (
    clear_session,
    create_session,
    get_full_history,
    get_session_meta,
)

router = APIRouter(prefix="/sessions", tags=["Sessions"])
 
 
@router.get("/notebook/{notebook_id}/latest")
async def get_latest_session(
    notebook_id: str,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Get the most recent chat session and its messages for a notebook."""
    # Get the latest session for this notebook
    session_result = await supabase.table("chat_sessions").select("*").eq(
        "notebook_id", notebook_id
    ).eq("user_id", user.id).order("created_at", desc=True).limit(1).execute()

    if not session_result.data:
        return {"session": None, "messages": []}

    session = session_result.data[0]
    session_id = session["id"]

    # Get all messages for this session
    messages_result = await supabase.table("messages").select("*").eq(
        "session_id", session_id
    ).order("created_at").execute()

    return {
        "session": session,
        "messages": messages_result.data or [],
    }

@router.post("/")
async def create_chat_session(
    notebook_id: str,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Create a new chat session with working memory."""
    # Verify notebook ownership
    nb = await supabase.table("notebooks").select("id").eq(
        "id", notebook_id
    ).eq("user_id", user.id).execute()
    if not nb.data:
        raise HTTPException(status_code=404, detail="Notebook not found")

    session_id = await create_session(user.id, notebook_id)

    # Also create a Postgres record for persistence
    try:
        await supabase.table("chat_sessions").insert({
            "id": session_id,
            "notebook_id": notebook_id,
            "user_id": user.id,
            "message_count": 0,
        }).execute()
    except Exception:
        pass  # Redis session is primary

    return {"session_id": session_id}


@router.get("/{session_id}/history")
async def get_session_history(
    session_id: str,
    user: AuthUser,
):
    """Get the full conversation history for a session."""
    meta = await get_session_meta(session_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    # Verify ownership
    if meta.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    messages = await get_full_history(session_id)
    return {
        "session_id": session_id,
        "messages": [msg.to_dict() for msg in messages],
        "meta": meta,
    }


@router.delete("/{session_id}")
async def clear_chat_session(
    session_id: str,
    user: AuthUser,
):
    """Clear a session's working memory."""
    meta = await get_session_meta(session_id)
    if meta and meta.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    await clear_session(session_id)
    return {"status": "cleared"}
