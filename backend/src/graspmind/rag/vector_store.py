"""Qdrant vector store client wrapper.

Manages per-user collections, vector upserts, and search operations.
Supports both dense vectors (Gemini Embedding 2) and payload filtering.
"""

import logging

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    SearchParams,
    VectorParams,
)

from graspmind.config import Settings, get_settings

logger = logging.getLogger(__name__)

_client: QdrantClient | None = None


def get_qdrant_client(settings: Settings | None = None) -> QdrantClient:
    """Lazy singleton Qdrant client."""
    global _client  # noqa: PLW0603
    if _client is None:
        s = settings or get_settings()
        if s.qdrant_api_key:
            _client = QdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key)
        else:
            _client = QdrantClient(url=s.qdrant_url)
    return _client


def _collection_name(user_id: str) -> str:
    """Generate per-user collection name for data isolation."""
    return f"user_{user_id.replace('-', '_')}"


def ensure_collection(user_id: str, settings: Settings | None = None) -> str:
    """Create a Qdrant collection for a user if it doesn't exist.

    Uses cosine distance (standard for Gemini embeddings) and
    configures HNSW indexing for fast approximate search.

    Returns:
        The collection name.
    """
    s = settings or get_settings()
    client = get_qdrant_client(s)
    name = _collection_name(user_id)

    # Check if collection exists
    collections = client.get_collections().collections
    existing = [c.name for c in collections]

    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(
                size=s.embedding_dimensions,
                distance=Distance.COSINE,
            ),
        )

        # Create payload indexes for filtered search
        client.create_payload_index(
            collection_name=name,
            field_name="notebook_id",
            field_schema="keyword",
        )
        client.create_payload_index(
            collection_name=name,
            field_name="source_id",
            field_schema="keyword",
        )
        client.create_payload_index(
            collection_name=name,
            field_name="chunk_type",
            field_schema="keyword",
        )

        logger.info("Created Qdrant collection: %s (dims=%d)", name, s.embedding_dimensions)

    return name


def upsert_vectors(
    user_id: str,
    chunk_ids: list[str],
    vectors: list[list[float]],
    payloads: list[dict],
    settings: Settings | None = None,
) -> None:
    """Upsert vectors with metadata payloads into the user's collection.

    Args:
        user_id: User UUID for collection routing.
        chunk_ids: Unique IDs for each point.
        vectors: Embedding vectors (must match collection dimensions).
        payloads: Metadata dicts stored alongside vectors.
    """
    client = get_qdrant_client(settings)
    collection = ensure_collection(user_id, settings)

    points = [
        PointStruct(
            id=chunk_id,
            vector=vector,
            payload=payload,
        )
        for chunk_id, vector, payload in zip(chunk_ids, vectors, payloads, strict=False)
    ]

    # Upsert in batches of 100
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        client.upsert(collection_name=collection, points=batch)

    logger.info(
        "Upserted %d vectors to collection %s",
        len(points), collection,
    )


def search_vectors(
    user_id: str,
    query_vector: list[float],
    notebook_id: str | None = None,
    limit: int = 20,
    chunk_type: str = "child",
    settings: Settings | None = None,
) -> list[dict]:
    """Search for similar vectors in a user's collection.

    Args:
        user_id: User UUID for collection routing.
        query_vector: Query embedding vector.
        notebook_id: Optional filter to scope search to a specific notebook.
        limit: Maximum number of results.
        chunk_type: Filter by chunk type ("child" for precision, "parent" for context).

    Returns:
        List of dicts with id, score, and payload for each match.
    """
    client = get_qdrant_client(settings)
    collection = ensure_collection(user_id, settings)

    # Build filter conditions
    must_conditions = []
    if notebook_id:
        must_conditions.append(
            FieldCondition(key="notebook_id", match=MatchValue(value=notebook_id))
        )
    if chunk_type:
        must_conditions.append(
            FieldCondition(key="chunk_type", match=MatchValue(value=chunk_type))
        )

    search_filter = Filter(must=must_conditions) if must_conditions else None

    results = client.query_points(
        collection_name=collection,
        query=query_vector,
        query_filter=search_filter,
        limit=limit,
        search_params=SearchParams(
            hnsw_ef=128,
            exact=False,
        ),
    ).points

    return [
        {
            "id": str(hit.id),
            "score": hit.score,
            "payload": hit.payload or {},
        }
        for hit in results
    ]


def get_parent_chunk(
    user_id: str,
    parent_id: str,
    settings: Settings | None = None,
) -> dict | None:
    """Retrieve a parent chunk by its ID (for context expansion).

    This is the "Small-to-Big" retrieval step: after finding
    relevant child chunks, expand to their parent for the LLM prompt.
    """
    client = get_qdrant_client(settings)
    collection = ensure_collection(user_id, settings)

    try:
        results = client.retrieve(
            collection_name=collection,
            ids=[parent_id],
        )
        if results:
            point = results[0]
            return {
                "id": str(point.id),
                "payload": point.payload or {},
            }
    except Exception:
        logger.warning("Failed to retrieve parent chunk %s", parent_id)

    return None


def delete_source_vectors(
    user_id: str,
    source_id: str,
    settings: Settings | None = None,
) -> None:
    """Delete all vectors belonging to a specific source.

    Called when a source is deleted to clean up its embeddings.
    """
    client = get_qdrant_client(settings)
    collection = ensure_collection(user_id, settings)

    client.delete(
        collection_name=collection,
        points_selector=Filter(
            must=[
                FieldCondition(
                    key="source_id",
                    match=MatchValue(value=source_id),
                )
            ]
        ),
    )
    logger.info("Deleted vectors for source %s from %s", source_id, collection)
