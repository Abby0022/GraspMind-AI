"""REST chat endpoint — for non-streaming clients.

Provides a traditional POST endpoint as an alternative to the
WebSocket interface. Useful for simpler clients or testing.
"""

from fastapi import APIRouter, Depends, HTTPException

from graspmind.api.deps import AuthUser, get_user_supabase
from graspmind.models.schemas import ChatMessage, ChatResponse
from graspmind.rag.hybrid_retriever import hybrid_retrieve
from graspmind.rag.llm_client import complete_chat
from graspmind.rag.prompt_builder import build_prompt, extract_citations
from graspmind.security.input_sanitizer import sanitize_text
from graspmind.security.rate_limiter import RateLimiter

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post(
    "/",
    response_model=ChatResponse,
    dependencies=[Depends(RateLimiter(max_requests=60, window_seconds=60))],
)
async def post_chat(
    body: ChatMessage,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Send a chat message and receive a complete response.

    For streaming, use the WebSocket endpoint at /ws/chat instead.
    """
    safe_content = sanitize_text(body.content)

    # 1. Fetch Notebook Owner ID
    # Since vectors are indexed under the owner's Qdrant collection,
    # we must find the notebook owner even if it's shared.
    # The get_user_supabase client handles RLS, so this only succeeds if user has access.
    nb = await supabase.table("notebooks").select("user_id").eq("id", str(body.notebook_id)).single().execute()
    if not nb.data:
        raise HTTPException(status_code=404, detail="Notebook not found or access denied")

    owner_id = nb.data["user_id"]

    # 2. Retrieve context (hybrid: dense + BM25 + reranker)
    contexts = await hybrid_retrieve(
        query=safe_content,
        user_id=owner_id,
        notebook_id=str(body.notebook_id),
        top_k=8,
    )

    # 3. Build prompt
    messages = build_prompt(
        query=safe_content,
        contexts=contexts,
    )

    # Get complete response
    response_text = await complete_chat(messages, user_id=user.id)

    # Extract citations
    citations = extract_citations(response_text)

    return ChatResponse(
        content=response_text,
        citations=citations,
    )
