"""Tests for prompt builder and citation extraction."""

from graspmind.rag.prompt_builder import build_prompt, extract_citations
from graspmind.rag.retriever import RetrievedContext


def test_build_prompt_with_context():
    """Prompt should include system message, context, and user query."""
    contexts = [
        RetrievedContext(
            content="Mitosis is cell division.",
            parent_content="Mitosis is cell division that results in two daughter cells.",
            score=0.95,
            source_id="src-1",
            source_title="Biology Ch3",
            page_num=12,
            headings=["Cell Division"],
        ),
    ]

    messages = build_prompt("What is mitosis?", contexts)

    assert len(messages) >= 3  # system + context + user
    assert messages[0]["role"] == "system"
    assert "GraspMind AIMindAI" in messages[0]["content"]
    assert messages[-1]["role"] == "user"
    assert messages[-1]["content"] == "What is mitosis?"

    # Context should be in a system message
    context_msg = messages[1]
    assert "Biology Ch3" in context_msg["content"]
    assert "Page 12" in context_msg["content"]


def test_build_prompt_no_context():
    """Without context, prompt should include a 'no context' message."""
    messages = build_prompt("Random question?", [])

    assert len(messages) >= 2
    assert "No relevant context" in messages[1]["content"]


def test_build_prompt_with_history():
    """History messages should appear before the current query."""
    history = [
        {"role": "user", "content": "What is DNA?"},
        {"role": "assistant", "content": "DNA is a molecule..."},
    ]

    messages = build_prompt("Tell me more", [], history=history)

    roles = [m["role"] for m in messages]
    assert "user" in roles
    assert "assistant" in roles
    assert messages[-1]["content"] == "Tell me more"


def test_build_prompt_trims_history():
    """History should be trimmed to max_history."""
    history = [
        {"role": "user", "content": f"Question {i}"}
        for i in range(20)
    ]

    messages = build_prompt("Latest?", [], history=history, max_history=5)

    # Count history messages (not system or final user)
    history_msgs = [m for m in messages if m not in (messages[0], messages[1], messages[-1])]
    assert len(history_msgs) <= 5


def test_extract_citations_basic():
    """Should extract source title and page number."""
    text = 'Mitosis results in two cells [Source: "Biology Ch3", Page 12]. It is important.'
    citations = extract_citations(text)

    assert len(citations) == 1
    assert citations[0]["source_title"] == "Biology Ch3"
    assert citations[0]["page_num"] == 12


def test_extract_citations_no_page():
    """Should handle citations without page numbers."""
    text = 'The concept is explained in [Source: "Lecture Notes"].'
    citations = extract_citations(text)

    assert len(citations) == 1
    assert citations[0]["source_title"] == "Lecture Notes"
    assert citations[0]["page_num"] is None


def test_extract_citations_multiple():
    """Should extract multiple unique citations."""
    text = (
        '[Source: "Ch1", Page 5] says one thing. '
        '[Source: "Ch2", Page 10] says another. '
        '[Source: "Ch1", Page 5] repeated.'  # Duplicate
    )
    citations = extract_citations(text)

    assert len(citations) == 2  # Deduplicated


def test_extract_citations_none():
    """Should return empty list if no citations."""
    citations = extract_citations("No citations here.")
    assert citations == []
