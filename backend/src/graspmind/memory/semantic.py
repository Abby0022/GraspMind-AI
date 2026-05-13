"""Semantic Memory — student knowledge model in Qdrant.

Layer 3 of the 3-tier memory system. Tracks what the student
knows and doesn't know based on:
- Questions asked (knowledge gaps)
- Correct quiz answers (mastered concepts)
- Topics revisited (struggling areas)
- Conversation patterns (learning style)

Stored as vectors in a dedicated Qdrant collection per user,
enabling semantic search for relevant knowledge state during tutoring.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

from graspmind.config import get_settings
from graspmind.rag.embedder import embed_texts

logger = logging.getLogger(__name__)


class MasteryLevel(StrEnum):
    """Student's mastery level for a concept."""

    UNKNOWN = "unknown"  # Never encountered
    STRUGGLING = "struggling"  # Asked multiple times, failed quizzes
    LEARNING = "learning"  # Some correct answers, still asking
    FAMILIAR = "familiar"  # Mostly correct, occasional review
    MASTERED = "mastered"  # Consistently correct, long intervals


@dataclass
class KnowledgeNode:
    """A single concept in the student's knowledge model."""

    concept: str
    mastery: MasteryLevel = MasteryLevel.UNKNOWN
    times_asked: int = 0
    times_correct: int = 0
    last_seen: str = ""
    related_topics: list[str] = field(default_factory=list)
    notebook_id: str = ""


def compute_mastery(times_asked: int, times_correct: int) -> MasteryLevel:
    """Compute mastery level from interaction history.

    Args:
        times_asked: Number of times the concept appeared in questions.
        times_correct: Number of correct quiz/chat responses.

    Returns:
        The computed MasteryLevel.
    """
    if times_asked == 0:
        return MasteryLevel.UNKNOWN

    accuracy = times_correct / times_asked if times_asked > 0 else 0.0

    if accuracy >= 0.9 and times_asked >= 3:
        return MasteryLevel.MASTERED
    elif accuracy >= 0.7:
        return MasteryLevel.FAMILIAR
    elif accuracy >= 0.4:
        return MasteryLevel.LEARNING
    else:
        return MasteryLevel.STRUGGLING


async def update_knowledge(
    user_id: str,
    concepts: list[str],
    correct: list[bool],
    notebook_id: str = "",
) -> list[KnowledgeNode]:
    """Update the student's knowledge model after a quiz or interaction.

    Args:
        user_id: User UUID.
        concepts: List of concepts tested.
        correct: Whether each concept was answered correctly.
        notebook_id: Notebook context.

    Returns:
        Updated KnowledgeNode objects.
    """
    import asyncio
    from qdrant_client.models import PointStruct
    from graspmind.rag.vector_store import get_qdrant_client, ensure_collection

    settings = get_settings()
    client = get_qdrant_client(settings)
    
    # Use cached ensure_collection for knowledge as well (optional, but good for consistency)
    # Actually, knowledge uses a different collection naming pattern here
    collection_name = f"knowledge_{user_id[:8]}"
    
    # We'll use a local check for now, but better to unify with vector_store.py naming
    from graspmind.rag.vector_store import _verified_collections
    if collection_name not in _verified_collections:
        collections = (await client.get_collections()).collections
        if not any(c.name == collection_name for c in collections):
            from qdrant_client.models import Distance, VectorParams
            await client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=settings.embedding_dimensions,
                    distance=Distance.COSINE,
                ),
            )
        _verified_collections.add(collection_name)

    # Embed concepts
    embeddings = await embed_texts(concepts, task="RETRIEVAL_DOCUMENT")

    # ── Parallel Scroll for existing nodes ───────────────────
    async def fetch_existing(concept: str):
        try:
            res = await client.scroll(
                collection_name=collection_name,
                scroll_filter={
                    "must": [{"key": "concept", "match": {"value": concept.lower()}}]
                },
                limit=1,
                with_payload=True,
            )
            return concept, res[0]
        except Exception:
            return concept, []

    existing_results_raw = await asyncio.gather(*[fetch_existing(c) for c in concepts])
    existing_map = {c: res for c, res in existing_results_raw}

    nodes: list[KnowledgeNode] = []
    points: list[PointStruct] = []

    for _i, (concept, is_correct, embedding) in enumerate(zip(concepts, correct, embeddings, strict=False)):
        existing = existing_map.get(concept, [])
        
        times_asked = 1
        times_correct = 1 if is_correct else 0

        if existing:
            old_payload = existing[0].payload
            times_asked = old_payload.get("times_asked", 0) + 1
            times_correct = old_payload.get("times_correct", 0) + (1 if is_correct else 0)

        mastery = compute_mastery(times_asked, times_correct)
        node = KnowledgeNode(
            concept=concept.lower(),
            mastery=mastery,
            times_asked=times_asked,
            times_correct=times_correct,
            last_seen=datetime.now(UTC).isoformat(),
            notebook_id=notebook_id,
        )
        nodes.append(node)

        # Deterministic point ID to avoid duplicates
        import hashlib
        point_id = int(hashlib.md5(f"{user_id}:{concept.lower()}".encode()).hexdigest(), 16) % (2**63)
        
        points.append(PointStruct(
            id=point_id,
            vector=embedding,
            payload={
                "concept": concept.lower(),
                "mastery": mastery.value,
                "times_asked": times_asked,
                "times_correct": times_correct,
                "last_seen": node.last_seen,
                "notebook_id": notebook_id,
            },
        ))

    if points:
        await client.upsert(collection_name=collection_name, points=points)
        logger.info("Updated %d knowledge nodes for user %s", len(points), user_id[:8])

    return nodes



