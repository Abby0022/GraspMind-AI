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
) -> dict:
    """Full embedding pipeline: chunk → embed → store.

    Args:
        document: Parsed document from any parser.
        source_id: UUID of the source record.
        notebook_id: UUID of the parent notebook.
        user_id: UUID of the owning user.

    Returns:
        Dict with pipeline results (chunk counts, vector counts).
    """
    # Step 1: Chunk the document
    chunks = chunk_document(document, source_id)

    if not chunks:
        logger.warning("No chunks produced for source %s", source_id)
        return {"chunks": 0, "vectors": 0}

    # Step 2: Ensure user's Qdrant collection exists
    ensure_collection(user_id)

    # Step 3: Embed child chunks only (parents stored for context expansion)
    child_chunks = [c for c in chunks if c.chunk_type == "child"]
    parent_chunks = [c for c in chunks if c.chunk_type == "parent"]

    # Build lookup for parent content (stored in payload for retrieval)
    parent_map = {c.id: c for c in parent_chunks}

    if not child_chunks:
        logger.warning("No child chunks for source %s", source_id)
        return {"chunks": len(chunks), "vectors": 0}

    # Step 4: Generate embeddings for child chunks
    child_texts = [c.content for c in child_chunks]
    embeddings = await embed_documents(child_texts)

    # Step 5: Build payloads with metadata
    chunk_ids: list[str] = []
    payloads: list[dict] = []

    for chunk in child_chunks:
        chunk_ids.append(chunk.id)

        # Find parent content for context expansion
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

    # Also embed and store parent chunks (for direct parent retrieval)
    parent_texts = [c.content for c in parent_chunks]
    if parent_texts:
        parent_embeddings = await embed_documents(parent_texts)

        parent_ids = [c.id for c in parent_chunks]
        parent_payloads = [
            {
                "content": c.content,
                "chunk_type": "parent",
                "page_num": c.page_num,
                "source_id": source_id,
                "notebook_id": notebook_id,
                "headings": c.headings,
                "source_type": document.source_type,
                "source_title": document.title,
                "token_count": c.token_count,
            }
            for c in parent_chunks
        ]

        # Combine all vectors for a single upsert
        chunk_ids.extend(parent_ids)
        embeddings.extend(parent_embeddings)
        payloads.extend(parent_payloads)

    # Step 6: Upsert to Qdrant
    upsert_vectors(
        user_id=user_id,
        chunk_ids=chunk_ids,
        vectors=embeddings,
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

    return result
