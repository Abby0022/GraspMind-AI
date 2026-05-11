"""Quiz API routes — generate, submit, review.

Endpoints:
- POST /quizzes/generate: Generate quiz from a notebook's sources
- GET /quizzes/: List quizzes for a notebook
- GET /quizzes/{quiz_id}: Get a quiz with questions
- POST /quizzes/{quiz_id}/submit: Submit answers and get results
- GET /quizzes/due: Get quiz items due for spaced repetition review
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from graspmind.api.deps import AuthUser, get_user_supabase
from graspmind.memory.semantic import get_weak_areas
from graspmind.security.rate_limiter import RateLimiter
from graspmind.study.quiz_generator import QuestionType, generate_quiz
from graspmind.study.spaced_repetition import CardState, get_due_cards, sm2_schedule

router = APIRouter(prefix="/notebooks/{notebook_id}/quizzes", tags=["Quizzes"])


# ── Request/Response schemas ────────────────────────────────

class GenerateQuizRequest(BaseModel):
    # ge=1/le=30 prevents zero/negative requests and caps LLM compute cost
    num_questions: int = Field(default=10, ge=1, le=30)
    question_types: list[str] | None = None  # ["mcq", "fill_blank", "short_answer"]
    difficulty: str | None = None  # "easy" | "medium" | "hard"


class SubmitAnswerItem(BaseModel):
    question_id: str
    student_answer: str
    # SM-2 algorithm requires quality in [0, 5]. Values outside range corrupt state.
    quality: int = Field(default=3, ge=0, le=5, description="SM-2 quality rating (0=blackout, 5=perfect)")


class SubmitQuizRequest(BaseModel):
    answers: list[SubmitAnswerItem]


# ── Routes ──────────────────────────────────────────────────

@router.post(
    "/generate",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=60))],
)
async def generate_quiz_endpoint(
    notebook_id: str,
    body: GenerateQuizRequest,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Generate a quiz from notebook sources.

    Fetches ready source chunks, sends to LLM for question generation,
    and stores the quiz with questions in the database.
    """
    # Verify notebook ownership
    nb = await supabase.table("notebooks").select("id, exam_date").eq(
        "id", notebook_id
    ).eq("user_id", user.id).execute()
    if not nb.data:
        raise HTTPException(status_code=404, detail="Notebook not found")

    exam_date_str = nb.data[0].get("exam_date")
    is_cram_mode = False
    if exam_date_str:
        exam_date = datetime.fromisoformat(exam_date_str).replace(tzinfo=UTC)
        days_until = (exam_date - datetime.now(UTC)).days
        if 0 <= days_until <= 7:
            is_cram_mode = True

    # Fetch source chunks for context
    sources = await supabase.table("sources").select(
        "id, title"
    ).eq("notebook_id", notebook_id).eq("status", "ready").execute()

    if not sources.data:
        raise HTTPException(
            status_code=400,
            detail="No ready sources. Upload and process documents first.",
        )

    source_ids = [s["id"] for s in sources.data]
    source_titles = {s["id"]: s["title"] for s in sources.data}

    # Fetch chunks (parent chunks for richer context)
    chunks_result = await supabase.table("chunks").select(
        "content, source_id, page_num"
    ).in_("source_id", source_ids).eq(
        "chunk_type", "parent"
    ).limit(30).execute()

    if not chunks_result.data:
        raise HTTPException(status_code=400, detail="No content found in sources")

    context_texts = [
        {
            "content": c["content"],
            "source_title": source_titles.get(c["source_id"], ""),
            "page_num": c.get("page_num"),
        }
        for c in chunks_result.data
    ]

    # Parse question types
    q_types = None
    if body.question_types:
        q_types = [QuestionType(t) for t in body.question_types]

    # Fetch weak areas for adaptive quiz generation
    weak_areas = await get_weak_areas(user.id, limit=5)
    weak_concepts = [node.concept for node in weak_areas] if weak_areas else None

    # Generate questions via LLM
    try:
        questions = await generate_quiz(
            context_texts=context_texts,
            num_questions=body.num_questions,
            question_types=q_types,
            difficulty=body.difficulty,
            weak_concepts=weak_concepts,
            is_cram_mode=is_cram_mode,
            user_id=user.id,
        )
    except ValueError as e:
        if str(e) == "RATE_LIMIT":
            raise HTTPException(status_code=429, detail="AI API rate limit exceeded. Please wait a moment and try again.")
        raise

    if not questions:
        raise HTTPException(status_code=500, detail="Failed to generate quiz questions")

    # Create quiz record
    quiz_result = await supabase.table("quizzes").insert({
        "notebook_id": notebook_id,
        "user_id": user.id,
        "title": f"Quiz — {len(questions)} questions",
        "question_count": len(questions),
        "difficulty": body.difficulty or "mixed",
    }).select().single().execute()

    if not quiz_result.data:
        raise HTTPException(status_code=500, detail="Failed to create quiz")

    quiz_id = quiz_result.data["id"]

    # Insert questions
    question_records = [
        {
            "quiz_id": quiz_id,
            "question": q.question,
            "question_type": q.question_type.value,
            "correct_answer": q.correct_answer,
            "options": q.options,
            "explanation": q.explanation,
            "source_title": q.source_title,
            "page_num": q.page_num,
            "difficulty": q.difficulty,
            # SM-2 initial state
            "ease_factor": 2.5,
            "interval": 0,
            "repetitions": 0,
        }
        for q in questions
    ]

    await supabase.table("quiz_questions").insert(question_records).execute()

    return {
        "quiz_id": quiz_id,
        "question_count": len(questions),
        "types": list({q.question_type.value for q in questions}),
    }


