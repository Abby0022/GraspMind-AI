"""Tests for SM-2 spaced repetition scheduler and quiz generator."""

from datetime import UTC, datetime, timedelta

from graspmind.study.quiz_generator import Question, QuestionType
from graspmind.study.spaced_repetition import (
    MIN_EASE,
    CardState,
    get_due_cards,
    sm2_schedule,
)

# ── SM-2 Scheduler tests ────────────────────────────────────

def test_sm2_first_correct_sets_interval_1():
    """First correct answer should set interval to 1 day."""
    state = CardState()
    new_state = sm2_schedule(state, quality=4)

    assert new_state.interval == 1
    assert new_state.repetitions == 1
    assert new_state.next_review is not None


def test_sm2_second_correct_sets_interval_6():
    """Second correct answer should set interval to 6 days."""
    state = CardState(interval=1, repetitions=1)
    new_state = sm2_schedule(state, quality=4)

    assert new_state.interval == 6
    assert new_state.repetitions == 2


def test_sm2_third_correct_uses_ease_factor():
    """Third+ correct answers multiply interval by ease factor."""
    state = CardState(interval=6, repetitions=2, ease_factor=2.5)
    new_state = sm2_schedule(state, quality=4)

    assert new_state.interval == 15  # round(6 * 2.5) = 15
    assert new_state.repetitions == 3


def test_sm2_incorrect_resets():
    """Incorrect answer (quality < 3) resets repetitions and interval."""
    state = CardState(interval=15, repetitions=3, ease_factor=2.5)
    new_state = sm2_schedule(state, quality=1)

    assert new_state.interval == 1
    assert new_state.repetitions == 0


def test_sm2_perfect_score_increases_ease():
    """Quality 5 should increase ease factor."""
    state = CardState(ease_factor=2.5)
    new_state = sm2_schedule(state, quality=5)

    assert new_state.ease_factor > 2.5


def test_sm2_low_quality_decreases_ease():
    """Quality 3 (barely correct) should decrease ease factor."""
    state = CardState(ease_factor=2.5)
    new_state = sm2_schedule(state, quality=3)

    assert new_state.ease_factor < 2.5


def test_sm2_ease_never_below_minimum():
    """Ease factor should never go below MIN_EASE (1.3)."""
    state = CardState(ease_factor=MIN_EASE)
    new_state = sm2_schedule(state, quality=0)

    assert new_state.ease_factor >= MIN_EASE


def test_sm2_clamps_quality():
    """Quality should be clamped to 0-5 range."""
    state = CardState()
    # Should not crash with out-of-range quality
    new_state_high = sm2_schedule(state, quality=10)
    new_state_low = sm2_schedule(state, quality=-5)

    assert new_state_high.interval >= 1
    assert new_state_low.interval >= 1


# ── Due cards tests ──────────────────────────────────────────

def test_get_due_cards_returns_overdue():
    """Cards past their next_review should be returned."""
    now = datetime.now(UTC)
    cards = [
        {"id": "1", "next_review": (now - timedelta(days=2)).isoformat()},
        {"id": "2", "next_review": (now + timedelta(days=5)).isoformat()},
        {"id": "3", "next_review": None},  # Never reviewed
    ]

    due = get_due_cards(cards, now=now)

    due_ids = [c["id"] for c in due]
    assert "1" in due_ids  # Overdue
    assert "3" in due_ids  # Never reviewed
    assert "2" not in due_ids  # Not due yet


def test_get_due_cards_sorted_by_overdue():
    """Most overdue cards should come first."""
    now = datetime.now(UTC)
    cards = [
        {"id": "recent", "next_review": (now - timedelta(days=1)).isoformat()},
        {"id": "old", "next_review": (now - timedelta(days=10)).isoformat()},
    ]

    due = get_due_cards(cards, now=now)

    assert due[0]["id"] == "old"  # Most overdue first


def test_get_due_cards_empty():
    """Should return empty list if no cards are due."""
    now = datetime.now(UTC)
    cards = [
        {"id": "1", "next_review": (now + timedelta(days=5)).isoformat()},
    ]

    due = get_due_cards(cards, now=now)
    assert len(due) == 0


# ── Question type tests ─────────────────────────────────────

def test_question_type_enum():
    """QuestionType should have the expected values."""
    assert QuestionType.MCQ == "mcq"
    assert QuestionType.FILL_BLANK == "fill_blank"
    assert QuestionType.SHORT_ANSWER == "short_answer"


def test_question_dataclass():
    """Question should hold all required fields."""
    q = Question(
        question="What is mitosis?",
        question_type=QuestionType.MCQ,
        correct_answer="Cell division",
        options=["Growth", "Cell division", "Death", "Mutation"],
        explanation="Mitosis is cell division.",
    )

    assert q.question == "What is mitosis?"
    assert q.correct_answer == "Cell division"
    assert len(q.options) == 4
