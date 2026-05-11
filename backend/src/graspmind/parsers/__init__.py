"""Parser registry — auto-detect file type and route to the correct parser.

Supported types:
- PDF (.pdf)
- DOCX (.docx)
- PPTX (.pptx)
- Text (.txt)
- Markdown (.md, .markdown)
"""

import logging
from pathlib import Path

from graspmind.parsers.docx import parse_docx
from graspmind.parsers.image import parse_image
from graspmind.parsers.pdf import ParsedDocument, parse_pdf
from graspmind.parsers.slides import parse_pptx
from graspmind.parsers.text import parse_text

logger = logging.getLogger(__name__)

# File extension → parser function mapping
PARSER_REGISTRY: dict[str, callable] = {
    ".pdf": parse_pdf,
    ".docx": parse_docx,
    ".pptx": parse_pptx,
    ".txt": parse_text,
    ".md": parse_text,
    ".markdown": parse_text,
    ".jpg": parse_image,
    ".jpeg": parse_image,
    ".png": parse_image,
}

# MIME type → source type mapping (for upload validation)
ALLOWED_MIME_TYPES: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "markdown",
    "text/markdown": "markdown",
    "image/jpeg": "image",
    "image/png": "image",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def detect_source_type(filename: str) -> str | None:
    """Detect source type from filename extension."""
    ext = Path(filename).suffix.lower()
    type_map = {
        ".pdf": "pdf",
        ".docx": "docx",
        ".pptx": "pptx",
        ".txt": "markdown",
        ".md": "markdown",
        ".markdown": "markdown",
        ".jpg": "image",
        ".jpeg": "image",
        ".png": "image",
    }
    return type_map.get(ext)


def parse_document(file_path: str | Path) -> ParsedDocument:
    """Parse a document using the appropriate parser based on file extension.

    Args:
        file_path: Path to the document file.

    Returns:
        ParsedDocument with extracted text.

    Raises:
        ValueError: If the file type is not supported.
        FileNotFoundError: If the file doesn't exist.
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    parser = PARSER_REGISTRY.get(ext)
    if parser is None:
        supported = ", ".join(PARSER_REGISTRY.keys())
        raise ValueError(
            f"Unsupported file type: '{ext}'. Supported: {supported}"
        )

    logger.info("Parsing %s with %s parser", path.name, ext)
    return parser(file_path)


def validate_upload(filename: str, content_type: str, file_size: int) -> tuple[bool, str]:
    """Validate an uploaded file before processing.

    Returns:
        (is_valid, error_message) tuple.
    """
    # Check file size
    if file_size > MAX_FILE_SIZE:
        return False, f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB."

    # Check MIME type
    if content_type not in ALLOWED_MIME_TYPES:
        allowed = ", ".join(ALLOWED_MIME_TYPES.values())
        return False, f"Unsupported file type: {content_type}. Allowed: {allowed}"

    # Check extension matches MIME type
    ext = Path(filename).suffix.lower()
    if ext not in PARSER_REGISTRY:
        return False, f"Unsupported file extension: {ext}"

    return True, ""
