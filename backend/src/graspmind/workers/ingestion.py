"""Document ingestion worker — async background task.

Handles the full pipeline from uploaded file to RAG-ready vectors:
1. Download file from Supabase Storage
2. Parse with appropriate parser
3. Chunk into hierarchical parent-child structure
4. Embed with Gemini Embedding 2
5. Store vectors in Qdrant (per-user collection)
6. Store chunk metadata in Postgres
7. Update source status
"""

import logging
import tempfile
from pathlib import Path

from graspmind.config import get_settings
from graspmind.parsers import parse_document
from graspmind.workers.broker import broker

logger = logging.getLogger(__name__)


@broker.task(task_name="ingest_document")
async def ingest_document(
    source_id: str,
    notebook_id: str,
    user_id: str,
    file_path: str,
    file_name: str,
) -> dict:
    """Process an uploaded document asynchronously.

    Full pipeline: download → parse → chunk → embed → store vectors.

    Args:
        source_id: UUID of the source record in Postgres.
        notebook_id: UUID of the parent notebook.
        user_id: UUID of the owning user (for Qdrant collection isolation).
        file_path: Path to the file in Supabase Storage.
        file_name: Original filename for parser detection.

    Returns:
        Dict with processing results.
    """
    from supabase import acreate_client

    settings = get_settings()
    supabase = await acreate_client(settings.supabase_url, settings.supabase_service_key)

    try:
        # Update status to processing
        await supabase.table("sources").update(
            {"status": "processing"}
        ).eq("id", source_id).execute()

        # Download file from Supabase Storage
        file_bytes = await supabase.storage.from_("sources").download(file_path)

        # Write to temp file for parsing
        suffix = Path(file_name).suffix
        tmp_path = ""
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name

            # Step 1: Parse the document
            # Offload CPU-bound parsing to a thread pool to avoid blocking the event loop
            import asyncio
            parsed = await asyncio.to_thread(parse_document, tmp_path)

            # Step 2: Chunk → Embed → Store in Qdrant
            from graspmind.rag.pipeline import embed_and_store

            # embed_and_store handles batching and returns (result_dict, chunks_list)
            pipeline_result, chunks = await embed_and_store(
                document=parsed,
                source_id=source_id,
                notebook_id=notebook_id,
                user_id=user_id,
            )

        finally:
            # Clean up temp file immediately and guaranteed
            if tmp_path and Path(tmp_path).exists():
                Path(tmp_path).unlink(missing_ok=True)

        # Step 3: Store chunk records in Postgres (for reference/search)
        # We REUSE the chunks from the pipeline to avoid redundant CPU work
        chunks_data = []
        for chunk in chunks:
            chunks_data.append({
                "source_id": source_id,
                "content": chunk.content,
                "chunk_type": chunk.chunk_type,
                "parent_id": None,  # FK reference handled via qdrant_id
                "page_num": chunk.page_num,
                "token_count": chunk.token_count,
                "qdrant_id": chunk.id,
            })


        if chunks_data:
            # Insert in batches to avoid payload limits
            batch_size = 100
            for i in range(0, len(chunks_data), batch_size):
                batch = chunks_data[i : i + batch_size]
                await supabase.table("chunks").insert(batch).execute()

        # Step 4: Update source status to ready
        await supabase.table("sources").update({
            "status": "ready",
            "metadata": {
                "title": parsed.title,
                "total_pages": parsed.total_pages,
                "total_chars": parsed.total_chars,
                "chunk_count": len(chunks_data),
                "vector_count": pipeline_result.get("vectors", 0),
                "parent_chunks": pipeline_result.get("parents", 0),
                "child_chunks": pipeline_result.get("children", 0),
                **parsed.metadata,
            },
        }).eq("id", source_id).execute()

        logger.info(
            "Ingested source %s: %d pages, %d chunks, %d vectors",
            source_id, parsed.total_pages, len(chunks_data),
            pipeline_result.get("vectors", 0),
        )

        return {
            "source_id": source_id,
            "status": "ready",
            "pages": parsed.total_pages,
            **pipeline_result,
        }

    except Exception as exc:
        logger.exception("Failed to ingest source %s", source_id)

        # Update status to failed
        try:
            await supabase.table("sources").update({
                "status": "failed",
                "metadata": {"error": str(exc)},
            }).eq("id", source_id).execute()
        except Exception as update_exc:
            logger.error("Failed to update status to failed for source %s: %s", source_id, update_exc)

        # Re-raise so Taskiq registers it as a failure and triggers the DLQ middleware
        raise ValueError(f"Failed to ingest document {source_id}: {exc}") from exc
