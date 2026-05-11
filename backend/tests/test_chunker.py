"""Tests for the hierarchical parent-child chunker."""

from graspmind.parsers.pdf import ParsedDocument, ParsedPage
from graspmind.rag.chunker import _split_into_sentences, chunk_document

# ── Sentence splitting tests ────────────────────────────────

def test_split_into_sentences_basic():
    """Splits on sentence-ending punctuation."""
    text = "Hello world. This is a test. Another sentence!"
    result = _split_into_sentences(text)
    assert len(result) == 3
    assert result[0] == "Hello world."
    assert result[2] == "Another sentence!"


def test_split_into_sentences_empty():
    """Empty text returns empty list."""
    assert _split_into_sentences("") == []
    assert _split_into_sentences("   ") == []


# ── Chunking tests ──────────────────────────────────────────

def _make_document(text: str, source_type: str = "pdf") -> ParsedDocument:
    """Helper: create a test document with a single page."""
    return ParsedDocument(
        title="Test Document",
        pages=[ParsedPage(page_number=1, text=text, headings=["Test Heading"])],
        total_pages=1,
        source_type=source_type,
    )


def test_chunk_document_produces_parents_and_children():
    """Chunker should create both parent and child chunks."""
    # ~2000 chars to get multiple parent chunks
    text = "This is a test sentence. " * 80
    doc = _make_document(text)
    chunks = chunk_document(doc, "src-123")

    parents = [c for c in chunks if c.chunk_type == "parent"]
    children = [c for c in chunks if c.chunk_type == "child"]

    assert len(parents) > 0, "Should have at least one parent chunk"
    assert len(children) > 0, "Should have at least one child chunk"
    assert len(children) >= len(parents), "Should have more children than parents"


def test_child_chunks_reference_parent():
    """Each child chunk should have a parent_id."""
    text = "This is a longer sentence for testing. " * 50
    doc = _make_document(text)
    chunks = chunk_document(doc, "src-456")

    parent_ids = {c.id for c in chunks if c.chunk_type == "parent"}
    children = [c for c in chunks if c.chunk_type == "child"]

    for child in children:
        assert child.parent_id is not None, "Child should have parent_id"
        assert child.parent_id in parent_ids, "parent_id should reference a valid parent"


def test_chunk_preserves_metadata():
    """Chunks should carry source_id, page_num, and headings."""
    text = "Some test content for metadata. " * 30
    doc = _make_document(text)
    chunks = chunk_document(doc, "src-789")

    for chunk in chunks:
        assert chunk.source_id == "src-789"
        assert chunk.page_num == 1
        assert "Test Heading" in chunk.headings


def test_chunk_empty_document():
    """Empty document should produce no chunks."""
    doc = ParsedDocument(
        title="Empty",
        pages=[ParsedPage(page_number=1, text="", headings=[])],
        total_pages=1,
    )
    chunks = chunk_document(doc, "src-empty")
    assert len(chunks) == 0


def test_chunk_short_text_produces_single_parent():
    """Very short text should produce at least one parent chunk."""
    doc = _make_document("Hello world. Short text.")
    chunks = chunk_document(doc, "src-short")

    parents = [c for c in chunks if c.chunk_type == "parent"]
    assert len(parents) >= 1


def test_chunk_different_source_types():
    """Different source types should use different configs."""
    text = "Test sentence for different types. " * 50

    pdf_chunks = chunk_document(_make_document(text, "pdf"), "src-pdf")
    pptx_chunks = chunk_document(_make_document(text, "pptx"), "src-pptx")

    # Both should produce chunks but may differ in count due to config
    assert len(pdf_chunks) > 0
    assert len(pptx_chunks) > 0
