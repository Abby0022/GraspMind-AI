"""Qdrant vector store client wrapper.

Manages per-user collections, vector upserts, and search operations.
Supports both dense vectors (Gemini Embedding 2) and payload filtering.
"""

import logging

from qdrant_client import AsyncQdrantClient
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

_client: AsyncQdrantClient | None = None
_verified_collections: set[str] = set()


def get_qdrant_client(settings: Settings | None = None) -> AsyncQdrantClient:
    """Lazy singleton Async Qdrant client."""
    global _client  # noqa: PLW0603
    if _client is None:
        s = settings or get_settings()
        if s.qdrant_api_key:
            _client = AsyncQdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key)
        else:
            _client = AsyncQdrantClient(url=s.qdrant_url)
    return _client


def _collection_name(user_id: str) -> str:
    """Generate per-user collection name for data isolation."""
    return f"user_{user_id.replace('-', '_')}"


async def ensure_collection(user_id: str, settings: Settings | None = None) -> str:
    """Create a Qdrant collection for a user if it doesn't exist.
    
    Uses an in-memory cache to avoid redundant network calls.
    """
    global _verified_collections  # noqa: PLW0603
    
    name = _collection_name(user_id)
    if name in _verified_collections:
        return name

    s = settings or get_settings()
    client = get_qdrant_client(s)

    # Check if collection exists
    try:
        collections_res = await client.get_collections()
        existing = [c.name for c in collections_res.collections]

        if name not in existing:
            await client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(
                    size=s.embedding_dimensions,
                    distance=Distance.COSINE,
                ),
            )

            # Create payload indexes for filtered search
            await client.create_payload_index(
                collection_name=name,
                field_name="notebook_id",
                field_schema="keyword",
            )
            await client.create_payload_index(
                collection_name=name,
                field_name="source_id",
                field_schema="keyword",
            )
            await client.create_payload_index(
                collection_name=name,
                field_name="chunk_type",
                field_schema="keyword",
            )

            logger.info("Created Qdrant collection: %s (dims=%d)", name, s.embedding_dimensions)
        
        # Cache the verified collection
        _verified_collections.add(name)
    except Exception as exc:
        logger.error("Failed to ensure Qdrant collection %s: %s", name, exc)
        # We don't cache on failure to allow retry

    return name



async def upsert_vectors(
    user_id: str,
    chunk_ids: list[str],
    vectors: list[list[float]],
    payloads: list[dict],
    settings: Settings | None = None,
) -> None:
    """Upsert vectors with metadata payloads into the user's collection.
    """
    client = get_qdrant_client(settings)
    collection = await ensure_collection(user_id, settings)

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
        await client.upsert(collection_name=collection, points=batch)

    logger.info(
        "Upserted %d vectors to collection %s",
        len(points), collection,
    )


async def search_vectors(
    user_id: str,
    query_vector: list[float],
    notebook_id: str | None = None,
    limit: int = 20,
    chunk_type: str = "child",
    settings: Settings | None = None,
) -> list[dict]:
    """Search for similar vectors in a user's collection.
    """
    client = get_qdrant_client(settings)
    collection = await ensure_collection(user_id, settings)

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

    query_res = await client.query_points(
        collection_name=collection,
        query=query_vector,
        query_filter=search_filter,
        limit=limit,
        search_params=SearchParams(
            hnsw_ef=128,
            exact=False,
        ),
    )
    results = query_res.points

    return [
        {
            "id": str(hit.id),
            "score": hit.score,
            "payload": hit.payload or {},
        }
        for hit in results
    ]


async def get_parent_chunk(
    user_id: str,
    parent_id: str,
    settings: Settings | None = None,
) -> dict | None:
    """Retrieve a parent chunk by its ID (for context expansion).
    """
    client = get_qdrant_client(settings)
    collection = await ensure_collection(user_id, settings)

    try:
        results = await client.retrieve(
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


async def delete_source_vectors(
    user_id: str,
    source_id: str,
    settings: Settings | None = None,
) -> None:
    """Delete all vectors belonging to a specific source.
    """
    client = get_qdrant_client(settings)
    collection = await ensure_collection(user_id, settings)

    await client.delete(
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


async def delete_notebook_vectors(
    user_id: str,
    notebook_id: str,
    settings: Settings | None = None,
) -> None:
    """Delete all vectors belonging to a specific notebook.
    """
    client = get_qdrant_client(settings)
    collection = await ensure_collection(user_id, settings)

    await client.delete(
        collection_name=collection,
        points_selector=Filter(
            must=[
                FieldCondition(
                    key="notebook_id",
                    match=MatchValue(value=notebook_id),
                )
            ]
        ),
    )
    logger.info("Deleted all vectors for notebook %s from %s", notebook_id, collection)
