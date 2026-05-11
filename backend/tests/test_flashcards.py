"""Tests for flashcard generator and export functions."""

from graspmind.study.flashcard_generator import (
    CardType,
    Flashcard,
    export_to_anki_csv,
    export_to_csv,
    export_to_json,
)

# ── CardType tests ──────────────────────────────────────────

def test_card_type_values():
    """CardType should have expected values."""
    assert CardType.BASIC == "basic"
    assert CardType.CLOZE == "cloze"
    assert CardType.REVERSED == "reversed"


def test_flashcard_dataclass():
    """Flashcard should hold front/back and metadata."""
    card = Flashcard(
        front="What is photosynthesis?",
        back="The process by which plants convert light energy to chemical energy",
        card_type=CardType.BASIC,
        tags=["biology", "plants"],
        source_title="Bio 101",
        page_num=42,
    )

    assert card.front == "What is photosynthesis?"
    assert card.back.startswith("The process")
    assert len(card.tags) == 2
    assert card.page_num == 42


def test_flashcard_defaults():
    """Flashcard should have sensible defaults."""
    card = Flashcard(front="Q", back="A")
    assert card.card_type == CardType.BASIC
    assert card.tags == []
    assert card.source_title == ""
    assert card.page_num is None


# ── CSV export tests ────────────────────────────────────────

def test_export_csv_basic():
    """CSV export should produce tab-separated values."""
    cards = [
        Flashcard(front="What is DNA?", back="Deoxyribonucleic acid", tags=["biology"]),
        Flashcard(front="H2O is?", back="Water", tags=["chemistry"]),
    ]

    csv = export_to_csv(cards)

    lines = csv.strip().split("\n")
    assert len(lines) == 2
    assert "What is DNA?" in lines[0]
    assert "Deoxyribonucleic acid" in lines[0]
    assert "\t" in lines[0]  # Tab-separated


def test_export_csv_empty():
    """CSV export should handle empty list."""
    csv = export_to_csv([])
    assert csv == ""


# ── Anki export tests ──────────────────────────────────────

def test_export_anki_header():
    """Anki export should include format headers."""
    cards = [Flashcard(front="Q", back="A")]

    result = export_to_anki_csv(cards)

    assert "#separator:semicolon" in result
    assert "#html:true" in result


def test_export_anki_semicolon_separated():
    """Anki export should use semicolons."""
    cards = [
        Flashcard(front="What is RNA?", back="Ribonucleic acid", tags=["bio"]),
    ]

    result = export_to_anki_csv(cards)
    lines = result.strip().split("\n")

    # Last line should be the card (after 3 header lines)
    card_line = lines[-1]
    assert "What is RNA?" in card_line
    assert "Ribonucleic acid" in card_line
    assert ";" in card_line


def test_export_anki_escapes_semicolons():
    """Anki export should escape semicolons in content."""
    cards = [
        Flashcard(front="A; B; C", back="Answer; here"),
    ]

    result = export_to_anki_csv(cards)
    # Semicolons in content should be replaced with commas
    lines = result.strip().split("\n")
    card_line = lines[-1]
    parts = card_line.split(";")
    assert len(parts) == 3  # front, back, tags


# ── JSON export tests ──────────────────────────────────────

def test_export_json_structure():
    """JSON export should produce valid structured output."""
    import json

    cards = [
        Flashcard(
            front="What is mitosis?",
            back="Cell division",
            card_type=CardType.BASIC,
            tags=["biology"],
        ),
    ]

    result = export_to_json(cards)
    data = json.loads(result)

    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["front"] == "What is mitosis?"
    assert data[0]["card_type"] == "basic"
    assert data[0]["tags"] == ["biology"]


def test_export_json_preserves_card_types():
    """JSON export should preserve card type values."""
    import json

    cards = [
        Flashcard(front="Q1", back="A1", card_type=CardType.BASIC),
        Flashcard(front="Q2", back="A2", card_type=CardType.CLOZE),
        Flashcard(front="Q3", back="A3", card_type=CardType.REVERSED),
    ]

    data = json.loads(export_to_json(cards))
    types = [c["card_type"] for c in data]
    assert types == ["basic", "cloze", "reversed"]
