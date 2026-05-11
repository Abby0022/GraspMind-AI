"""Quiz generator — creates questions from source content using LLM.

Supports three question types:
- MCQ (multiple choice, 4 options)
- Fill-in-the-blank
- Short answer

Uses retrieved context to generate grounded, curriculum-aligned questions.
"""

import json
import logging
from dataclasses import dataclass, field
from enum import StrEnum

from graspmind.rag.llm_client import complete_chat

logger = logging.getLogger(__name__)


class QuestionType(StrEnum):
    MCQ = "mcq"
    FILL_BLANK = "fill_blank"
    SHORT_ANSWER = "short_answer"


@dataclass
class Question:
    """A single generated question."""

    question: str
    question_type: QuestionType
    correct_answer: str
    options: list[str] = field(default_factory=list)  # MCQ only
    explanation: str = ""
    source_title: str = ""
    page_num: int | None = None
    difficulty: str = "medium"  # easy | medium | hard


QUIZ_SYSTEM_PROMPT = """You are an expert educational quiz creator. Generate high-quality study questions from the provided source material.

## Rules
1. Questions MUST be based ONLY on the provided context — never invent facts.
2. Each question should test a distinct concept.
3. For MCQ: provide exactly 4 options (A-D), with only ONE correct answer. Distractors should be plausible but clearly wrong.
4. For fill_blank: use ___ to mark the blank. The sentence should have enough context to determine the answer.
5. For short_answer: expect 1-3 sentence answers.
6. Include a brief explanation for each answer.
7. Vary difficulty: mix easy recall, medium application, and hard analysis questions.

## Output Format
Return ONLY valid JSON — an array of question objects:
```json
[
  {
    "question": "What is the powerhouse of the cell?",
    "question_type": "mcq",
    "correct_answer": "Mitochondria",
    "options": ["Nucleus", "Mitochondria", "Ribosome", "Golgi apparatus"],
    "explanation": "Mitochondria produce ATP through cellular respiration.",
    "difficulty": "easy"
  }
]
```"""


async def generate_quiz(
    context_texts: list[dict],
    num_questions: int = 10,
    question_types: list[QuestionType] | None = None,
    difficulty: str | None = None,
    weak_concepts: list[str] | None = None,
    is_cram_mode: bool = False,
    user_id: str = "",
) -> list[Question]:
    """Generate quiz questions from source context.

    Args:
        context_texts: List of dicts with 'content', 'source_title', 'page_num'.
        num_questions: Number of questions to generate.
        question_types: Types of questions to include (default: all types).
        difficulty: Target difficulty level (default: mixed).
        weak_concepts: List of concepts the student is struggling with.
        is_cram_mode: If true, applies strict Cram Mode generation rules.

    Returns:
        List of Question objects.
    """
    if not context_texts:
        return []

    types = question_types or [QuestionType.MCQ, QuestionType.FILL_BLANK, QuestionType.SHORT_ANSWER]
    types_str = ", ".join(types)

    # Build context block
    context_block = ""
    for i, ctx in enumerate(context_texts, 1):
        source_info = f'[Source: "{ctx.get("source_title", "Unknown")}"'
        if ctx.get("page_num"):
            source_info += f', Page {ctx["page_num"]}'
        source_info += "]"
        context_block += f"\n### Context {i} {source_info}\n{ctx['content']}\n"

    difficulty_instruction = ""
    if difficulty:
        difficulty_instruction = f"\nTarget difficulty: {difficulty}."

    adaptive_instruction = ""
    if is_cram_mode and weak_concepts:
        weak_str = ", ".join(weak_concepts)
        adaptive_instruction = f"\nCRAM MODE ACTIVE: The student has an exam very soon and is struggling with: {weak_str}. STRICTLY PRIORITIZE these weak concepts. Create challenging questions to rigorously test their knowledge and ensure mastery before the exam."
    elif weak_concepts and (not difficulty or difficulty == "mixed"):
        weak_str = ", ".join(weak_concepts)
        adaptive_instruction = f"\nADAPTIVE INSTRUCTION: The student is currently struggling with the following concepts: {weak_str}. Please prioritize creating questions about these concepts. To build their confidence, make the questions regarding these weak concepts slightly easier (testing fundamental understanding)."

    user_prompt = f"""Generate exactly {num_questions} study questions from the following source material.

Question types to include: {types_str}
{difficulty_instruction}
{adaptive_instruction}

## Source Material
{context_block}

Return ONLY the JSON array, no other text."""

    messages = [
        {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    try:
        response = await complete_chat(messages, user_id=user_id)

        if "[Error" in response or "RATE_LIMIT" in response:
            raise ValueError("RATE_LIMIT")

        # Parse JSON from response (handle markdown code blocks)
        json_str = response.strip()
        if json_str.startswith("```"):
            # Remove markdown code fence
            lines = json_str.split("\n")
            json_str = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        raw_questions = json.loads(json_str)

        questions: list[Question] = []
        for q in raw_questions:
            qtype = q.get("question_type", "mcq")
            try:
                qt = QuestionType(qtype)
            except ValueError:
                qt = QuestionType.MCQ

            questions.append(Question(
                question=q.get("question", ""),
                question_type=qt,
                correct_answer=q.get("correct_answer", ""),
                options=q.get("options", []),
                explanation=q.get("explanation", ""),
                source_title=q.get("source_title", ""),
                page_num=q.get("page_num"),
                difficulty=q.get("difficulty", "medium"),
            ))

        # Backfill source info from context
        for question in questions:
            if not question.source_title and context_texts:
                question.source_title = context_texts[0].get("source_title", "")

        logger.info("Generated %d quiz questions", len(questions))
        return questions

    except ValueError as exc:
        if str(exc) == "RATE_LIMIT":
            raise
        logger.exception("Quiz generation failed")
        return []
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse quiz JSON: %s", exc)
        return []
    except Exception:
        logger.exception("Quiz generation failed")
        return []
