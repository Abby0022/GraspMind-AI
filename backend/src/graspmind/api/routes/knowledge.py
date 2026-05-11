"""Mastery & Knowledge API routes.

Endpoints:
- GET /knowledge/profile — student's full knowledge profile
- GET /knowledge/weak-areas — concepts needing review
- GET /knowledge/strengths — mastered concepts
- POST /knowledge/update — manually update mastery (after quiz)
- GET /knowledge/recommendations — study recommendations based on gaps
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from graspmind.api.deps import AuthUser
from graspmind.memory.semantic import (
    get_weak_areas,
    update_knowledge,
)

router = APIRouter(prefix="/knowledge", tags=["Knowledge"])


# ── Schemas ─────────────────────────────────────────────────

class UpdateKnowledgeRequest(BaseModel):
    concepts: list[str]
    correct: list[bool]
    notebook_id: str = ""


class ConceptResponse(BaseModel):
    concept: str
    mastery: str
    times_asked: int
    times_correct: int
    accuracy: float
    last_seen: str = ""


# ── Routes ──────────────────────────────────────────────────

@router.get("/profile")
async def get_knowledge_profile(
    user: AuthUser,
):
    """Get the student's full knowledge profile.

    Returns all tracked concepts with mastery levels,
    grouped by mastery category.
    """
    from qdrant_client import QdrantClient

    from graspmind.config import get_settings

    settings = get_settings()
    client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)

    collection_name = f"knowledge_{user.id[:8]}"

    try:
        # Check if collection exists
        collections = client.get_collections().collections
        if not any(c.name == collection_name for c in collections):
            return {
                "total_concepts": 0,
                "mastery_distribution": {},
                "concepts": [],
            }

        # Fetch all knowledge nodes
        results, _ = client.scroll(
            collection_name=collection_name,
            limit=200,
            with_payload=True,
            with_vectors=False,
        )

        concepts = []
        mastery_counts: dict[str, int] = {
            "mastered": 0,
            "familiar": 0,
            "learning": 0,
            "struggling": 0,
            "unknown": 0,
        }

        for point in results:
            payload = point.payload or {}
            mastery = payload.get("mastery", "unknown")
            times_asked = payload.get("times_asked", 0)
            times_correct = payload.get("times_correct", 0)

            mastery_counts[mastery] = mastery_counts.get(mastery, 0) + 1

            accuracy = times_correct / times_asked if times_asked > 0 else 0.0
            concepts.append({
                "concept": payload.get("concept", ""),
                "mastery": mastery,
                "times_asked": times_asked,
                "times_correct": times_correct,
                "accuracy": round(accuracy * 100, 1),
                "last_seen": payload.get("last_seen", ""),
                "notebook_id": payload.get("notebook_id", ""),
            })

        # Sort: struggling first, then by times_asked descending
        mastery_order = {"struggling": 0, "learning": 1, "familiar": 2, "mastered": 3, "unknown": 4}
        concepts.sort(key=lambda c: (mastery_order.get(c["mastery"], 5), -c["times_asked"]))

        return {
            "total_concepts": len(concepts),
            "mastery_distribution": mastery_counts,
            "concepts": concepts,
        }

    except Exception as exc:
        return {
            "total_concepts": 0,
            "mastery_distribution": {},
            "concepts": [],
            "error": str(exc),
        }


@router.get("/weak-areas")
async def get_weak_areas_endpoint(
    user: AuthUser,
    limit: int = 10,
):
    """Get concepts the student is struggling with.

    Returns weak areas sorted by lowest accuracy,
    for targeted review and quiz generation.
    """
    nodes = await get_weak_areas(user.id, limit=limit)

    return {
        "weak_areas": [
            {
                "concept": n.concept,
                "mastery": n.mastery.value,
                "times_asked": n.times_asked,
                "times_correct": n.times_correct,
                "accuracy": round(n.times_correct / max(n.times_asked, 1) * 100, 1),
            }
            for n in nodes
        ],
        "total": len(nodes),
    }


@router.get("/strengths")
async def get_strengths(
    user: AuthUser,
):
    """Get concepts the student has mastered or is familiar with."""
    from qdrant_client import QdrantClient

    from graspmind.config import get_settings

    settings = get_settings()
    client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)

    collection_name = f"knowledge_{user.id[:8]}"

    try:
        results, _ = client.scroll(
            collection_name=collection_name,
            scroll_filter={
                "must": [
                    {"key": "mastery", "match": {"any": ["mastered", "familiar"]}}
                ]
            },
            limit=20,
            with_payload=True,
        )

        strengths = [
            {
                "concept": r.payload.get("concept", ""),
                "mastery": r.payload.get("mastery", ""),
                "times_asked": r.payload.get("times_asked", 0),
                "times_correct": r.payload.get("times_correct", 0),
            }
            for r in results
        ]

        return {"strengths": strengths, "total": len(strengths)}

    except Exception:
        return {"strengths": [], "total": 0}


@router.post("/update")
async def update_knowledge_endpoint(
    body: UpdateKnowledgeRequest,
    user: AuthUser,
):
    """Manually update knowledge model (e.g., after quiz submission).

    Accepts concept names and whether each was answered correctly.
    """
    if len(body.concepts) != len(body.correct):
        raise HTTPException(status_code=400, detail="concepts and correct arrays must be same length")

    if not body.concepts:
        raise HTTPException(status_code=400, detail="At least one concept required")

    nodes = await update_knowledge(
        user_id=user.id,
        concepts=body.concepts,
        correct=body.correct,
        notebook_id=body.notebook_id,
    )

    return {
        "updated": len(nodes),
        "concepts": [
            {
                "concept": n.concept,
                "mastery": n.mastery.value,
                "times_asked": n.times_asked,
                "times_correct": n.times_correct,
            }
            for n in nodes
        ],
    }


@router.get("/recommendations")
async def get_study_recommendations(
    user: AuthUser,
):
    """Generate study recommendations based on knowledge gaps.

    Analyzes weak areas and suggests what to focus on next.
    """
    weak = await get_weak_areas(user.id, limit=5)

    recommendations = []
    for node in weak:
        accuracy = node.times_correct / max(node.times_asked, 1)

        if accuracy < 0.3:
            action = "Review the fundamentals"
            urgency = "high"
        elif accuracy < 0.6:
            action = "Practice with more examples"
            urgency = "medium"
        else:
            action = "Do a quick refresher"
            urgency = "low"

        recommendations.append({
            "concept": node.concept,
            "action": action,
            "urgency": urgency,
            "accuracy": round(accuracy * 100, 1),
            "times_studied": node.times_asked,
        })

    return {
        "recommendations": recommendations,
        "total_weak": len(weak),
        "suggestion": (
            f"Focus on: {', '.join(r['concept'] for r in recommendations[:3])}"
            if recommendations
            else "You're doing great! Keep studying to maintain your progress."
        ),
    }
