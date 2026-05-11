"""Flashcard API routes — generate, review, export.

Endpoints:
- POST /flashcards/generate: Generate flashcards from notebook sources
- GET /flashcards/: List flashcard decks for a notebook
- GET /flashcards/{deck_id}: Get a deck with all cards
- POST /flashcards/{deck_id}/review: Submit review result (SM-2)
- GET /flashcards/{deck_id}/export: Export deck to CSV/JSON
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from graspmind.api.deps import AuthUser, get_user_supabase
from graspmind.memory.semantic import get_weak_areas
from graspmind.security.input_sanitizer import sanitize_filename
from graspmind.security.rate_limiter import RateLimiter
from graspmind.study.flashcard_generator import (
    CardType,
    Flashcard,
    export_to_anki_csv,
    export_to_csv,
    export_to_json,
    generate_flashcards,
)
from graspmind.study.spaced_repetition import CardState, sm2_schedule

router = APIRouter(prefix="/notebooks/{notebook_id}/flashcards", tags=["Flashcards"])


# ── Schemas ─────────────────────────────────────────────────

class GenerateFlashcardsRequest(BaseModel):
    # ge=1 prevents zero/negative; le=50 caps compute cost
    num_cards: int = Field(default=15, ge=1, le=50)
    difficulty: str | None = None


class ReviewCardRequest(BaseModel):
    card_id: str
    # SM-2 algorithm requires quality in [0, 5]. Values outside this range
    # will silently corrupt the spaced repetition schedule.
    quality: int = Field(..., ge=0, le=5, description="SM-2 quality rating (0=blackout, 5=perfect)")


# ── Routes ──────────────────────────────────────────────────

@router.post(
    "/generate",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=60))],
)
async def generate_flashcards_endpoint(
    notebook_id: str,
    body: GenerateFlashcardsRequest,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Generate a flashcard deck from notebook sources."""
    # Verify notebook ownership
    nb = await supabase.table("notebooks").select("id, title, exam_date").eq(
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

    # Fetch source chunks
    sources = await supabase.table("sources").select("id, title").eq(
        "notebook_id", notebook_id
    ).eq("status", "ready").execute()

    if not sources.data:
        raise HTTPException(status_code=400, detail="No ready sources found")

    source_ids = [s["id"] for s in sources.data]
    source_titles = {s["id"]: s["title"] for s in sources.data}

    chunks = await supabase.table("chunks").select(
        "content, source_id, page_num"
    ).in_("source_id", source_ids).eq(
        "chunk_type", "parent"
    ).limit(25).execute()

    if not chunks.data:
        raise HTTPException(status_code=400, detail="No content found")

    context_texts = [
        {
            "content": c["content"],
            "source_title": source_titles.get(c["source_id"], ""),
            "page_num": c.get("page_num"),
        }
        for c in chunks.data
    ]

    # Fetch weak areas
    weak_areas = await get_weak_areas(user.id, limit=5)
    weak_concepts = [node.concept for node in weak_areas] if weak_areas else None

    # Generate cards
    cards = await generate_flashcards(
        context_texts=context_texts,
        num_cards=body.num_cards,
        difficulty=body.difficulty,
        weak_concepts=weak_concepts,
        is_cram_mode=is_cram_mode,
        user_id=user.id,
    )

    if not cards:
        raise HTTPException(status_code=500, detail="Failed to generate flashcards")

    # Create deck
    deck_title = f"Flashcards — {nb.data[0]['title']}"
    deck_result = await supabase.table("flashcard_decks").insert({
        "notebook_id": notebook_id,
        "user_id": user.id,
        "title": deck_title,
        "card_count": len(cards),
    }).select().single().execute()

    if not deck_result.data:
        raise HTTPException(status_code=500, detail="Failed to create deck")

    deck_id = deck_result.data["id"]

    # Insert cards
    card_records = [
        {
            "deck_id": deck_id,
            "front": card.front,
            "back": card.back,
            "card_type": card.card_type.value,
            "tags": card.tags,
            "ease_factor": 2.5,
            "interval": 0,
            "repetitions": 0,
        }
        for card in cards
    ]

    await supabase.table("flashcards").insert(card_records).execute()

    return {
        "deck_id": deck_id,
        "title": deck_title,
        "card_count": len(cards),
    }


@router.get("/")
async def list_decks(
    notebook_id: str,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """List all flashcard decks for a notebook."""
    result = await supabase.table("flashcard_decks").select(
        "id, title, card_count, created_at"
    ).eq("notebook_id", notebook_id).eq(
        "user_id", user.id
    ).order("created_at", desc=True).execute()

    return result.data or []


@router.get("/{deck_id}")
async def get_deck(
    notebook_id: str,
    deck_id: str,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Get a deck with all its cards."""
    deck = await supabase.table("flashcard_decks").select("*").eq(
        "id", deck_id
    ).eq("user_id", user.id).single().execute()

    if not deck.data:
        raise HTTPException(status_code=404, detail="Deck not found")

    cards = await supabase.table("flashcards").select(
        "id, front, back, card_type, tags, ease_factor, interval, repetitions, next_review"
    ).eq("deck_id", deck_id).execute()

    return {
        **deck.data,
        "cards": cards.data or [],
    }


@router.post("/{deck_id}/review")
async def review_card(
    notebook_id: str,
    deck_id: str,
    body: ReviewCardRequest,
    user: AuthUser,
    supabase=Depends(get_user_supabase),
):
    """Submit a review result for a single card (SM-2 scheduling)."""
    # Verify the card belongs to the specified deck AND the deck belongs
    # to the current user. Without both checks, any user can update any card.
    deck = await supabase.table("flashcard_decks").select("id").eq(
        "id", deck_id
    ).eq("user_id", user.id).single().execute()

    if not deck.data:
        raise HTTPException(status_code=404, detail="Deck not found")

    # Now fetch the card — scoped to this deck to prevent cross-deck IDOR
    card = await supabase.table("flashcards").select("*").eq(
        "id", body.card_id
    ).eq("deck_id", deck_id).single().execute()

    if not card.data:
        raise HTTPException(status_code=404, detail="Card not found")

    state = CardState(
        ease_factor=card.data.get("ease_factor", 2.5),
        interval=card.data.get("interval", 0),
        repetitions=card.data.get("repetitions", 0),
    )
    new_state = sm2_schedule(state, body.quality)

    # Update is also scoped to deck_id to prevent cross-deck tampering
    await supabase.table("flashcards").update({
        "ease_factor": new_state.ease_factor,
        "interval": new_state.interval,
        "repetitions": new_state.repetitions,
        "next_review": new_state.next_review.isoformat() if new_state.next_review else None,
        "last_reviewed": new_state.last_reviewed.isoformat() if new_state.last_reviewed else None,
    }).eq("id", body.card_id).eq("deck_id", deck_id).execute()

    return {
        "card_id": body.card_id,
        "new_interval": new_state.interval,
        "next_review": new_state.next_review.isoformat() if new_state.next_review else None,
    }


@router.get("/{deck_id}/export")
async def export_deck(
    notebook_id: str,
    deck_id: str,
    user: AuthUser,
    # Renamed from 'format' to avoid shadowing the Python built-in
    export_format: str = "csv",
    supabase=Depends(get_user_supabase),
):
    """Export a flashcard deck. Formats: csv, anki, json."""
    deck = await supabase.table("flashcard_decks").select("title").eq(
        "id", deck_id
    ).eq("user_id", user.id).single().execute()

    if not deck.data:
        raise HTTPException(status_code=404, detail="Deck not found")

    cards_result = await supabase.table("flashcards").select(
        "front, back, card_type, tags"
    ).eq("deck_id", deck_id).execute()

    cards = [
        Flashcard(
            front=c["front"],
            back=c["back"],
            card_type=CardType(c.get("card_type", "basic")),
            tags=c.get("tags", []),
        )
        for c in (cards_result.data or [])
    ]

    if export_format == "anki":
        content = export_to_anki_csv(cards)
        filename = f"{sanitize_filename(deck.data['title'])}.txt"
    elif export_format == "json":
        content = export_to_json(cards)
        filename = f"{sanitize_filename(deck.data['title'])}.json"
    else:
        content = export_to_csv(cards)
        filename = f"{sanitize_filename(deck.data['title'])}.csv"

    return PlainTextResponse(
        content=content,
        media_type="text/plain",
        # sanitize_filename prevents header injection via user-controlled deck title
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
