"""WebSocket chat endpoint — real-time streaming RAG responses.

Handles the full chat flow:
1. Authenticate user from WebSocket connection
2. Receive message with notebook_id
3. Retrieve relevant context from Qdrant
4. Stream LLM response with citations
5. Persist message + response in database
"""

import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from graspmind.config import Settings, get_settings
from graspmind.memory.working import (
    add_message,
    create_session,
    get_context_for_prompt,
)
from graspmind.rag.hybrid_retriever import hybrid_retrieve
from graspmind.rag.llm_client import stream_chat_completion
from graspmind.rag.prompt_builder import build_prompt, extract_citations
from graspmind.security.key_sanitizer import scrub_keys

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])


async def _authenticate_ws(websocket: WebSocket, settings: Settings) -> str | None:
    """Authenticate WebSocket connection from cookie or query param.

    Returns user_id if valid, None otherwise.
    """
    # Try cookie first
    token = websocket.cookies.get("access_token")

    # Fallback to query param (for clients that can't send cookies with WS)
    if not token:
        token = websocket.query_params.get("token")

    if not token:
        return None

    try:
        from supabase import acreate_client
        client = await acreate_client(settings.supabase_url, settings.supabase_anon_key)
        response = await client.auth.get_user(token)
        user = response.user
        return user.id if user else None
    except Exception:
        return None


