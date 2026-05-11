"""Hybrid Agentic Retriever — the full RAG retrieval pipeline.

Orchestrates the complete retrieval flow:
1. Query rewriting (HyDE + keyword expansion)
2. Dense search (Qdrant vectors via Gemini embeddings)
3. Sparse search (BM25 keyword matching)
4. RRF fusion (merging dense + sparse rankings)
5. Reranking (cross-encoder for final precision)
6. Context expansion (child → parent for LLM context)

This is the retriever used in production. The basic `retriever.py`
is kept as a fallback for when BM25/reranker aren't available.
"""

import logging

from graspmind.rag.bm25 import BM25Document, build_bm25_index
from graspmind.rag.embedder import embed_query
from graspmind.rag.fusion import FusedResult, reciprocal_rank_fusion
from graspmind.rag.query_rewriter import expand_keywords, hyde_rewrite
from graspmind.rag.reranker import rerank
from graspmind.rag.retriever import RetrievedContext
from graspmind.rag.vector_store import search_vectors

logger = logging.getLogger(__name__)


async def hybrid_retrieve(
    query: str,
    user_id: str,
    notebook_id: str,
    top_k: int = 8,
    use_hyde: bool = True,
    use_reranker: bool = True,
    use_keyword_expansion: bool = True,
) -> list[RetrievedContext]:
    """Full hybrid retrieval pipeline.

    Args:
        query: The user's question.
        user_id: User UUID for Qdrant collection routing.
        notebook_id: Notebook UUID to scope the search.
        top_k: Number of final results.
        use_hyde: Whether to apply HyDE query rewriting.
        use_reranker: Whether to apply cross-encoder reranking.
        use_keyword_expansion: Whether to expand query keywords.

    Returns:
        List of RetrievedContext objects, ranked by relevance.
    """
    # ── Step 1: Query rewriting ──────────────────────────────
    dense_query = query
    sparse_query = query

    if use_hyde:
        try:
            dense_query = await hyde_rewrite(query, user_id=user_id)
        except Exception as exc:
            logger.warning("HyDE failed, using original query: %s", exc)

    if use_keyword_expansion:
        try:
            expanded_terms = await expand_keywords(query, user_id=user_id)
            # Combine original query with expanded terms for BM25
            sparse_query = f"{query} {' '.join(expanded_terms)}"
        except Exception as exc:
            logger.warning("Keyword expansion failed: %s", exc)

    # ── Step 2: Dense search (Qdrant) ────────────────────────
    dense_vector = await embed_query(dense_query)

    dense_results_raw = search_vectors(
        user_id=user_id,
        query_vector=dense_vector,
        notebook_id=notebook_id,
        limit=top_k * 3,  # Over-fetch for fusion
        chunk_type="child",
    )

    # Convert to RetrievedContext
    dense_results: list[RetrievedContext] = []
    seen_parents: set[str] = set()
    for hit in dense_results_raw:
        payload = hit["payload"]
        parent_id = payload.get("parent_id", "")
        if parent_id and parent_id in seen_parents:
            continue
        if parent_id:
            seen_parents.add(parent_id)

        dense_results.append(RetrievedContext(
            content=payload.get("content", ""),
            parent_content=payload.get("parent_content", payload.get("content", "")),
            score=hit["score"],
            source_id=payload.get("source_id", ""),
            source_title=payload.get("source_title", ""),
            page_num=payload.get("page_num"),
            headings=payload.get("headings", []),
            chunk_id=hit["id"],
        ))

    # ── Step 3: Sparse search (BM25) ────────────────────────
    sparse_results: list[tuple[BM25Document, float]] = []
    try:
        bm25_index = await build_bm25_index(notebook_id)
        if bm25_index.doc_count > 0:
            sparse_results = bm25_index.search(sparse_query, top_k=top_k * 3)
    except Exception as exc:
        logger.warning("BM25 search failed, using dense-only: %s", exc)

    # ── Step 4: RRF Fusion ───────────────────────────────────
    if sparse_results:
        fused = reciprocal_rank_fusion(
            dense_results=dense_results,
            sparse_results=sparse_results,
            top_k=top_k * 2,  # Over-fetch for reranking
        )
    else:
        # No sparse results — convert dense directly to FusedResult
        fused = [
            FusedResult(
                content=r.content,
                parent_content=r.parent_content,
                score=r.score,
                source_id=r.source_id,
                source_title=r.source_title,
                page_num=r.page_num,
                headings=r.headings,
                chunk_id=r.chunk_id,
            )
            for r in dense_results[:top_k * 2]
        ]

    # ── Step 5: Reranking ────────────────────────────────────
    if use_reranker and fused:
        try:
            ranked = await rerank(query, fused, top_k=top_k)
            # Convert RankedResult back to RetrievedContext
            return [
                RetrievedContext(
                    content=r.content,
                    parent_content=r.parent_content,
                    score=r.rerank_score,
                    source_id=r.source_id,
                    source_title=r.source_title,
                    page_num=r.page_num,
                    headings=r.headings or [],
                    chunk_id=r.chunk_id,
                )
                for r in ranked
            ]
        except Exception as exc:
            logger.warning("Reranking failed, using fusion scores: %s", exc)

    # Fallback: return fused results without reranking
    return [
        RetrievedContext(
            content=r.content,
            parent_content=r.parent_content,
            score=r.score,
            source_id=r.source_id,
            source_title=r.source_title,
            page_num=r.page_num,
            headings=r.headings or [],
            chunk_id=r.chunk_id,
        )
        for r in fused[:top_k]
    ]
