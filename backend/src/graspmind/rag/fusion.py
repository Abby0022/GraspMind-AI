"""Reciprocal Rank Fusion (RRF) — merges dense + sparse search results.

RRF is a simple, robust fusion method that doesn't require
normalized scores. It works by converting rankings to scores:

    RRF_score(d) = Σ 1 / (k + rank_i(d))

where k is a constant (default 60) and rank_i is the rank in
the i-th result list.
"""

import logging
from dataclasses import dataclass

from graspmind.rag.bm25 import BM25Document
from graspmind.rag.retriever import RetrievedContext

logger = logging.getLogger(__name__)

DEFAULT_K = 60  # Standard RRF constant


@dataclass
class FusedResult:
    """A search result after RRF fusion."""

    content: str
    parent_content: str
    score: float
    source_id: str
    source_title: str
    page_num: int | None = None
    headings: list[str] | None = None
    chunk_id: str = ""
    dense_rank: int | None = None
    sparse_rank: int | None = None


def reciprocal_rank_fusion(
    dense_results: list[RetrievedContext],
    sparse_results: list[tuple[BM25Document, float]],
    k: int = DEFAULT_K,
    top_k: int = 15,
) -> list[FusedResult]:
    """Fuse dense (vector) and sparse (BM25) results using RRF.

    Args:
        dense_results: Results from Qdrant dense search.
        sparse_results: Results from BM25 keyword search.
        k: RRF constant (higher = more weight to lower-ranked items).
        top_k: Maximum number of fused results.

    Returns:
        List of FusedResult sorted by combined RRF score.
    """
    # Build score maps keyed by a unique identifier
    scores: dict[str, FusedResult] = {}

    # Score dense results
    for rank, ctx in enumerate(dense_results, start=1):
        key = f"{ctx.source_id}:{ctx.page_num}:{ctx.content[:50]}"
        rrf_score = 1.0 / (k + rank)

        if key not in scores:
            scores[key] = FusedResult(
                content=ctx.content,
                parent_content=ctx.parent_content,
                score=0.0,
                source_id=ctx.source_id,
                source_title=ctx.source_title,
                page_num=ctx.page_num,
                headings=ctx.headings,
                chunk_id=ctx.chunk_id,
            )
        scores[key].score += rrf_score
        scores[key].dense_rank = rank

    # Score sparse results
    for rank, (doc, _bm25_score) in enumerate(sparse_results, start=1):
        key = f"{doc.source_id}:{doc.page_num}:{doc.content[:50]}"
        rrf_score = 1.0 / (k + rank)

        if key not in scores:
            scores[key] = FusedResult(
                content=doc.content,
                parent_content=doc.parent_content,
                score=0.0,
                source_id=doc.source_id,
                source_title=doc.source_title,
                page_num=doc.page_num,
                headings=doc.headings,
            )
        scores[key].score += rrf_score
        scores[key].sparse_rank = rank

    # Sort by combined RRF score
    fused = sorted(scores.values(), key=lambda x: x.score, reverse=True)

    logger.info(
        "RRF fusion: %d dense + %d sparse → %d fused (top %d returned)",
        len(dense_results), len(sparse_results), len(fused), min(top_k, len(fused)),
    )

    return fused[:top_k]
