"""Google Gemini Embedding 2 integration.

Provides text embedding via the Gemini API (Google AI Studio free tier).
Supports Matryoshka dimensionality reduction (3072 → 768 → 256).

Uses the `google-genai` SDK for embedding generation with
task-specific prefixing for optimal retrieval quality.
"""

import logging
from typing import Literal

from google import genai
from google.genai import types

from graspmind.config import Settings, get_settings

logger = logging.getLogger(__name__)

# Task types for Gemini Embedding 2
EmbeddingTask = Literal[
    "RETRIEVAL_DOCUMENT",
    "RETRIEVAL_QUERY",
    "SEMANTIC_SIMILARITY",
    "CLASSIFICATION",
    "CLUSTERING",
]

_client: genai.Client | None = None


def _get_client(settings: Settings | None = None) -> genai.Client:
    """Lazy singleton Google GenAI client."""
    global _client  # noqa: PLW0603
    if _client is None:
        s = settings or get_settings()
        _client = genai.Client(api_key=s.google_api_key)
    return _client


async def embed_texts(
    texts: list[str],
    task: EmbeddingTask = "RETRIEVAL_DOCUMENT",
    dimensions: int | None = None,
    settings: Settings | None = None,
) -> list[list[float]]:
    """Generate embeddings for a list of texts using Gemini Embedding 2.

    Args:
        texts: List of text strings to embed.
        task: The embedding task type (affects vector space optimization).
              Use RETRIEVAL_DOCUMENT for indexing, RETRIEVAL_QUERY for search.
        dimensions: Output dimensionality (3072, 768, or 256 via Matryoshka).
                    None uses the model default (3072).
        settings: Optional settings override.

    Returns:
        List of embedding vectors, one per input text.

    Raises:
        ValueError: If texts list is empty.
        RuntimeError: If the API call fails.
    """
    if not texts:
        raise ValueError("Cannot embed empty text list")

    s = settings or get_settings()
    client = _get_client(s)
    dims = dimensions or s.embedding_dimensions

    try:
        # Gemini API supports batching up to 100 texts
        all_embeddings: list[list[float]] = []

        # Process in batches of 100 (API limit)
        batch_size = 100
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]

            config = types.EmbedContentConfig(
                task_type=task,
                output_dimensionality=dims,
            )

            result = client.models.embed_content(
                model=s.embedding_model,
                contents=batch,
                config=config,
            )

            for embedding in result.embeddings:
                all_embeddings.append(embedding.values)

        logger.info(
            "Embedded %d texts (task=%s, dims=%d)",
            len(texts), task, dims,
        )
        return all_embeddings

    except Exception as exc:
        logger.exception("Embedding API call failed")
        raise RuntimeError(f"Embedding failed: {exc}") from exc


async def embed_query(
    query: str,
    dimensions: int | None = None,
    settings: Settings | None = None,
) -> list[float]:
    """Embed a single search query (optimized for retrieval).

    Uses RETRIEVAL_QUERY task type for asymmetric search optimization.
    """
    results = await embed_texts(
        [query],
        task="RETRIEVAL_QUERY",
        dimensions=dimensions,
        settings=settings,
    )
    return results[0]


async def embed_documents(
    documents: list[str],
    dimensions: int | None = None,
    settings: Settings | None = None,
) -> list[list[float]]:
    """Embed a batch of documents for indexing.

    Uses RETRIEVAL_DOCUMENT task type for optimal document representation.
    """
    return await embed_texts(
        documents,
        task="RETRIEVAL_DOCUMENT",
        dimensions=dimensions,
        settings=settings,
    )
