"""End-to-end embedding pipeline.

Orchestrates: parsed document → chunking → embedding → Qdrant upsert.
Called by the ingestion worker after document parsing completes.
"""

import logging

from graspmind.parsers.pdf import ParsedDocument
from graspmind.rag.chunker import chunk_document
from graspmind.rag.embedder import embed_documents
from graspmind.rag.vector_store import ensure_collection, upsert_vectors

logger = logging.getLogger(__name__)


async def embed_and_store(
    document: ParsedDocument,
    source_id: str,
    notebook_id: str,
    user_id: str,
    chunks: list | None = None,
) -> tuple[dict, list]:
    """Full embedding pipeline: chunk → embed → store.

    Args:
        document: Parsed document from any parser.
        source_id: UUID of the source record.
        notebook_id: UUID of the parent notebook.
        user_id: UUID of the owning user.
        chunks: Optional pre-computed chunks.

    Returns:
        Tuple of (Dict with pipeline results, List of generated chunks).
    """
    # Step 1: Chunk the document (if not provided)
    if chunks is None:
        import asyncio
        chunks = await asyncio.to_thread(chunk_document, document, source_id)


    if not chunks:
        logger.warning("No chunks produced for source %s", source_id)
        return {"chunks": 0, "vectors": 0}, []

    # Step 2: Ensure user's Qdrant collection exists
    await ensure_collection(user_id)

    # Step 3: Organize chunks
    child_chunks = [c for c in chunks if c.chunk_type == "child"]
    parent_chunks = [c for c in chunks if c.chunk_type == "parent"]

    # Build lookup for parent content
    parent_map = {c.id: c for c in parent_chunks}

    # Step 4: Batch generate all embeddings in one call
    # Combine child and parent texts for efficiency
    all_texts = [c.content for c in child_chunks] + [c.content for c in parent_chunks]
    
    if not all_texts:
        return {"chunks": len(chunks), "vectors": 0}, chunks

    all_embeddings = await embed_documents(all_texts)
    
    # Split embeddings back into children and parents
    child_embeddings = all_embeddings[:len(child_chunks)]
    parent_embeddings = all_embeddings[len(child_chunks):]

    # Step 5: Build payloads
    chunk_ids: list[str] = []
    payloads: list[dict] = []

    # Process children
    for i, chunk in enumerate(child_chunks):
        chunk_ids.append(chunk.id)
        parent_content = ""
        if chunk.parent_id and chunk.parent_id in parent_map:
            parent_content = parent_map[chunk.parent_id].content

        payloads.append({
            "content": chunk.content,
            "chunk_type": "child",
            "parent_id": chunk.parent_id,
            "parent_content": parent_content,
            "page_num": chunk.page_num,
            "source_id": source_id,
            "notebook_id": notebook_id,
            "headings": chunk.headings,
            "source_type": document.source_type,
            "source_title": document.title,
            "token_count": chunk.token_count,
        })

    # Process parents
    for i, chunk in enumerate(parent_chunks):
        chunk_ids.append(chunk.id)
        payloads.append({
            "content": chunk.content,
            "chunk_type": "parent",
            "page_num": chunk.page_num,
            "source_id": source_id,
            "notebook_id": notebook_id,
            "headings": chunk.headings,
            "source_type": document.source_type,
            "source_title": document.title,
            "token_count": chunk.token_count,
        })

    # Step 6: Upsert to Qdrant
    await upsert_vectors(
        user_id=user_id,
        chunk_ids=chunk_ids,
        vectors=all_embeddings, # all_embeddings matches chunk_ids/payloads order
        payloads=payloads,
    )

    result = {
        "chunks": len(chunks),
        "parents": len(parent_chunks),
        "children": len(child_chunks),
        "vectors": len(chunk_ids),
    }

    logger.info(
        "Embedding pipeline complete for source %s: %s",
        source_id, result,
    )

    return result, chunks

