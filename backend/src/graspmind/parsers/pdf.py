"""PDF document parser using PyMuPDF.

Extracts text from both text-based and image-based PDFs.
Preserves heading hierarchy and page boundaries for
downstream chunking.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf  # PyMuPDF

logger = logging.getLogger(__name__)


@dataclass
class ParsedPage:
    """A single page of extracted content."""

    page_number: int
    text: str
    headings: list[str] = field(default_factory=list)


@dataclass
class ParsedDocument:
    """Complete parsed document with metadata."""

    title: str
    pages: list[ParsedPage]
    total_pages: int
    source_type: str = "pdf"
    metadata: dict = field(default_factory=dict)

    @property
    def full_text(self) -> str:
        """Concatenate all pages into a single text."""
        return "\n\n".join(
            f"[Page {p.page_number}]\n{p.text}"
            for p in self.pages
            if p.text.strip()
        )

    @property
    def total_chars(self) -> int:
        return sum(len(p.text) for p in self.pages)


def parse_pdf(file_path: str | Path) -> ParsedDocument:
    """Parse a PDF file and extract text content page by page.

    Args:
        file_path: Path to the PDF file.

    Returns:
        ParsedDocument with page-level text extraction.

    Raises:
        FileNotFoundError: If the file doesn't exist.
        ValueError: If the file is not a valid PDF.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")

    try:
        doc = pymupdf.open(str(path))
    except Exception as exc:
        raise ValueError(f"Failed to open PDF: {exc}") from exc

    pages: list[ParsedPage] = []

    for page_num in range(len(doc)):
        page = doc[page_num]

        # Extract text with layout preservation
        text = page.get_text("text")

        # Extract headings (text blocks with larger font sizes)
        headings: list[str] = []
        blocks = page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)
        if "blocks" in blocks:
            for block in blocks["blocks"]:
                if block.get("type") == 0:  # Text block
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            # Heuristic: font size > 14pt likely a heading
                            if span.get("size", 0) > 14 and span.get("text", "").strip():
                                headings.append(span["text"].strip())

        if text.strip():
            pages.append(ParsedPage(
                page_number=page_num + 1,
                text=text.strip(),
                headings=headings,
            ))

    doc.close()

    # Try to get title from metadata or first heading
    pdf_title = path.stem
    metadata = doc.metadata if hasattr(doc, "metadata") else {}
    if metadata and metadata.get("title"):
        pdf_title = metadata["title"]
    elif pages and pages[0].headings:
        pdf_title = pages[0].headings[0]

    logger.info("Parsed PDF: %s (%d pages, %d chars)", pdf_title, len(pages),
                sum(len(p.text) for p in pages))

    return ParsedDocument(
        title=pdf_title,
        pages=pages,
        total_pages=len(pages),
        source_type="pdf",
        metadata={
            "file_name": path.name,
            "file_size": path.stat().st_size,
        },
    )
