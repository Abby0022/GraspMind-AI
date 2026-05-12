"""Episodic Memory — session summaries stored in Postgres.

Layer 2 of the 3-tier memory system. After a chat session ends
(or crosses a configurable threshold), the conversation is
summarized by the LLM and stored as an "episode" in Postgres.

Episodes enable:
- Cross-session continuity ("Last time we discussed...")
- Long-term study tracking
- Topic-level progress awareness
"""

import logging
from dataclasses import dataclass

from graspmind.rag.llm_client import complete_chat

logger = logging.getLogger(__name__)

SUMMARIZE_PROMPT = """Summarize this study conversation in 2-3 concise paragraphs. Focus on:
1. What topics/concepts were discussed
2. Key questions the student asked
3. What the student seemed to understand vs. struggle with
4. Any follow-up topics suggested

Write in third person ("The student asked about..."). Be specific about concepts mentioned.

Conversation:
{conversation}"""

EXTRACT_TOPICS_PROMPT = """From this study conversation, extract the key topics and concepts as a JSON array of strings. Include only specific academic concepts, not generic terms.

Example output: ["mitosis", "cell division", "DNA replication", "prophase"]

Conversation:
{conversation}

Return ONLY the JSON array:"""


@dataclass
class Episode:
    """A summarized conversation episode."""

    session_id: str
    user_id: str
    notebook_id: str
    summary: str
    topics: list[str]
    message_count: int
    created_at: str = ""


async def summarize_session(
    messages: list[dict],
    max_messages: int = 50,
    user_id: str = "",
) -> str:
    """Generate a summary of a conversation for episodic storage.

    Args:
        messages: List of message dicts [{"role": "...", "content": "..."}].
        max_messages: Max messages to include in summary input.

    Returns:
        Summary text.
    """
    if not messages:
        return ""

    # Build conversation text
    trimmed = messages[-max_messages:]
    conversation_text = "\n".join(
        f"{msg['role'].upper()}: {msg['content'][:500]}"
        for msg in trimmed
    )

    prompt_messages = [
        {"role": "system", "content": "You summarize study conversations concisely and accurately."},
        {"role": "user", "content": SUMMARIZE_PROMPT.format(conversation=conversation_text)},
    ]

    try:
        summary = await complete_chat(prompt_messages, user_id=user_id)
        return summary.strip()
    except Exception as exc:
        logger.error("Failed to summarize session: %s", exc)
        # Fallback: first and last message
        first = messages[0]["content"][:200] if messages else ""
        last = messages[-1]["content"][:200] if messages else ""
        return f"Session discussed: {first}... Last topic: {last}"


async def extract_topics(messages: list[dict], user_id: str = "") -> list[str]:
    """Extract key academic topics from a conversation.

    Returns:
        List of topic strings.
    """
    if not messages:
        return []

    conversation_text = "\n".join(
        f"{msg['role'].upper()}: {msg['content'][:300]}"
        for msg in messages[-20:]
    )

    prompt_messages = [
        {"role": "system", "content": "Extract topics as a JSON array. Return ONLY the JSON array."},
        {"role": "user", "content": EXTRACT_TOPICS_PROMPT.format(conversation=conversation_text)},
    ]

    try:
        import json
        result = await complete_chat(prompt_messages, user_id=user_id)
        # Parse JSON array
        result = result.strip()
        if result.startswith("```"):
            lines = result.split("\n")
            result = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        topics = json.loads(result)
        if isinstance(topics, list):
            return [str(t).lower().strip() for t in topics if t]
        return []
    except Exception as exc:
        logger.warning("Failed to extract topics: %s", exc)
        return []


