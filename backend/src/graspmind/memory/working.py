"""Working Memory — Redis-backed conversation context.

Stores the last N messages per session in Redis for fast retrieval.
This is the "Working Memory" layer of GraspMindAI's 3-tier memory:

1. Working Memory (this file) — recent chat context, Redis, fast
2. Episodic Memory (week 8) — session summaries, Postgres
3. Semantic Memory (week 9) — student knowledge model, Qdrant

Design:
- Each session stores up to MAX_MESSAGES messages
- Messages are stored as a Redis list (LPUSH/LTRIM pattern)
- TTL ensures stale sessions auto-expire
- Session metadata tracks message count and timestamps
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime

import redis.asyncio as redis

from graspmind.config import Settings, get_settings

logger = logging.getLogger(__name__)

MAX_MESSAGES = 20  # Rolling window of recent messages
SESSION_TTL = 3600 * 4  # 4 hours TTL for inactive sessions
_pool: redis.Redis | None = None


def _redis_key(session_id: str) -> str:
    return f"wm:session:{session_id}:messages"


def _meta_key(session_id: str) -> str:
    return f"wm:session:{session_id}:meta"


async def _get_redis(settings: Settings | None = None) -> redis.Redis:
    """Lazy singleton async Redis connection."""
    global _pool  # noqa: PLW0603
    if _pool is None:
        s = settings or get_settings()
        _pool = redis.from_url(s.redis_url, decode_responses=True)
    return _pool


@dataclass
class ChatMessage:
    """A single message in the conversation."""

    role: str  # "user" | "assistant" | "system"
    content: str
    timestamp: str = ""
    citations: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp or datetime.now(UTC).isoformat(),
            "citations": self.citations,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ChatMessage":
        return cls(
            role=data.get("role", "user"),
            content=data.get("content", ""),
            timestamp=data.get("timestamp", ""),
            citations=data.get("citations", []),
        )


async def add_message(
    session_id: str,
    role: str,
    content: str,
    citations: list[dict] | None = None,
) -> None:
    """Add a message to the session's working memory.

    Uses LPUSH + LTRIM to maintain a rolling window of MAX_MESSAGES.
    """
    r = await _get_redis()
    key = _redis_key(session_id)
    meta = _meta_key(session_id)

    msg = ChatMessage(
        role=role,
        content=content,
        timestamp=datetime.now(UTC).isoformat(),
        citations=citations or [],
    )

    # Push to the front of the list
    await r.lpush(key, json.dumps(msg.to_dict()))

    # Trim to keep only the last MAX_MESSAGES
    await r.ltrim(key, 0, MAX_MESSAGES - 1)

    # Update session metadata
    await r.hset(meta, mapping={
        "last_activity": datetime.now(UTC).isoformat(),
        "message_count": await r.llen(key),
    })

    # Reset TTL on both keys
    await r.expire(key, SESSION_TTL)
    await r.expire(meta, SESSION_TTL)


async def get_history(
    session_id: str,
    limit: int = MAX_MESSAGES,
) -> list[dict]:
    """Retrieve conversation history for a session.

    Returns messages in chronological order (oldest first).

    Args:
        session_id: The session identifier.
        limit: Max number of messages to retrieve.

    Returns:
        List of message dicts [{"role": "...", "content": "..."}, ...].
    """
    r = await _get_redis()
    key = _redis_key(session_id)

    # LRANGE returns newest first (LPUSH), so we reverse
    raw = await r.lrange(key, 0, limit - 1)
    if not raw:
        return []

    messages = []
    for item in reversed(raw):  # Reverse to get chronological order
        try:
            msg = json.loads(item)
            messages.append({"role": msg["role"], "content": msg["content"]})
        except (json.JSONDecodeError, KeyError):
            continue

    return messages


async def get_full_history(
    session_id: str,
) -> list[ChatMessage]:
    """Retrieve full message objects (including timestamps and citations)."""
    r = await _get_redis()
    key = _redis_key(session_id)

    raw = await r.lrange(key, 0, -1)
    if not raw:
        return []

    messages = []
    for item in reversed(raw):
        try:
            messages.append(ChatMessage.from_dict(json.loads(item)))
        except (json.JSONDecodeError, KeyError):
            continue

    return messages


async def clear_session(session_id: str) -> None:
    """Clear all messages from a session's working memory."""
    r = await _get_redis()
    await r.delete(_redis_key(session_id), _meta_key(session_id))


async def get_session_meta(session_id: str) -> dict | None:
    """Get session metadata (message count, last activity)."""
    r = await _get_redis()
    meta = await r.hgetall(_meta_key(session_id))
    return meta if meta else None


async def is_session_active(session_id: str) -> bool:
    """Check if a session exists and hasn't expired."""
    r = await _get_redis()
    return await r.exists(_redis_key(session_id)) > 0


async def create_session(
    user_id: str,
    notebook_id: str,
) -> str:
    """Create a new working memory session.

    Returns:
        The new session_id (UUID).
    """
    import uuid
    session_id = str(uuid.uuid4())

    r = await _get_redis()
    meta = _meta_key(session_id)

    await r.hset(meta, mapping={
        "user_id": user_id,
        "notebook_id": notebook_id,
        "created_at": datetime.now(UTC).isoformat(),
        "last_activity": datetime.now(UTC).isoformat(),
        "message_count": "0",
    })
    await r.expire(meta, SESSION_TTL)

    logger.info("Created working memory session %s for user %s", session_id, user_id)
    return session_id


async def get_context_for_prompt(
    session_id: str,
    max_messages: int = 10,
) -> list[dict]:
    """Get conversation history formatted for LLM prompt injection.

    Returns the most recent messages, trimmed to fit within
    the context window. Only includes user and assistant messages.
    """
    history = await get_history(session_id, limit=max_messages)

    # Filter to only user/assistant messages
    return [
        msg for msg in history
        if msg["role"] in ("user", "assistant")
    ]
