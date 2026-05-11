"""Episodic memory worker — auto-summarizes sessions via Taskiq.

Triggered when a session reaches a message threshold or on
WebSocket disconnect. Runs asynchronously to avoid blocking
the chat flow.
"""

import logging

from graspmind.workers.broker import broker

logger = logging.getLogger(__name__)

SESSION_SUMMARY_THRESHOLD = 2  # Min messages before summarizing


@broker.task(task_name="episodic.summarize_session")
async def summarize_session_task(
    session_id: str,
    user_id: str,
    notebook_id: str,
) -> dict:
    """Background task: summarize a chat session and store as an episode.

    Flow:
    1. Fetch messages from Redis working memory
    2. Check if session meets minimum message threshold
    3. Generate LLM summary + extract topics
    4. Store episode in Postgres
    5. Clean up working memory (optional)

    Returns:
        Dict with episode info or skip reason.
    """
    from graspmind.memory.episodic import save_episode
    from graspmind.memory.working import get_history

    # Step 1: Get conversation from working memory
    messages = await get_history(session_id, limit=50)

    if len(messages) < SESSION_SUMMARY_THRESHOLD:
        logger.info(
            "Session %s too short (%d msgs < %d threshold), skipping",
            session_id, len(messages), SESSION_SUMMARY_THRESHOLD,
        )
        return {"status": "skipped", "reason": "too_short", "message_count": len(messages)}

    # Step 2: Save episode (summary + topics + Postgres)
    episode = await save_episode(
        session_id=session_id,
        user_id=user_id,
        notebook_id=notebook_id,
        messages=messages,
    )

    if episode:
        logger.info(
            "Episode saved for session %s: %d topics, %d messages",
            session_id, len(episode.topics), episode.message_count,
        )
        return {
            "status": "saved",
            "session_id": session_id,
            "summary_length": len(episode.summary),
            "topics": episode.topics,
            "message_count": episode.message_count,
        }

    return {"status": "failed", "session_id": session_id}


@broker.task(task_name="episodic.update_knowledge_from_session")
async def update_knowledge_task(
    user_id: str,
    notebook_id: str,
    topics: list[str],
) -> dict:
    """Background task: update semantic memory from session topics.

    After a session is summarized, the discussed topics are
    recorded in the student's knowledge model as "seen" concepts.
    """
    from graspmind.memory.semantic import update_knowledge

    if not topics:
        return {"status": "skipped", "reason": "no_topics"}

    try:
        # Mark all discussed topics as "asked" (not necessarily correct)
        # These are topics the student inquired about, so we track exposure
        correct_flags = [True] * len(topics)  # Asking = engagement

        nodes = await update_knowledge(
            user_id=user_id,
            concepts=topics,
            correct=correct_flags,
            notebook_id=notebook_id,
        )

        return {
            "status": "updated",
            "concepts_updated": len(nodes),
            "mastery_levels": {n.concept: n.mastery.value for n in nodes},
        }

    except Exception as exc:
        logger.error("Knowledge update failed: %s", exc)
        return {"status": "failed", "error": str(exc)}
