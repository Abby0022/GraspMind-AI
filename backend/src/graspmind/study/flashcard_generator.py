"""Flashcard generator — create flashcards from source materials.

Generates front/back card pairs from document chunks using LLM.
Supports export to Anki (.apkg) and CSV formats.
"""

import json
import logging
from dataclasses import dataclass, field
from enum import StrEnum

from graspmind.rag.llm_client import complete_chat

logger = logging.getLogger(__name__)


class CardType(StrEnum):
    """Types of flashcards."""

    BASIC = "basic"  # Front: question, Back: answer
    CLOZE = "cloze"  # Fill-in-the-blank (cloze deletion)
    REVERSED = "reversed"  # Front: definition, Back: term


@dataclass
class Flashcard:
    """A single flashcard."""

    front: str
    back: str
    card_type: CardType = CardType.BASIC
    source_title: str = ""
    page_num: int | None = None
    tags: list[str] = field(default_factory=list)


GENERATE_PROMPT = """Generate {num_cards} flashcards from the following study material. Create a mix of:
- **Basic** cards (question on front, answer on back)
- **Cloze** cards (sentence with a key term blanked out, answer is the term)

Rules:
1. Each card should test ONE specific concept
2. Keep fronts concise (1-2 sentences max)
3. Keep backs short and precise
4. Include the most important concepts from the material
5. Avoid trivial or overly obvious cards
{difficulty_instruction}

Output ONLY valid JSON — an array of objects:
```json
[
  {{"front": "What is the powerhouse of the cell?", "back": "The mitochondria", "card_type": "basic", "tags": ["biology", "cell"]}},
  {{"front": "The process of {{{{c1::photosynthesis}}}} converts light energy to chemical energy.", "back": "photosynthesis", "card_type": "cloze", "tags": ["biology"]}}
]
```

Study Material:
{context}

JSON output:"""


async def generate_flashcards(
    context_texts: list[dict],
    num_cards: int = 15,
    difficulty: str | None = None,
    weak_concepts: list[str] | None = None,
    is_cram_mode: bool = False,
    user_id: str = "",
) -> list[Flashcard]:
    """Generate flashcards from source content using LLM.

    Args:
        context_texts: List of dicts with "content", "source_title", "page_num".
        num_cards: Number of cards to generate.
        difficulty: Optional difficulty filter.
        weak_concepts: List of concepts the student is struggling with.
        is_cram_mode: If true, applies strict Cram Mode generation rules.

    Returns:
        List of Flashcard objects.
    """
    if not context_texts:
        return []

    # Build context
    context = "\n\n".join(
        f"[Source: \"{t.get('source_title', 'Unknown')}\"]\n{t['content']}"
        for t in context_texts[:20]
    )

    difficulty_instruction = ""
    if difficulty == "easy":
        difficulty_instruction = "\nFocus on definitions and basic facts."
    elif difficulty == "hard":
        difficulty_instruction = "\nFocus on complex relationships, comparisons, and analysis."

    if is_cram_mode and weak_concepts:
        weak_str = ", ".join(weak_concepts)
        difficulty_instruction += f"\nCRAM MODE ACTIVE: The student has an exam very soon and is struggling with: {weak_str}. Prioritize generating flashcards specifically for these weak concepts to ensure mastery."

    prompt_messages = [
        {
            "role": "system",
            "content": "You create high-quality study flashcards. Return ONLY valid JSON.",
        },
        {
            "role": "user",
            "content": GENERATE_PROMPT.format(
                num_cards=num_cards,
                context=context[:8000],
                difficulty_instruction=difficulty_instruction,
            ),
        },
    ]

    try:
        result = await complete_chat(prompt_messages, user_id=user_id)
        result = result.strip()

        # Handle markdown code blocks
        if result.startswith("```"):
            lines = result.split("\n")
            result = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        raw_cards = json.loads(result)
        if not isinstance(raw_cards, list):
            return []

        cards: list[Flashcard] = []
        for card in raw_cards:
            if not isinstance(card, dict) or "front" not in card or "back" not in card:
                continue

            card_type = CardType.BASIC
            if card.get("card_type") == "cloze":
                card_type = CardType.CLOZE
            elif card.get("card_type") == "reversed":
                card_type = CardType.REVERSED

            cards.append(Flashcard(
                front=card["front"],
                back=card["back"],
                card_type=card_type,
                tags=card.get("tags", []),
            ))

        logger.info("Generated %d flashcards", len(cards))
        return cards

    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Flashcard generation failed: %s", exc)
        return []


def export_to_csv(cards: list[Flashcard]) -> str:
    """Export flashcards to CSV format (Quizlet/Anki import compatible).

    Format: front<TAB>back<TAB>tags
    """
    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output, delimiter="\t")

    for card in cards:
        tags = " ".join(card.tags) if card.tags else ""
        writer.writerow([card.front, card.back, tags])

    return output.getvalue()


def export_to_anki_csv(cards: list[Flashcard]) -> str:
    """Export flashcards to Anki-compatible CSV.

    Anki import format: front;back;tags
    Includes header comment for Anki.
    """
    lines = [
        "#separator:semicolon",
        "#html:true",
        "#columns:front;back;tags",
    ]

    for card in cards:
        front = card.front.replace(";", ",")
        back = card.back.replace(";", ",")
        tags = " ".join(card.tags) if card.tags else "graspmind"
        lines.append(f"{front};{back};{tags}")

    return "\n".join(lines)


def export_to_json(cards: list[Flashcard]) -> str:
    """Export flashcards to JSON format."""
    return json.dumps(
        [
            {
                "front": c.front,
                "back": c.back,
                "card_type": c.card_type.value,
                "tags": c.tags,
                "source_title": c.source_title,
                "page_num": c.page_num,
            }
            for c in cards
        ],
        indent=2,
    )
