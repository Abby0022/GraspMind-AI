"""Tests for working memory module.

Tests are designed to work without a real Redis connection
by testing the data structures and logic directly.
"""

from graspmind.memory.working import ChatMessage


def test_chat_message_to_dict():
    """ChatMessage should serialize to dict correctly."""
    msg = ChatMessage(
        role="user",
        content="Hello world",
        timestamp="2026-01-01T00:00:00Z",
        citations=[{"source_title": "Test"}],
    )
    d = msg.to_dict()

    assert d["role"] == "user"
    assert d["content"] == "Hello world"
    assert d["timestamp"] == "2026-01-01T00:00:00Z"
    assert len(d["citations"]) == 1


def test_chat_message_from_dict():
    """ChatMessage should deserialize from dict correctly."""
    data = {
        "role": "assistant",
        "content": "Hi there",
        "timestamp": "2026-01-01T00:00:00Z",
        "citations": [],
    }
    msg = ChatMessage.from_dict(data)

    assert msg.role == "assistant"
    assert msg.content == "Hi there"


def test_chat_message_defaults():
    """ChatMessage should have sensible defaults."""
    msg = ChatMessage(role="user", content="test")

    assert msg.timestamp == ""
    assert msg.citations == []


def test_chat_message_round_trip():
    """Serializing then deserializing should preserve data."""
    original = ChatMessage(
        role="assistant",
        content="The answer is 42",
        citations=[{"source_title": "Guide", "page_num": 7}],
    )

    d = original.to_dict()
    restored = ChatMessage.from_dict(d)

    assert restored.role == original.role
    assert restored.content == original.content
    assert restored.citations == original.citations


def test_chat_message_from_dict_missing_fields():
    """from_dict should handle missing fields gracefully."""
    msg = ChatMessage.from_dict({})

    assert msg.role == "user"
    assert msg.content == ""
    assert msg.citations == []