async def get_weak_areas(
    user_id: str,
    limit: int = 10,
) -> list[KnowledgeNode]:
    """Get the student's weakest concepts for targeted review.

    Returns concepts sorted by lowest mastery first.
    """
    from qdrant_client import AsyncQdrantClient

    settings = get_settings()
    client = AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)

    collection_name = f"knowledge_{user_id[:8]}"

    try:
        # Ensure collection exists before scrolling
        collections = (await client.get_collections()).collections
        if not any(c.name == collection_name for c in collections):
            return []

        scroll_result = await client.scroll(
            collection_name=collection_name,
            scroll_filter={
                "must": [
                    {"key": "mastery", "match": {"any": ["struggling", "learning"]}}
                ]
            },
            limit=limit,
            with_payload=True,
        )
        results = scroll_result[0]

        nodes = [
            KnowledgeNode(
                concept=r.payload["concept"],
                mastery=MasteryLevel(r.payload.get("mastery", "unknown")),
                times_asked=r.payload.get("times_asked", 0),
                times_correct=r.payload.get("times_correct", 0),
                last_seen=r.payload.get("last_seen", ""),
            )
            for r in results
        ]

        # Sort by accuracy (weakest first)
        nodes.sort(key=lambda n: n.times_correct / max(n.times_asked, 1))
        return nodes

    except Exception as exc:
        logger.warning("Failed to get weak areas: %s", exc)
        return []


async def get_cross_links(
    user_id: str,
    notebook_id: str,
    limit: int = 5,
) -> list[KnowledgeNode]:
    """Find concepts in other notebooks that relate to the current one.

    Looks for exact concept overlaps across the user's library.
    """
    from qdrant_client import AsyncQdrantClient

    settings = get_settings()
    client = AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)

    collection_name = f"knowledge_{user_id[:8]}"

    try:
        # Ensure collection exists before scrolling
        collections = (await client.get_collections()).collections
        if not any(c.name == collection_name for c in collections):
            return []

        # 1. Get concepts in current notebook
        current_scroll = await client.scroll(
            collection_name=collection_name,
            scroll_filter={
                "must": [{"key": "notebook_id", "match": {"value": notebook_id}}]
            },
            limit=50,
            with_payload=True,
        )
        current_results = current_scroll[0]

        if not current_results:
            return []

        current_concepts = [r.payload["concept"] for r in current_results]

        # 2. Search for these concepts in OTHER notebooks
        other_scroll = await client.scroll(
            collection_name=collection_name,
            scroll_filter={
                "must": [
                    {"key": "concept", "match": {"any": current_concepts}},
                ],
                "must_not": [
                    {"key": "notebook_id", "match": {"value": notebook_id}}
                ]
            },
            limit=limit,
            with_payload=True,
        )
        other_results = other_scroll[0]

        return [
            KnowledgeNode(
                concept=r.payload["concept"],
                mastery=MasteryLevel(r.payload.get("mastery", "unknown")),
                times_asked=r.payload.get("times_asked", 0),
                times_correct=r.payload.get("times_correct", 0),
                last_seen=r.payload.get("last_seen", ""),
                notebook_id=r.payload.get("notebook_id", ""),
            )
            for r in other_results
        ]

    except Exception as exc:
        logger.warning("Failed to get cross-links: %s", exc)
        return []


def format_knowledge_for_prompt(nodes: list[KnowledgeNode]) -> str:
    """Format knowledge state for LLM context.

    Tells the tutor what the student knows and struggles with.
    """
    if not nodes:
        return ""

    lines = ["## Student's Knowledge Profile"]

    struggling = [n for n in nodes if n.mastery in (MasteryLevel.STRUGGLING, MasteryLevel.LEARNING)]
    mastered = [n for n in nodes if n.mastery in (MasteryLevel.FAMILIAR, MasteryLevel.MASTERED)]

    if struggling:
        topics = ", ".join(n.concept for n in struggling[:8])
        lines.append(f"**Needs review:** {topics}")

    if mastered:
        topics = ", ".join(n.concept for n in mastered[:8])
        lines.append(f"**Strong in:** {topics}")

    return "\n".join(lines)