async def save_episode(
    session_id: str,
    user_id: str,
    notebook_id: str,
    messages: list[dict],
    supabase_client=None,
) -> Episode | None:
    """Summarize and store a conversation episode.

    Called when a session ends or reaches the message threshold.

    Args:
        session_id: The chat session ID.
        user_id: User UUID.
        notebook_id: Notebook UUID.
        messages: Full conversation messages.
        supabase_client: Optional Supabase client.

    Returns:
        The created Episode, or None on failure.
    """
    if len(messages) < 2:
        logger.info("Session %s too short for episodic storage (%d msgs)", session_id, len(messages))
        return None

    # Generate summary and extract topics in parallel
    summary = await summarize_session(messages)
    topics = await extract_topics(messages)

    if not summary:
        return None

    # Store in Postgres
    try:
        if supabase_client is None:
            from supabase import acreate_client

            from graspmind.config import get_settings
            settings = get_settings()
            supabase_client = await acreate_client(settings.supabase_url, settings.supabase_service_key)

        result = await supabase_client.table("episodes").insert({
            "session_id": session_id,
            "user_id": user_id,
            "notebook_id": notebook_id,
            "summary": summary,
            "topics": topics,
            "message_count": len(messages),
        }).execute()

        if result.data:
            episode = Episode(
                session_id=session_id,
                user_id=user_id,
                notebook_id=notebook_id,
                summary=summary,
                topics=topics,
                message_count=len(messages),
                created_at=result.data[0].get("created_at", ""),
            )
            logger.info(
                "Saved episode for session %s: %d messages, %d topics",
                session_id, len(messages), len(topics),
            )
            return episode

    except Exception as exc:
        if hasattr(exc, 'code') and exc.code == 'PGRST205':
            logger.warning("Failed to save episode: table 'episodes' missing.")
        else:
            logger.error("Failed to save episode: %s", exc)

    return None


async def get_relevant_episodes(
    user_id: str,
    notebook_id: str,
    query: str | None = None,
    limit: int = 5,
    supabase_client=None,
) -> list[Episode]:
    """Retrieve recent episodes for context enrichment.

    Returns the most recent episodes for the notebook,
    optionally filtered by topic relevance to the query.

    Args:
        user_id: User UUID.
        notebook_id: Notebook UUID.
        query: Optional query for topic filtering.
        limit: Max episodes to return.
        supabase_client: Optional Supabase client.

    Returns:
        List of Episode objects.
    """
    try:
        if supabase_client is None:
            from supabase import acreate_client

            from graspmind.config import get_settings
            settings = get_settings()
            supabase_client = await acreate_client(settings.supabase_url, settings.supabase_service_key)

        result = await supabase_client.table("episodes").select(
            "session_id, user_id, notebook_id, summary, topics, message_count, created_at"
        ).eq("user_id", user_id).eq(
            "notebook_id", notebook_id
        ).order("created_at", desc=True).limit(limit).execute()

        episodes = [
            Episode(
                session_id=row["session_id"],
                user_id=row["user_id"],
                notebook_id=row["notebook_id"],
                summary=row["summary"],
                topics=row.get("topics", []),
                message_count=row.get("message_count", 0),
                created_at=row.get("created_at", ""),
            )
            for row in (result.data or [])
        ]

        return episodes

    except Exception as exc:
        # Gracefully handle missing table errors (common if migrations aren't run yet)
        if hasattr(exc, 'code') and exc.code == 'PGRST205':
            logger.warning("Episodic memory table 'episodes' missing. Please run migrations.")
            return []
            
        logger.error("Failed to get episodes: %s", exc)
        return []


def format_episodes_for_prompt(episodes: list[Episode]) -> str:
    """Format episodes as context for the LLM prompt.

    Returns a text block summarizing previous sessions.
    """
    if not episodes:
        return ""

    blocks = ["## Previous Study Sessions"]
    for i, ep in enumerate(episodes, 1):
        topics_str = ", ".join(ep.topics[:5]) if ep.topics else "general"
        blocks.append(
            f"### Session {i} (Topics: {topics_str})\n{ep.summary}\n"
        )

    return "\n".join(blocks)
