"""Tests for episodic and semantic memory modules."""

from graspmind.memory.episodic import Episode, format_episodes_for_prompt
from graspmind.memory.semantic import (
    KnowledgeNode,
    MasteryLevel,
    compute_mastery,
    format_knowledge_for_prompt,
)

# ── Episodic Memory tests ───────────────────────────────────

def test_episode_dataclass():
    """Episode should hold session summary data."""
    ep = Episode(
        session_id="s1",
        user_id="u1",
        notebook_id="n1",
        summary="Discussed cell biology",
        topics=["mitosis", "meiosis"],
        message_count=10,
    )
    assert ep.summary == "Discussed cell biology"
    assert len(ep.topics) == 2


def test_format_episodes_empty():
    """Should return empty string for no episodes."""
    assert format_episodes_for_prompt([]) == ""


def test_format_episodes_single():
    """Should format a single episode for the prompt."""
    episodes = [
        Episode(
            session_id="s1",
            user_id="u1",
            notebook_id="n1",
            summary="The student studied photosynthesis.",
            topics=["photosynthesis", "chloroplast"],
            message_count=8,
        ),
    ]
    result = format_episodes_for_prompt(episodes)
    assert "Previous Study Sessions" in result
    assert "photosynthesis" in result
    assert "chloroplast" in result


def test_format_episodes_multiple():
    """Should format multiple episodes."""
    episodes = [
        Episode(
            session_id="s1", user_id="u1", notebook_id="n1",
            summary="First session",
            topics=["topic1"], message_count=5,
        ),
        Episode(
            session_id="s2", user_id="u1", notebook_id="n1",
            summary="Second session",
            topics=["topic2"], message_count=7,
        ),
    ]
    result = format_episodes_for_prompt(episodes)
    assert "Session 1" in result
    assert "Session 2" in result


# ── Mastery computation tests ────────────────────────────────

def test_compute_mastery_unknown():
    """0 interactions = unknown."""
    assert compute_mastery(0, 0) == MasteryLevel.UNKNOWN


def test_compute_mastery_struggling():
    """Low accuracy = struggling."""
    assert compute_mastery(10, 2) == MasteryLevel.STRUGGLING


def test_compute_mastery_learning():
    """Mid accuracy = learning."""
    assert compute_mastery(10, 5) == MasteryLevel.LEARNING


def test_compute_mastery_familiar():
    """Good accuracy = familiar."""
    assert compute_mastery(10, 8) == MasteryLevel.FAMILIAR


def test_compute_mastery_mastered():
    """High accuracy + enough attempts = mastered."""
    assert compute_mastery(5, 5) == MasteryLevel.MASTERED


def test_compute_mastery_not_enough_attempts():
    """High accuracy but < 3 attempts shouldn't be mastered."""
    result = compute_mastery(2, 2)
    assert result != MasteryLevel.MASTERED


# ── Knowledge formatting tests ──────────────────────────────

def test_format_knowledge_empty():
    """Should return empty string for no nodes."""
    assert format_knowledge_for_prompt([]) == ""


def test_format_knowledge_with_struggling():
    """Should list struggling topics."""
    nodes = [
        KnowledgeNode(
            concept="mitosis",
            mastery=MasteryLevel.STRUGGLING,
            times_asked=5,
            times_correct=1,
        ),
    ]
    result = format_knowledge_for_prompt(nodes)
    assert "Needs review" in result
    assert "mitosis" in result


def test_format_knowledge_with_mastered():
    """Should list mastered topics."""
    nodes = [
        KnowledgeNode(
            concept="photosynthesis",
            mastery=MasteryLevel.MASTERED,
            times_asked=10,
            times_correct=9,
        ),
    ]
    result = format_knowledge_for_prompt(nodes)
    assert "Strong in" in result
    assert "photosynthesis" in result


def test_format_knowledge_mixed():
    """Should show both weak and strong areas."""
    nodes = [
        KnowledgeNode(concept="DNA", mastery=MasteryLevel.STRUGGLING, times_asked=5, times_correct=1),
        KnowledgeNode(concept="RNA", mastery=MasteryLevel.MASTERED, times_asked=5, times_correct=5),
    ]
    result = format_knowledge_for_prompt(nodes)
    assert "Needs review" in result
    assert "Strong in" in result


# ── MasteryLevel enum tests ─────────────────────────────────

def test_mastery_level_values():
    """MasteryLevel should have expected string values."""
    assert MasteryLevel.UNKNOWN == "unknown"
    assert MasteryLevel.STRUGGLING == "struggling"
    assert MasteryLevel.LEARNING == "learning"
    assert MasteryLevel.FAMILIAR == "familiar"
    assert MasteryLevel.MASTERED == "mastered"
