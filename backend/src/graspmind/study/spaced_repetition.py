"""SM-2 Spaced Repetition Scheduler.

Implements the SuperMemo-2 algorithm for optimal review scheduling.
Each card has:
- ease_factor: Multiplier for interval growth (starts at 2.5)
- interval: Days until next review
- repetitions: Count of successful consecutive reviews
- next_review: Datetime of the next scheduled review

Quality grades (0-5):
- 0: Complete blackout
- 1: Incorrect, but recognized after seeing answer
- 2: Incorrect, but answer seemed easy to recall
- 3: Correct with serious difficulty
- 4: Correct with some hesitation
- 5: Perfect response
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

logger = logging.getLogger(__name__)

MIN_EASE = 1.3
DEFAULT_EASE = 2.5


@dataclass
class CardState:
    """Current state of a flashcard/quiz item in the SM-2 system."""

    ease_factor: float = DEFAULT_EASE
    interval: int = 0  # days
    repetitions: int = 0
    next_review: datetime | None = None
    last_reviewed: datetime | None = None


def sm2_schedule(state: CardState, quality: int) -> CardState:
    """Apply the SM-2 algorithm to calculate the next review date.

    Args:
        state: Current card state.
        quality: Student's self-assessed quality (0-5).

    Returns:
        Updated CardState with new interval and next_review.
    """
    quality = max(0, min(5, quality))
    now = datetime.now(UTC)

    new_state = CardState(
        ease_factor=state.ease_factor,
        interval=state.interval,
        repetitions=state.repetitions,
        last_reviewed=now,
    )

    if quality >= 3:
        # Correct response — advance schedule
        if new_state.repetitions == 0:
            new_state.interval = 1
        elif new_state.repetitions == 1:
            new_state.interval = 6
        else:
            new_state.interval = round(state.interval * state.ease_factor)

        new_state.repetitions += 1
    else:
        # Incorrect — reset to beginning
        new_state.repetitions = 0
        new_state.interval = 1

    # Update ease factor (never below MIN_EASE)
    new_state.ease_factor = max(
        MIN_EASE,
        state.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    )

    new_state.next_review = now + timedelta(days=new_state.interval)

    logger.debug(
        "SM-2: quality=%d, interval=%d→%d, ease=%.2f→%.2f, reps=%d",
        quality, state.interval, new_state.interval,
        state.ease_factor, new_state.ease_factor, new_state.repetitions,
    )

    return new_state


def get_due_cards(
    cards: list[dict],
    now: datetime | None = None,
    exam_date: datetime | None = None,
) -> list[dict]:
    """Filter cards that are due for review, with Cram Mode support.

    If an exam_date is within 7 days, "Cram Mode" activates.
    In Cram Mode, we filter out MASTERED/FAMILIAR cards and strictly prioritize
    STRUGGLING/LEARNING cards, overriding standard SM-2 intervals.

    Args:
        cards: List of card dicts with 'next_review' and optionally 'mastery_level'.
        now: Current time (default: UTC now).
        exam_date: The target exam date for these cards.

    Returns:
        Cards that are due, sorted by priority.
    """
    now = now or datetime.now(UTC)

    # Check if Cram Mode is active (exam is < 7 days away)
    is_cram_mode = False
    if exam_date:
        if isinstance(exam_date, str):
            exam_date = datetime.fromisoformat(exam_date)
        days_until_exam = (exam_date - now).days
        if 0 <= days_until_exam <= 7:
            is_cram_mode = True
            logger.info("Cram Mode activated! Exam is in %d days.", days_until_exam)

    due = []
    for card in cards:
        mastery = card.get("mastery_level", "").upper()

        if is_cram_mode:
            # Cram Mode: Hide strong cards, show weak cards regardless of SM-2 interval
            if mastery in ("MASTERED", "FAMILIAR"):
                continue
            due.append(card)
            continue

        # Standard SM-2 logic
        next_review = card.get("next_review")
        if next_review is None:
            due.append(card)  # Never reviewed — always due
        elif isinstance(next_review, str):
            review_dt = datetime.fromisoformat(next_review)
            if review_dt <= now:
                due.append(card)
        elif isinstance(next_review, datetime):
            if next_review <= now:
                due.append(card)

    # Sort logic
    def sort_key(c):
        nr = c.get("next_review")
        if nr is None:
            nr_dt = datetime.min.replace(tzinfo=UTC)
        elif isinstance(nr, str):
            nr_dt = datetime.fromisoformat(nr)
        else:
            nr_dt = nr

        if is_cram_mode:
            mastery = c.get("mastery_level", "").upper()
            weight = {"STRUGGLING": 0, "LEARNING": 1}.get(mastery, 2)
            # Tuple: sort by mastery weight, then by how overdue it is
            return (weight, nr_dt)

        return nr_dt

    due.sort(key=sort_key)
    return due
