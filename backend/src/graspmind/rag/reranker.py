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
    """Rerank fused results using a cross-encoder model or API.

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
    scores = None

    # 1. Try dedicated Reranker APIs first (Cohere/Jina)
    if s.cohere_api_key:
        try:
            scores = await _rerank_cohere(query, results, s)
        except Exception as e:
            logger.warning("Cohere rerank failed: %s", e)

    if not scores and s.jina_api_key:
        try:
            scores = await _rerank_jina(query, results, s)
        except Exception as e:
            logger.warning("Jina rerank failed: %s", e)

    # 2. Fall back to local Ollama (Bi-Encoder similarity)
    if not scores:
        try:
            scores = await _rerank_ollama(query, results, s)
        except Exception as exc:
            logger.debug("Local reranker fallback failed: %s", exc)
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
    return ranked[:top_k]


async def _rerank_cohere(query: str, results: list[FusedResult], settings: Settings) -> list[float]:
    """Use Cohere's Rerank v3.5 API for high-precision ranking."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            "https://api.cohere.com/v2/rerank",
            headers={
                "Authorization": f"Bearer {settings.cohere_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "rerank-v3.5",
                "query": query,
                "documents": [r.content for r in results],
                "top_n": len(results),
            },
        )
        response.raise_for_status()
        data = response.json()
        # Sort back to original order to extract scores
        results_map = {item["index"]: item["relevance_score"] for item in data["results"]}
        return [results_map[i] for i in range(len(results))]


async def _rerank_jina(query: str, results: list[FusedResult], settings: Settings) -> list[float]:
    """Use Jina's Reranker v2 API."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            "https://api.jina.ai/v1/rerank",
            headers={
                "Authorization": f"Bearer {settings.jina_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "jina-reranker-v2-base-multilingual",
                "query": query,
                "documents": [r.content for r in results],
                "top_n": len(results),
            },
        )
        response.raise_for_status()
        data = response.json()
        results_map = {item["index"]: item["relevance_score"] for item in data["results"]}
        return [results_map[i] for i in range(len(results))]


async def _rerank_ollama(
    query: str,
    results: list[FusedResult],
    settings: Settings,
) -> list[float]:
    """Score query-passage pairs using Ollama's embedding similarity (Bi-Encoder).
    
    This is a fallback and less accurate than a true Cross-Encoder.
    """
    url = f"{settings.ollama_base_url}/api/embed"
    texts = [query] + [r.content for r in results]

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json={
            "model": "bge-m3",
            "input": texts,
        })
        response.raise_for_status()
        data = response.json()
        embeddings = data.get("embeddings", [])

    query_emb = embeddings[0]
    return [_cosine_similarity(query_emb, e) for e in embeddings[1:]]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    return dot / (norm_a * norm_b) if norm_a > 0 and norm_b > 0 else 0.0
