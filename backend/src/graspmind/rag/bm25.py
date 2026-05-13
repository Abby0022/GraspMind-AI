"""BM25 sparse search index.

Provides keyword-based search over document chunks stored in Postgres.
Used alongside dense vector search for hybrid retrieval via RRF fusion.

BM25 is critical for:
- Exact term matching (e.g., "ATP synthase" won't drift to "energy")
- Acronyms and technical jargon
- Proper nouns and formulas
"""

import logging
import math
import re
from collections import Counter
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Common English stop words to skip during indexing
STOP_WORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "because", "but", "and", "or", "if", "while", "about", "up", "it",
    "its", "he", "she", "they", "them", "his", "her", "this", "that",
    "these", "those", "i", "me", "my", "we", "us", "our", "you", "your",
    "what", "which", "who", "whom",
})


def _tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase terms, removing stop words."""
    # Split on non-alphanumeric characters
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return [t for t in tokens if t not in STOP_WORDS and len(t) > 1]


@dataclass
class BM25Document:
    """A document in the BM25 index."""

    doc_id: str
    content: str
    source_id: str
    source_title: str
    page_num: int | None = None
    parent_content: str = ""
    headings: list[str] = field(default_factory=list)
    term_freqs: dict[str, int] = field(default_factory=dict)
    doc_len: int = 0


class BM25Index:
    """In-memory BM25 index for a notebook's chunks.

    Parameters follow the standard BM25 formulation:
    - k1: Term frequency saturation (1.2–2.0, higher = less saturation)
    - b: Length normalization (0 = none, 1 = full normalization)
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.documents: list[BM25Document] = []
        self.doc_count: int = 0
        self.avg_doc_len: float = 0.0
        self.idf_cache: dict[str, float] = {}
        self.doc_freq: Counter = Counter()  # term → number of docs containing it

    def add_documents(self, documents: list[BM25Document]) -> None:
        """Add documents to the index and recompute statistics."""
        for doc in documents:
            tokens = _tokenize(doc.content)
            doc.term_freqs = Counter(tokens)
            doc.doc_len = len(tokens)

            # Update document frequency for IDF
            for term in set(tokens):
                self.doc_freq[term] += 1

            self.documents.append(doc)

        self.doc_count = len(self.documents)
        if self.doc_count > 0:
            self.avg_doc_len = sum(d.doc_len for d in self.documents) / self.doc_count

        # Invalidate IDF cache
        self.idf_cache.clear()

    def _idf(self, term: str) -> float:
        """Inverse document frequency with smoothing."""
        if term in self.idf_cache:
            return self.idf_cache[term]

        df = self.doc_freq.get(term, 0)
        # BM25 IDF formula with +0.5 smoothing
        idf = math.log((self.doc_count - df + 0.5) / (df + 0.5) + 1.0)
        self.idf_cache[term] = idf
        return idf

    def search(self, query: str, top_k: int = 20) -> list[tuple[BM25Document, float]]:
        """Search the index with a query string.

        Returns:
            List of (document, score) tuples sorted by descending score.
        """
        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        scores: list[tuple[BM25Document, float]] = []

        for doc in self.documents:
            score = 0.0
            for term in query_tokens:
                tf = doc.term_freqs.get(term, 0)
                if tf == 0:
                    continue

                idf = self._idf(term)
                # BM25 scoring formula
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (
                    1 - self.b + self.b * (doc.doc_len / self.avg_doc_len)
                )
                score += idf * (numerator / denominator)

            if score > 0:
                scores.append((doc, score))

        # Sort by score descending
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]


import pickle
from graspmind.security.rate_limiter import get_redis


async def build_bm25_index(
    notebook_id: str,
    supabase_client=None,
    use_cache: bool = True,
) -> BM25Index:
    """Build a BM25 index from all chunks in a notebook.

    Fetches child chunks from Postgres and indexes them.
    The index is rebuilt per-query (cached in production via Redis).
    """
    from graspmind.config import get_settings
    settings = get_settings()

    # ── Step 0: Try to load from Redis cache ────────────────
    redis = None
    if use_cache:
        try:
            redis = await get_redis(settings)
            cache_key = f"bm25_index:{notebook_id}"
            cached_data = await redis.get(cache_key)
            if cached_data:
                # Need to use pickle safely, assuming internal trusted use
                index = pickle.loads(cached_data) if isinstance(cached_data, bytes) else pickle.loads(cached_data.encode('latin1'))
                logger.info("Loaded BM25 index from cache for notebook %s", notebook_id)
                return index
        except Exception as exc:
            logger.warning("Failed to load BM25 index from cache: %s", exc)

    # ── Step 1: Fetch documents from Supabase ────────────────
    if supabase_client is None:
        from supabase import acreate_client
        supabase_client = await acreate_client(settings.supabase_url, settings.supabase_service_key)

    # Fetch source IDs for this notebook first (extract plain UUID strings)
    source_rows_result = await supabase_client.table("sources").select("id").eq("notebook_id", notebook_id).execute()
    source_rows = source_rows_result.data or []
    source_ids = [row["id"] for row in source_rows]

    if not source_ids:
        return BM25Index()

    # Fetch all child chunks for this notebook's sources
    result = await (
        supabase_client.table("chunks")
        .select("id, content, chunk_type, page_num, source_id, sources(title)")
        .eq("chunk_type", "child")
        .in_("source_id", source_ids)
        .execute()
    )

    index = BM25Index()
    docs = []

    for row in result.data or []:
        source_info = row.get("sources", {})
        docs.append(BM25Document(
            doc_id=row["id"],
            content=row["content"],
            source_id=row["source_id"],
            source_title=source_info.get("title", "") if source_info else "",
            page_num=row.get("page_num"),
        ))

    if docs:
        index.add_documents(docs)
        logger.info("Built BM25 index: %d docs for notebook %s", len(docs), notebook_id)

        # ── Step 3: Save to Redis cache ──────────────────────
        if use_cache and redis:
            try:
                # Use a reasonable TTL (e.g., 1 hour)
                await redis.setex(
                    f"bm25_index:{notebook_id}",
                    3600,
                    pickle.dumps(index)
                )
            except Exception as exc:
                logger.warning("Failed to save BM25 index to cache: %s", exc)

    return index

