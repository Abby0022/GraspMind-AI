"""Plain text and Markdown parser.

Handles .txt and .md files, preserving heading structure
from Markdown syntax.
"""

import logging
import re
from pathlib import Path

from graspmind.parsers.pdf import ParsedDocument, ParsedPage

logger = logging.getLogger(__name__)

# Match Markdown headings: # Heading, ## Heading, etc.
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)


def parse_text(file_path: str | Path) -> ParsedDocument:
    """Parse a plain text or Markdown file.

    Args:
        file_path: Path to the .txt or .md file.

    Returns:
        ParsedDocument with logical page grouping.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    content = path.read_text(encoding="utf-8", errors="replace")

    is_markdown = path.suffix.lower() in (".md", ".markdown")

    # Extract headings from Markdown
    headings: list[str] = []
    if is_markdown:
        headings = [match.group(2) for match in HEADING_RE.finditer(content)]

    # Split into logical pages (~3000 chars) at paragraph boundaries
    pages: list[ParsedPage] = []
    paragraphs = content.split("\n\n")
    current_text: list[str] = []
    current_headings: list[str] = []
    current_chars = 0
    page_num = 1
    chars_per_page = 3000

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # Check if paragraph is a heading
        heading_match = HEADING_RE.match(para)
        if heading_match:
            current_headings.append(heading_match.group(2))

        current_text.append(para)
        current_chars += len(para)

        if current_chars >= chars_per_page:
            pages.append(ParsedPage(
                page_number=page_num,
                text="\n\n".join(current_text),
                headings=current_headings,
            ))
            page_num += 1
            current_text = []
            current_headings = []
            current_chars = 0

    # Last page
    if current_text:
        pages.append(ParsedPage(
            page_number=page_num,
            text="\n\n".join(current_text),
            headings=current_headings,
        ))

    title = path.stem
    if headings:
        title = headings[0]

    logger.info("Parsed %s: %s (%d pages)", path.suffix, title, len(pages))

    return ParsedDocument(
        title=title,
        pages=pages,
        total_pages=len(pages),
        source_type="markdown" if is_markdown else "text",
        metadata={
            "file_name": path.name,
            "file_size": path.stat().st_size,
            "is_markdown": is_markdown,
        },
    )