@router.get("/")
async def list_quizzes(
    notebook_id: str,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """List all quizzes for a notebook."""
    result = await supabase.table("quizzes").select(
        "id, title, question_count, difficulty, score, completed_at, created_at"
    ).eq("notebook_id", notebook_id).eq(
        "user_id", user.id
    ).order("created_at", desc=True).execute()

    return result.data or []


@router.get("/{quiz_id}")
async def get_quiz(
    notebook_id: str,
    quiz_id: str,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Get a quiz with all questions (answers hidden until submitted)."""
    quiz = await supabase.table("quizzes").select("*").eq(
        "id", quiz_id
    ).eq("user_id", user.id).single().execute()

    if not quiz.data:
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = await supabase.table("quiz_questions").select(
        "id, question, question_type, options, difficulty"
    ).eq("quiz_id", quiz_id).execute()

    return {
        **quiz.data,
        "questions": questions.data or [],
    }


@router.post("/{quiz_id}/submit")
async def submit_quiz(
    notebook_id: str,
    quiz_id: str,
    body: SubmitQuizRequest,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Submit quiz answers, grade them, and update spaced repetition state.

    Returns graded results with correct answers and explanations.
    """
    # CRITICAL: Verify quiz ownership BEFORE fetching questions.
    # Without this, any authenticated user can submit answers for any quiz (IDOR).
    quiz_ownership = await supabase.table("quizzes").select("id").eq(
        "id", quiz_id
    ).eq("user_id", user.id).single().execute()

    if not quiz_ownership.data:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Fetch questions — safely scoped to the verified quiz_id
    questions = await supabase.table("quiz_questions").select("*").eq(
        "quiz_id", quiz_id
    ).execute()

    if not questions.data:
        raise HTTPException(status_code=404, detail="Quiz not found")

    question_map = {q["id"]: q for q in questions.data}

    results = []
    correct_count = 0

    for answer in body.answers:
        q = question_map.get(answer.question_id)
        if not q:
            continue

        # Grade the answer
        is_correct = (
            answer.student_answer.strip().lower()
            == q["correct_answer"].strip().lower()
        )
        if is_correct:
            correct_count += 1

        # Apply SM-2 scheduling
        state = CardState(
            ease_factor=q.get("ease_factor", 2.5),
            interval=q.get("interval", 0),
            repetitions=q.get("repetitions", 0),
        )
        new_state = sm2_schedule(state, answer.quality)

        # Update question with SM-2 state; scoped to quiz_id so a tampered
        # answer.question_id cannot modify questions from another quiz
        await supabase.table("quiz_questions").update({
            "ease_factor": new_state.ease_factor,
            "interval": new_state.interval,
            "repetitions": new_state.repetitions,
            "next_review": new_state.next_review.isoformat() if new_state.next_review else None,
            "last_reviewed": new_state.last_reviewed.isoformat() if new_state.last_reviewed else None,
        }).eq("id", answer.question_id).eq("quiz_id", quiz_id).execute()

        results.append({
            "question_id": answer.question_id,
            "is_correct": is_correct,
            "correct_answer": q["correct_answer"],
            "explanation": q.get("explanation", ""),
            "student_answer": answer.student_answer,
            "next_review": new_state.next_review.isoformat() if new_state.next_review else None,
        })

    # Update quiz record
    score = (correct_count / len(body.answers) * 100) if body.answers else 0
    await supabase.table("quizzes").update({
        "score": round(score, 1),
        "completed_at": datetime.now(UTC).isoformat(),
    }).eq("id", quiz_id).execute()

    # CRITICAL: Scope mastery update to the current user to prevent
    # cross-user data pollution if RLS is misconfigured.
    if score > 0:
        nb_res = await supabase.table("notebooks").select("mastery_score").eq(
            "id", notebook_id
        ).eq("user_id", user.id).single().execute()
        if nb_res.data:
            current_mastery = nb_res.data.get("mastery_score") or 0
            points_earned = (score / 100) * 5  # Max 5 points per quiz
            new_mastery = min(100, int(current_mastery + points_earned))

            await supabase.table("notebooks").update({
                "mastery_score": new_mastery
            }).eq("id", notebook_id).eq("user_id", user.id).execute()

    return {
        "quiz_id": quiz_id,
        "score": round(score, 1),
        "correct": correct_count,
        "total": len(body.answers),
        "results": results,
    }


@router.get("/due/review")
async def get_due_reviews(
    notebook_id: str,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Get quiz questions due for spaced repetition review."""
    # Fetch notebook for exam_date
    nb = await supabase.table("notebooks").select("id, exam_date").eq(
        "id", notebook_id
    ).eq("user_id", user.id).single().execute()

    if not nb.data:
        raise HTTPException(status_code=404, detail="Notebook not found")

    exam_date_str = nb.data.get("exam_date")
    exam_date = datetime.fromisoformat(exam_date_str).replace(tzinfo=UTC) if exam_date_str else None

    # Fetch quizzes for this notebook
    quizzes = await supabase.table("quizzes").select("id").eq(
        "notebook_id", notebook_id
    ).eq("user_id", user.id).execute()

    quiz_ids = [q["id"] for q in (quizzes.data or [])]
    if not quiz_ids:
        return {"due_count": 0, "questions": []}

    # Fetch questions
    result = await supabase.table("quiz_questions").select(
        "id, question, question_type, options, difficulty, quiz_id, "
        "ease_factor, interval, repetitions, next_review"
    ).in_("quiz_id", quiz_ids).execute()

    all_questions = result.data or []

    # Filter using Cram Mode aware scheduler
    due_questions = get_due_cards(all_questions, now=datetime.now(UTC), exam_date=exam_date)

    due_questions = due_questions[:20]

    return {
        "due_count": len(due_questions),
        "questions": due_questions,
    }
