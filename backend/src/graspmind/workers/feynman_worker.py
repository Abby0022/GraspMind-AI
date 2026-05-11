"""Feynman Technique worker — evaluates student explanations.

Runs asynchronously to grade a student's explanation and
update their semantic knowledge profile without blocking the chat.
"""

import json
import logging

from graspmind.rag.llm_client import complete_chat
from graspmind.workers.broker import broker

logger = logging.getLogger(__name__)

EVALUATION_PROMPT = """You are an expert AI evaluator assessing a student's explanation of a concept using the Feynman Technique.

## Task
Read the student's explanation and evaluate how well they understand the core concept.
You must output a JSON object with three fields:
1. "concept": The main topic/concept the student was trying to explain (1-3 words).
2. "score": An integer from 0 to 5.
   - 0: Completely incorrect or missed the point
   - 1: Mostly incorrect with major misconceptions
   - 2: Partially correct but lacking key elements
   - 3: Basically correct but with some confusion or omissions
   - 4: Good explanation, mostly accurate
   - 5: Perfect, simple, and accurate explanation
3. "feedback": A 1-sentence summary of what they got right or wrong.

## Output Format
Return ONLY valid JSON.
```json
{
  "concept": "Mitochondria",
  "score": 4,
  "feedback": "Correctly identified as the powerhouse of the cell, but missed mentioning ATP production."
}
```
"""

@broker.task(task_name="feynman.evaluate_explanation")
async def evaluate_explanation_task(
    user_id: str,
    notebook_id: str,
    user_explanation: str,
    context_text: str = "",
) -> dict:
    """Evaluate a student's explanation and update semantic memory.

    Args:
        user_id: User UUID.
        notebook_id: Notebook UUID.
        user_explanation: The student's message trying to explain the concept.
        context_text: Optional retrieved context to ground the evaluation.
    """
    if not user_explanation or len(user_explanation.strip()) < 10:
        return {"status": "skipped", "reason": "too_short"}

    messages = [
        {"role": "system", "content": EVALUATION_PROMPT},
    ]

    if context_text:
        messages.append({
            "role": "system",
            "content": f"## Source Material for Reference\n{context_text}"
        })

    messages.append({
        "role": "user",
        "content": f"Evaluate this student explanation:\n\n{user_explanation}"
    })

    try:
        response = await complete_chat(messages, user_id=user_id)

        # Clean JSON markdown if present
        json_str = response.strip()
        if json_str.startswith("```"):
            lines = json_str.split("\n")
            json_str = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        result = json.loads(json_str)

        concept = result.get("concept", "")
        score = int(result.get("score", 0))

        if concept:
            from graspmind.memory.semantic import update_knowledge
            # A score of 3 or higher is considered a "correct" review for SM-2/Mastery purposes
            is_correct = score >= 3

            await update_knowledge(
                user_id=user_id,
                concepts=[concept],
                correct=[is_correct],
                notebook_id=notebook_id,
            )

            logger.info("Feynman evaluation for %s: score=%d, concept=%s", user_id[:8], score, concept)

            return {
                "status": "success",
                "concept": concept,
                "score": score,
                "is_correct": is_correct
            }

    except Exception as exc:
        logger.error("Failed to evaluate Feynman explanation: %s", exc)
        return {"status": "failed", "error": str(exc)}

    return {"status": "failed", "reason": "invalid_json"}
