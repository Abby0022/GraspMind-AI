"""Knowledge extraction — auto-extract concepts from conversations.

Analyzes chat messages to identify academic concepts the student
is engaging with, then updates the semantic memory model.
"""

import json
import logging

from graspmind.rag.llm_client import complete_chat

logger = logging.getLogger(__name__)

EXTRACT_CONCEPTS_PROMPT = """Analyze this student-tutor conversation and extract academic concepts being discussed. For each concept, determine if the student demonstrated understanding or confusion.

Output ONLY valid JSON — an array of objects:
```json
[
  {{"concept": "mitosis", "understood": true}},
  {{"concept": "meiosis", "understood": false}}
]
```

Rules:
- Only include specific academic/technical concepts
- "understood" = true if student answered correctly or showed comprehension
- "understood" = false if student asked for clarification, got confused, or answered wrong
- Maximum 10 concepts per analysis

Conversation:
{conversation}

JSON output:"""


async def extract_concepts_from_chat(
    messages: list[dict],
    max_messages: int = 20,
    user_id: str = "",
) -> list[dict]:
    """Extract academic concepts and comprehension signals from a chat.

    Args:
        messages: Chat messages [{"role": "...", "content": "..."}].
        max_messages: Max messages to analyze.

    Returns:
        List of dicts: [{"concept": "...", "understood": bool}, ...]
    """
    if len(messages) < 2:
        return []

    trimmed = messages[-max_messages:]
    conversation_text = "\n".join(
        f"{msg['role'].upper()}: {msg['content'][:400]}"
        for msg in trimmed
    )

    prompt_messages = [
        {"role": "system", "content": "You extract academic concepts from conversations. Return ONLY valid JSON."},
        {"role": "user", "content": EXTRACT_CONCEPTS_PROMPT.format(conversation=conversation_text)},
    ]

    try:
        result = await complete_chat(prompt_messages, user_id=user_id)
        result = result.strip()

        # Handle markdown code blocks
        if result.startswith("```"):
            lines = result.split("\n")
            result = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        concepts = json.loads(result)
        if isinstance(concepts, list):
            # Validate structure
            valid = []
            for c in concepts:
                if isinstance(c, dict) and "concept" in c:
                    valid.append({
                        "concept": str(c["concept"]).lower().strip(),
                        "understood": bool(c.get("understood", True)),
                    })
            logger.info("Extracted %d concepts from chat", len(valid))
            return valid

    except (json.JSONDecodeError, Exception) as exc:
        logger.warning("Concept extraction failed: %s", exc)

    return []


async def analyze_quiz_results(
    questions: list[dict],
    results: list[dict],
) -> list[dict]:
    """Extract concepts and understanding from quiz results.

    Simpler than chat analysis — directly maps questions to
    correct/incorrect answers.

    Args:
        questions: Quiz questions with topics.
        results: Graded results with is_correct flags.

    Returns:
        List of concept-understanding pairs.
    """
    concepts = []
    seen = set()

    for result in results:
        q_id = result.get("question_id", "")
        question = next((q for q in questions if q.get("id") == q_id), None)
        if not question:
            continue

        # Extract concept from source_title or question text
        concept = question.get("source_title", "").lower()
        if not concept:
            # Use first few meaningful words of the question
            words = question.get("question", "").lower().split()[:5]
            concept = " ".join(w for w in words if len(w) > 3)

        if concept and concept not in seen:
            seen.add(concept)
            concepts.append({
                "concept": concept,
                "understood": result.get("is_correct", False),
            })

    return concepts
