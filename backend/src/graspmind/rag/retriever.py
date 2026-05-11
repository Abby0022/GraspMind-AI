"""Dense retrieval module — query Qdrant and expand context.

Implements the "Small-to-Big" retrieval pattern:
1. Embed the query using RETRIEVAL_QUERY task type
2. Search for matching child chunks in Qdrant
3. Expand each child to its parent chunk for full context
4. Deduplicate and rank results
"""

import logging
from dataclasses import dataclass, field

from graspmind.rag.embedder import embed_query
from graspmind.rag.vector_store import search_vectors

logger = logging.getLogger(__name__)


@dataclass
class RetrievedContext:
    """A single retrieved context block with metadata."""

    content: str
    parent_content: str
    score: float
    source_id: str
    source_title: str
    page_num: int | None = None
    headings: list[str] = field(default_factory=list)
    chunk_id: str = ""


async def retrieve(
    query: str,
    user_id: str,
    notebook_id: str,
    top_k: int = 10,
) -> list[RetrievedContext]:
    """Retrieve relevant context for a user query.

    Steps:
    1. Embed query with RETRIEVAL_QUERY task type
    2. Search child chunks in Qdrant (filtered by notebook)
    3. Expand to parent chunks for LLM context
    4. Deduplicate by parent_id
    5. Return ranked results

    Args:
        query: The user's question.
        user_id: User UUID for collection routing.
        notebook_id: Notebook UUID for scoped search.
        top_k: Maximum number of results.

    Returns:
        List of RetrievedContext objects sorted by relevance.
    """
    # Step 1: Embed the query
    query_vector = await embed_query(query)

    # Step 2: Search child chunks
    results = search_vectors(
        user_id=user_id,
        query_vector=query_vector,
        notebook_id=notebook_id,
        limit=top_k * 2,  # Over-fetch to allow dedup
        chunk_type="child",
    )

    if not results:
        logger.info("No results found for query in notebook %s", notebook_id)
        return []

    # Step 3: Build context objects with parent expansion
    contexts: list[RetrievedContext] = []
    seen_parents: set[str] = set()

    for hit in results:
        payload = hit["payload"]
        parent_id = payload.get("parent_id", "")

        # Deduplicate by parent chunk (avoid sending near-identical context)
        if parent_id and parent_id in seen_parents:
            continue
        if parent_id:
            seen_parents.add(parent_id)

        # Use parent_content from payload (stored during embedding pipeline)
        parent_content = payload.get("parent_content", "")

        contexts.append(RetrievedContext(
            content=payload.get("content", ""),
            parent_content=parent_content or payload.get("content", ""),
            score=hit["score"],
            source_id=payload.get("source_id", ""),
            source_title=payload.get("source_title", ""),
            page_num=payload.get("page_num"),
            headings=payload.get("headings", []),
            chunk_id=hit["id"],
        ))

        if len(contexts) >= top_k:
            break

    logger.info(
        "Retrieved %d contexts for query (notebook=%s, top_k=%d)",
        len(contexts), notebook_id, top_k,
    )

    return contexts