@router.websocket("/ws/chat")
async def chat_websocket(
    websocket: WebSocket,
    settings: Settings = Depends(get_settings),
):
    """WebSocket endpoint for streaming RAG chat.

    Protocol:
    - Client sends JSON: {"content": "...", "notebook_id": "...", "session_id": "..."}
    - Server streams JSON chunks: {"type": "token", "content": "..."}
    - Server sends final: {"type": "done", "citations": [...]}
    - Server sends error: {"type": "error", "content": "..."}
    """
    await websocket.accept()

    # Authenticate
    user_id = await _authenticate_ws(websocket, settings)
    if not user_id:
        await websocket.send_json({"type": "error", "content": "Authentication required"})
        await websocket.close(code=4001)
        return

    # Active session ID (created on first message or reused from client)
    active_session_id: str | None = None
    notebook_id: str = ""

    try:
        while True:
            # Receive message from client
            raw = await websocket.receive_text()

            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "content": "Invalid JSON"})
                continue

            content = message.get("content", "").strip()
            notebook_id = message.get("notebook_id", "")
            session_id = message.get("session_id")
            provider_override = message.get("provider")
            chat_mode = message.get("mode", "standard")

            if not content:
                await websocket.send_json({"type": "error", "content": "Empty message"})
                continue

            if not notebook_id:
                await websocket.send_json({"type": "error", "content": "notebook_id required"})
                continue

            # Validate message length
            if len(content) > 5000:
                await websocket.send_json({"type": "error", "content": "Message too long (max 5000 chars)"})
                continue

            try:
                # Step 1: Signal retrieval start
                await websocket.send_json({"type": "status", "content": "Searching your sources..."})

                # Step 2: Retrieve context (hybrid: dense + BM25 + reranker)
                contexts = await hybrid_retrieve(
                    query=content,
                    user_id=user_id,
                    notebook_id=notebook_id,
                    top_k=12,
                )

                # Step 2.5: Ensure working memory session exists
                if not active_session_id:
                    if session_id:
                        active_session_id = session_id
                    else:
                        active_session_id = await create_session(user_id, notebook_id)
                        await websocket.send_json({
                            "type": "session",
                            "session_id": active_session_id,
                        })

                # Step 3: Load history from working memory (Redis)
                await websocket.send_json({"type": "status", "content": "Thinking..."})

                session_history = await get_context_for_prompt(
                    active_session_id, max_messages=10
                )

                # Step 3.5: Load episodic + semantic memory context
                episodic_ctx = ""
                knowledge_ctx = ""
                try:
                    from graspmind.memory.episodic import (
                        format_episodes_for_prompt,
                        get_relevant_episodes,
                    )
                    from graspmind.memory.semantic import (
                        format_knowledge_for_prompt,
                        get_weak_areas,
                    )

                    episodes = await get_relevant_episodes(
                        user_id, notebook_id, query=content, limit=3,
                    )
                    episodic_ctx = format_episodes_for_prompt(episodes)

                    weak_nodes = await get_weak_areas(user_id, limit=8)
                    knowledge_ctx = format_knowledge_for_prompt(weak_nodes)
                except Exception as exc:
                    logger.debug("Memory context load skipped: %s", exc)

                prompt_messages = build_prompt(
                    query=content,
                    contexts=contexts,
                    history=session_history,
                    max_history=10,
                    episodic_context=episodic_ctx,
                    knowledge_context=knowledge_ctx,
                    chat_mode=chat_mode,
                )

                # Step 4: Stream LLM response (BYOK — uses user's configured provider)
                full_response = ""
                async for token in stream_chat_completion(prompt_messages, user_id=user_id):
                    full_response += token
                    await websocket.send_json({
                        "type": "token",
                        "content": token,
                    })

                # Step 5: Extract citations
                citations = extract_citations(full_response)

                # Add source metadata to citations
                enriched_citations = []
                for citation in citations:
                    # Find matching context for additional metadata
                    for ctx in contexts:
                        if ctx.source_title == citation["source_title"]:
                            citation["source_id"] = ctx.source_id
                            break
                    enriched_citations.append(citation)

                # Step 6: Send completion signal
                await websocket.send_json({
                    "type": "done",
                    "citations": enriched_citations,
                    "sources_used": len(contexts),
                })

                # Step 7: Persist to working memory (Redis)
                await add_message(active_session_id, "user", content)
                await add_message(
                    active_session_id, "assistant", full_response,
                    citations=enriched_citations,
                )

                # Step 8: Persist to database (best-effort)
                try:
                    await _persist_message(
                        user_id=user_id,
                        notebook_id=notebook_id,
                        session_id=active_session_id,
                        user_content=content,
                        assistant_content=full_response,
                        citations=enriched_citations,
                    )
                except Exception as exc:
                    logger.warning("Failed to persist message: %s", exc)

                # Step 9: If Feynman mode, trigger background evaluation
                if chat_mode == "feynman":
                    try:
                        # Use the retrieved context text to ground the evaluation
                        from graspmind.rag.prompt_builder import _format_contexts
                        from graspmind.workers.feynman_worker import evaluate_explanation_task
                        context_text = _format_contexts(contexts) if contexts else ""

                        await evaluate_explanation_task.kiq(
                            user_id=user_id,
                            notebook_id=notebook_id,
                            user_explanation=content,
                            context_text=context_text,
                        )
                    except Exception as exc:
                        logger.warning("Failed to trigger Feynman evaluation: %s", exc)

            except Exception as exc:
                logger.exception("Chat error for user %s", user_id)
                await websocket.send_json({
                    "type": "error",
                    "content": f"An error occurred: {str(exc)[:200]}",
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for user %s", user_id)

        # Trigger episodic memory worker (async — doesn't block disconnect)
        if active_session_id:
            try:
                from graspmind.workers.episodic_worker import summarize_session_task
                await summarize_session_task.kiq(
                    session_id=active_session_id,
                    user_id=user_id,
                    notebook_id=notebook_id,
                )
            except Exception as exc:
                logger.warning("Failed to trigger episodic worker: %s", exc)

    except Exception:
        logger.exception("WebSocket error for user %s", user_id)


async def _persist_message(
    user_id: str,
    notebook_id: str,
    session_id: str | None,
    user_content: str,
    assistant_content: str,
    citations: list[dict],
) -> None:
    """Persist chat messages to Supabase (best-effort).

    Creates or reuses a chat session, then inserts both
    the user message and assistant response.
    """
    from supabase import acreate_client

    from graspmind.config import get_settings

    settings = get_settings()
    supabase = await acreate_client(settings.supabase_url, settings.supabase_service_key)

    # Ensure session exists in Supabase (upsert)
    if session_id:
        try:
            # First, check if session exists to avoid unnecessary upsert if possible,
            # but upsert is safer if we want to ensure count is updated later.
            await supabase.table("chat_sessions").upsert({
                "id": session_id,
                "notebook_id": notebook_id,
                "user_id": user_id,
            }, on_conflict="id").execute()
        except Exception as exc:
            logger.warning("Failed to upsert session %s: %s", session_id, exc)
            return

    # Insert messages
    messages_to_insert = [
        {
            "session_id": session_id,
            "role": "user",
            "content": user_content,
            "citations": [],
        },
        {
            "session_id": session_id,
            "role": "assistant",
            "content": assistant_content,
            "citations": citations,
        },
    ]
    await supabase.table("messages").insert(messages_to_insert).execute()

    # Update message count
    await supabase.table("chat_sessions").update({
        "message_count": len(messages_to_insert),
    }).eq("id", session_id).execute()
