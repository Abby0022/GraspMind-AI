"""Hierarchical Parent-Child Chunker.

Implements the "Small-to-Big Retrieval" strategy from LlamaIndex:
- Child chunks (128 tokens) for precise retrieval
- Parent chunks (512 tokens) for context-rich LLM prompts
- Overlap between chunks to avoid losing boundary information

Different content types use different chunking strategies.
"""

import logging
import re
import uuid
from dataclasses import dataclass, field

from graspmind.parsers.pdf import ParsedDocument

logger = logging.getLogger(__name__)

# Rough approximation: 1 token ≈ 4 characters
CHARS_PER_TOKEN = 4


@dataclass
class Chunk:
    """A single chunk of text with metadata."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    content: str = ""
    chunk_type: str = "child"  # "parent" or "child"
    parent_id: str | None = None
    page_num: int | None = None
    source_id: str | None = None
    token_count: int = 0
    headings: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


@dataclass
class ChunkingConfig:
    """Configuration for chunking strategy."""

    child_tokens: int = 128
    parent_tokens: int = 512
    overlap_pct: float = 0.15  # 15% overlap
    source_type: str = "pdf"

    @property
    def child_chars(self) -> int:
        return self.child_tokens * CHARS_PER_TOKEN

    @property
    def parent_chars(self) -> int:
        return self.parent_tokens * CHARS_PER_TOKEN

    @property
    def overlap_chars(self) -> int:
        return int(self.child_chars * self.overlap_pct)


# Source-type specific configurations
CHUNKING_CONFIGS: dict[str, ChunkingConfig] = {
    "pdf": ChunkingConfig(child_tokens=128, parent_tokens=512, overlap_pct=0.15),
    "docx": ChunkingConfig(child_tokens=128, parent_tokens=512, overlap_pct=0.15),
    "pptx": ChunkingConfig(child_tokens=256, parent_tokens=512, overlap_pct=0.10),
    "markdown": ChunkingConfig(child_tokens=150, parent_tokens=400, overlap_pct=0.10),
    "text": ChunkingConfig(child_tokens=150, parent_tokens=400, overlap_pct=0.10),
    "audio": ChunkingConfig(child_tokens=256, parent_tokens=512, overlap_pct=0.15),
    "youtube": ChunkingConfig(child_tokens=300, parent_tokens=600, overlap_pct=0.10),
}


def _split_into_sentences(text: str) -> list[str]:
    """Split text into sentences using regex."""
    # Split on sentence-ending punctuation followed by space or newline
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in sentences if s.strip()]


def _create_sliding_windows(
    text: str,
    window_chars: int,
    overlap_chars: int,
) -> list[str]:
    """Create overlapping windows of text, splitting on sentence boundaries."""
    sentences = _split_into_sentences(text)
    if not sentences:
        return [text] if text.strip() else []

    windows: list[str] = []
    current_window: list[str] = []
    current_chars = 0

    for sentence in sentences:
        sentence_len = len(sentence)

        # If adding this sentence exceeds window size, save current window
        if current_chars + sentence_len > window_chars and current_window:
            windows.append(" ".join(current_window))

            # Calculate overlap: keep sentences from the end
            overlap_text = ""
            overlap_sentences: list[str] = []
            for s in reversed(current_window):
                if len(overlap_text) + len(s) > overlap_chars:
                    break
                overlap_sentences.insert(0, s)
                overlap_text = " ".join(overlap_sentences)

            current_window = overlap_sentences.copy()
            current_chars = len(overlap_text)

        current_window.append(sentence)
        current_chars += sentence_len

    # Don't forget the last window
    if current_window:
        windows.append(" ".join(current_window))

    return windows


def chunk_document(
    document: ParsedDocument,
    source_id: str,
) -> list[Chunk]:
    """Chunk a parsed document using hierarchical parent-child strategy.

    1. Create parent chunks from page text (~512 tokens each)
    2. Split each parent into child chunks (~128 tokens each)
    3. Child chunks reference their parent for context expansion

    Args:
        document: Parsed document from any parser.
        source_id: UUID of the source record.

    Returns:
        List of Chunk objects (both parents and children).
    """
    config = CHUNKING_CONFIGS.get(document.source_type, CHUNKING_CONFIGS["pdf"])

    all_chunks: list[Chunk] = []

    for page in document.pages:
        if not page.text.strip():
            continue

        # Step 1: Create parent chunks from page text
        parent_windows = _create_sliding_windows(
            page.text,
            window_chars=config.parent_chars,
            overlap_chars=int(config.parent_chars * 0.10),
        )

        for parent_text in parent_windows:
            if not parent_text.strip():
                continue

            parent_chunk = Chunk(
                content=parent_text,
                chunk_type="parent",
                page_num=page.page_number,
                source_id=source_id,
                token_count=len(parent_text) // CHARS_PER_TOKEN,
                headings=page.headings,
                metadata={
                    "source_type": document.source_type,
                    "title": document.title,
                },
            )
            all_chunks.append(parent_chunk)

            # Step 2: Split parent into child chunks
            child_windows = _create_sliding_windows(
                parent_text,
                window_chars=config.child_chars,
                overlap_chars=config.overlap_chars,
            )

            for child_text in child_windows:
                if not child_text.strip():
                    continue

                child_chunk = Chunk(
                    content=child_text,
                    chunk_type="child",
                    parent_id=parent_chunk.id,
                    page_num=page.page_number,
                    source_id=source_id,
                    token_count=len(child_text) // CHARS_PER_TOKEN,
                    headings=page.headings,
                    metadata={
                        "source_type": document.source_type,
                        "title": document.title,
                    },
                )
                all_chunks.append(child_chunk)

    parents = sum(1 for c in all_chunks if c.chunk_type == "parent")
    children = sum(1 for c in all_chunks if c.chunk_type == "child")
    logger.info(
        "Chunked '%s': %d parents, %d children (%d total)",
        document.title, parents, children, len(all_chunks),
    )

    return all_chunks
