"""Tests for knowledge extractor and quiz analysis."""

import pytest

from graspmind.memory.knowledge_extractor import analyze_quiz_results
from graspmind.memory.semantic import (
    MasteryLevel,
    compute_mastery,
)
from graspmind.rag.prompt_builder import build_prompt
from graspmind.rag.retriever import RetrievedContext

# ── Knowledge extractor tests ───────────────────────────────

@pytest.mark.asyncio
async def test_analyze_quiz_results_correct():
    """Should extract concepts with understood=True for correct answers."""
    questions = [
        {"id": "q1", "question": "What is photosynthesis?", "source_title": "biology"},
    ]
    results = [
        {"question_id": "q1", "is_correct": True},
    ]

    concepts = await analyze_quiz_results(questions, results)

    assert len(concepts) == 1
    assert concepts[0]["concept"] == "biology"
    assert concepts[0]["understood"] is True


@pytest.mark.asyncio
async def test_analyze_quiz_results_incorrect():
    """Should extract concepts with understood=False for wrong answers."""
    questions = [
        {"id": "q1", "question": "Explain mitosis", "source_title": "cell biology"},
    ]
    results = [
        {"question_id": "q1", "is_correct": False},
    ]

    concepts = await analyze_quiz_results(questions, results)

    assert concepts[0]["understood"] is False


@pytest.mark.asyncio
async def test_analyze_quiz_results_empty():
    """Should return empty list for no questions."""
    concepts = await analyze_quiz_results([], [])
    assert concepts == []


@pytest.mark.asyncio
async def test_analyze_quiz_results_deduplicates():
    """Should not duplicate the same concept."""
    questions = [
        {"id": "q1", "question": "Q1", "source_title": "biology"},
        {"id": "q2", "question": "Q2", "source_title": "biology"},
    ]
    results = [
        {"question_id": "q1", "is_correct": True},
        {"question_id": "q2", "is_correct": False},
    ]

    concepts = await analyze_quiz_results(questions, results)

    concept_names = [c["concept"] for c in concepts]
    assert concept_names.count("biology") == 1


@pytest.mark.asyncio
async def test_analyze_quiz_results_fallback_to_question_text():
    """Should fallback to question text when source_title is empty."""
    questions = [
        {"id": "q1", "question": "What causes earthquakes tectonic plates", "source_title": ""},
    ]
    results = [
        {"question_id": "q1", "is_correct": True},
    ]

    concepts = await analyze_quiz_results(questions, results)

    assert len(concepts) == 1
    assert len(concepts[0]["concept"]) > 0  # Should have extracted something


# ── Mastery-accuracy boundary tests ─────────────────────────

def test_mastery_boundary_90_percent():
    """90% accuracy with 3+ attempts should be mastered."""
    assert compute_mastery(10, 9) == MasteryLevel.MASTERED


def test_mastery_boundary_70_percent():
    """70-89% accuracy should be familiar."""
    assert compute_mastery(10, 7) == MasteryLevel.FAMILIAR


def test_mastery_boundary_40_percent():
    """40-69% accuracy should be learning."""
    assert compute_mastery(10, 4) == MasteryLevel.LEARNING


def test_mastery_boundary_below_40():
    """Below 40% accuracy should be struggling."""
    assert compute_mastery(10, 3) == MasteryLevel.STRUGGLING


# ── Prompt builder memory integration tests ─────────────────

def test_build_prompt_with_episodic_context():
    """Prompt should include episodic memory context."""
    contexts = [
        RetrievedContext(
            content="Test content",
            parent_content="Test content",
            score=0.9,
            source_id="s1",
            source_title="Test Source",
        )
    ]

    messages = build_prompt(
        query="What is mitosis?",
        contexts=contexts,
        episodic_context="## Previous Study Sessions\nDiscussed cell division.",
    )

    system_contents = [m["content"] for m in messages if m["role"] == "system"]
    assert any("Previous Study Sessions" in c for c in system_contents)


def test_build_prompt_with_knowledge_context():
    """Prompt should include semantic memory context."""
    contexts = [
        RetrievedContext(
            content="Test content",
            parent_content="Test content",
            score=0.9,
            source_id="s1",
            source_title="Test Source",
        )
    ]

    messages = build_prompt(
        query="What is mitosis?",
        contexts=contexts,
        knowledge_context="## Student's Knowledge Profile\n**Needs review:** DNA replication",
    )

    system_contents = [m["content"] for m in messages if m["role"] == "system"]
    assert any("Knowledge Profile" in c for c in system_contents)


def test_build_prompt_with_both_memories():
    """Prompt should include both episodic and semantic memory."""
    contexts = [
        RetrievedContext(
            content="Test content",
            parent_content="Test content",
            score=0.9,
            source_id="s1",
            source_title="Test Source",
        )
    ]

    messages = build_prompt(
        query="What is mitosis?",
        contexts=contexts,
        episodic_context="## Previous Sessions\nTopic: biology",
        knowledge_context="## Knowledge\nStrong: photosynthesis",
    )

    system_contents = [m["content"] for m in messages if m["role"] == "system"]
    assert any("Previous Sessions" in c for c in system_contents)
    assert any("Knowledge" in c for c in system_contents)


def test_build_prompt_without_memories():
    """Prompt should work fine without memory contexts."""
    contexts = [
        RetrievedContext(
            content="Test content",
            parent_content="Test content",
            score=0.9,
            source_id="s1",
            source_title="Test Source",
        )
    ]

    messages = build_prompt(
        query="What is mitosis?",
        contexts=contexts,
    )

    # Should have: system prompt, context, user query
    assert len(messages) >= 3
    assert messages[-1]["role"] == "user"
