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

import asyncio
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
    """Full hybrid retrieval pipeline with parallelized execution."""
    
    # ── Task Definitions ─────────────────────────────────────
    
    async def task_dense():
        """Handle query rewriting, embedding, and vector search."""
        dense_query = query
        if use_hyde:
            try:
                dense_query = await hyde_rewrite(query, user_id=user_id)
            except Exception as exc:
                logger.warning("HyDE failed: %s", exc)
        
        vector = await embed_query(dense_query)
        
        raw_hits = await search_vectors(
            user_id=user_id,
            query_vector=vector,
            notebook_id=notebook_id,
            limit=top_k * 3,
            chunk_type="child",
        )
        
        # Process hits into RetrievedContext immediately
        results: list[RetrievedContext] = []
        seen_parents: set[str] = set()
        for hit in raw_hits:
            payload = hit["payload"]
            parent_id = payload.get("parent_id", "")
            if parent_id and parent_id in seen_parents:
                continue
            if parent_id:
                seen_parents.add(parent_id)

            results.append(RetrievedContext(
                content=payload.get("content", ""),
                parent_content=payload.get("parent_content", payload.get("content", "")),
                score=hit["score"],
                source_id=payload.get("source_id", ""),
                source_title=payload.get("source_title", ""),
                page_num=payload.get("page_num"),
                headings=payload.get("headings", []),
                chunk_id=hit["id"],
            ))
        return results

    async def task_sparse_prep():
        """Build BM25 index and expand keywords in parallel."""
        # Note: expand_keywords and build_bm25_index are independent
        async def get_expanded():
            if use_keyword_expansion:
                try:
                    return await expand_keywords(query, user_id=user_id)
                except Exception as exc:
                    logger.warning("Expansion failed: %s", exc)
            return []

        async def get_index():
            try:
                return await build_bm25_index(notebook_id)
            except Exception as exc:
                logger.warning("BM25 index build failed: %s", exc)
                return None

        # Run expansion and index loading in parallel
        expanded_terms, index = await asyncio.gather(get_expanded(), get_index())
        
        if not index or index.doc_count == 0:
            return []
            
        sparse_query = query
        if expanded_terms:
            sparse_query = f"{query} {' '.join(expanded_terms)}"
            
        return index.search(sparse_query, top_k=top_k * 3)

    # ── Pipeline Execution ───────────────────────────────────
    
    # Run dense and sparse pipelines in parallel
    dense_results, sparse_results = await asyncio.gather(
        task_dense(),
        task_sparse_prep()
    )

    # ── Step 4: RRF Fusion ───────────────────────────────────
    if sparse_results:
        fused = reciprocal_rank_fusion(
            dense_results=dense_results,
            sparse_results=sparse_results,
            top_k=top_k * 2,
        )
    else:
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
            logger.warning("Reranking failed: %s", exc)

    # Fallback to fused results
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

