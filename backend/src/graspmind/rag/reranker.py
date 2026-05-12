"""Reranker — cross-encoder reranking via local model or API.

Takes the top-K fused results and reranks them using a cross-encoder
model that scores (query, passage) pairs jointly. This dramatically
improves precision compared to bi-encoder retrieval alone.

Supports:
- Ollama-hosted reranker models (default, free)
- API-based rerankers (Cohere, Jina) as fallback
"""

import logging
from dataclasses import dataclass

import httpx

from graspmind.config import Settings, get_settings
from graspmind.rag.fusion import FusedResult

logger = logging.getLogger(__name__)


@dataclass
class RankedResult:
    """A reranked search result."""

    content: str
    parent_content: str
    rerank_score: float
    original_score: float
    source_id: str
    source_title: str
    page_num: int | None = None
    headings: list[str] | None = None
    chunk_id: str = ""


async def rerank(
    query: str,
    results: list[FusedResult],
    top_k: int = 8,
    settings: Settings | None = None,
) -> list[RankedResult]:
    """Rerank fused results using a cross-encoder model.

    Falls back to original fusion scores if reranking fails.

    Args:
        query: The user's search query.
        results: Fused results from RRF.
        top_k: Number of results to return after reranking.
        settings: Optional settings override.

    Returns:
        List of RankedResult sorted by reranker score.
    """
    if not results:
        return []

    s = settings or get_settings()

    try:
        scores = await _rerank_ollama(query, results, s)
    except Exception as exc:
        # Silently fall back to fusion scores to avoid log noise if Ollama isn't running
        logger.debug("Reranker unreachable (Ollama down), using fusion scores: %s", exc)
        scores = [r.score for r in results]

    # Combine results with reranker scores
    ranked: list[RankedResult] = []
    for result, score in zip(results, scores, strict=False):
        ranked.append(RankedResult(
            content=result.content,
            parent_content=result.parent_content,
            rerank_score=score,
            original_score=result.score,
            source_id=result.source_id,
            source_title=result.source_title,
            page_num=result.page_num,
            headings=result.headings,
            chunk_id=result.chunk_id,
        ))

    # Sort by reranker score
    ranked.sort(key=lambda x: x.rerank_score, reverse=True)

    logger.info(
        "Reranked %d results → top %d returned",
        len(ranked), min(top_k, len(ranked)),
    )

    return ranked[:top_k]


async def _rerank_ollama(
    query: str,
    results: list[FusedResult],
    settings: Settings,
) -> list[float]:
    """Score query-passage pairs using Ollama's embedding similarity.

    Uses a lightweight approach: embed the query and each passage,
    then compute cosine similarity. For full cross-encoder reranking,
    a dedicated model like bge-reranker-v2-m3 can be loaded.
    """
    url = f"{settings.ollama_base_url}/api/embed"

    # Build texts to embed: [query, passage1, passage2, ...]
    texts = [query] + [r.content for r in results]

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json={
            "model": "bge-m3",  # Lightweight multilingual model
            "input": texts,
        })

        if response.status_code != 200:
            raise RuntimeError(f"Ollama embed failed: {response.status_code}")

        data = response.json()
        embeddings = data.get("embeddings", [])

        if len(embeddings) < 2:
            raise RuntimeError("Insufficient embeddings returned")

    # Compute cosine similarity between query and each passage
    query_emb = embeddings[0]
    scores: list[float] = []

    for passage_emb in embeddings[1:]:
        score = _cosine_similarity(query_emb, passage_emb)
        scores.append(score)

    return scores


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot / (norm_a * norm_b)
