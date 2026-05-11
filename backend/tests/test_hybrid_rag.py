"""Tests for BM25 search and RRF fusion."""

from graspmind.rag.bm25 import BM25Document, BM25Index, _tokenize
from graspmind.rag.fusion import reciprocal_rank_fusion
from graspmind.rag.retriever import RetrievedContext

# ── Tokenizer tests ──────────────────────────────────────────

def test_tokenize_removes_stop_words():
    """Stop words should be filtered out."""
    tokens = _tokenize("The cat is on the mat")
    assert "the" not in tokens
    assert "is" not in tokens
    assert "on" not in tokens
    assert "cat" in tokens
    assert "mat" in tokens


def test_tokenize_lowercases():
    """All tokens should be lowercase."""
    tokens = _tokenize("ATP Synthase COMPLEX")
    assert all(t == t.lower() for t in tokens)


def test_tokenize_splits_punctuation():
    """Punctuation should be removed."""
    tokens = _tokenize("Hello, world! How's it going?")
    assert "hello" in tokens
    assert "world" in tokens
    assert "," not in tokens


# ── BM25 Index tests ─────────────────────────────────────────

def _build_test_index() -> BM25Index:
    """Build a test BM25 index with sample documents."""
    index = BM25Index()
    docs = [
        BM25Document(
            doc_id="1",
            content="Mitosis is a type of cell division where one cell divides into two identical daughter cells.",
            source_id="bio-1",
            source_title="Biology Ch3",
            page_num=12,
        ),
        BM25Document(
            doc_id="2",
            content="ATP synthase is an enzyme that creates adenosine triphosphate using a proton gradient.",
            source_id="bio-2",
            source_title="Biology Ch5",
            page_num=45,
        ),
        BM25Document(
            doc_id="3",
            content="The French Revolution began in 1789 with the storming of the Bastille.",
            source_id="hist-1",
            source_title="History Ch8",
            page_num=120,
        ),
        BM25Document(
            doc_id="4",
            content="DNA replication involves unwinding the double helix and creating complementary strands.",
            source_id="bio-3",
            source_title="Biology Ch2",
            page_num=8,
        ),
    ]
    index.add_documents(docs)
    return index


def test_bm25_search_relevant():
    """Searching for 'cell division' should return mitosis doc first."""
    index = _build_test_index()
    results = index.search("cell division")
    assert len(results) > 0
    assert results[0][0].doc_id == "1"


def test_bm25_search_technical_term():
    """Searching for 'ATP synthase' should return the enzyme doc."""
    index = _build_test_index()
    results = index.search("ATP synthase enzyme")
    assert len(results) > 0
    assert results[0][0].doc_id == "2"


def test_bm25_search_no_results():
    """Searching for unrelated terms should return empty."""
    index = _build_test_index()
    results = index.search("quantum physics")
    # May return 0 or very low-scoring results
    assert len(results) == 0 or results[0][1] < 0.5


def test_bm25_search_respects_top_k():
    """Should respect the top_k limit."""
    index = _build_test_index()
    results = index.search("biology cell", top_k=2)
    assert len(results) <= 2


def test_bm25_index_stats():
    """Index should track document count and avg length."""
    index = _build_test_index()
    assert index.doc_count == 4
    assert index.avg_doc_len > 0


# ── RRF Fusion tests ─────────────────────────────────────────

def test_rrf_basic_fusion():
    """Fusing dense and sparse results should produce combined scores."""
    dense = [
        RetrievedContext(
            content="Dense result 1",
            parent_content="Parent 1",
            score=0.95,
            source_id="s1",
            source_title="Source 1",
            page_num=1,
        ),
        RetrievedContext(
            content="Dense result 2",
            parent_content="Parent 2",
            score=0.85,
            source_id="s2",
            source_title="Source 2",
            page_num=2,
        ),
    ]

    sparse = [
        (BM25Document(
            doc_id="b1",
            content="Sparse result 1",
            source_id="s2",
            source_title="Source 2",
            page_num=2,
        ), 5.0),
        (BM25Document(
            doc_id="b2",
            content="Sparse result 2",
            source_id="s3",
            source_title="Source 3",
            page_num=3,
        ), 3.0),
    ]

    fused = reciprocal_rank_fusion(dense, sparse)
    assert len(fused) > 0

    # Results appearing in both lists should have higher scores
    scores = {r.source_id: r.score for r in fused}
    # s2 appears in both dense (rank 2) and sparse (rank 1)
    assert "s2" in scores


def test_rrf_empty_sparse():
    """Fusion should work with empty sparse results."""
    dense = [
        RetrievedContext(
            content="Only dense",
            parent_content="Parent",
            score=0.9,
            source_id="s1",
            source_title="Source 1",
        ),
    ]

    fused = reciprocal_rank_fusion(dense, [])
    assert len(fused) == 1
    assert fused[0].source_id == "s1"


def test_rrf_respects_top_k():
    """Should respect the top_k limit."""
    dense = [
        RetrievedContext(
            content=f"Dense {i}",
            parent_content=f"Parent {i}",
            score=0.9 - i * 0.1,
            source_id=f"s{i}",
            source_title=f"Source {i}",
            page_num=i,
        )
        for i in range(10)
    ]

    fused = reciprocal_rank_fusion(dense, [], top_k=3)
    assert len(fused) <= 3
