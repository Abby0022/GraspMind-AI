"""Image parser using Gemini Vision models.

Extracts text from images (.jpg, .png) and returns
a single-page ParsedDocument containing Markdown.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path

from google import genai
from PIL import Image

from graspmind.config import get_settings

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
    source_type: str = "image"
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


def parse_image(file_path: str | Path) -> ParsedDocument:
    """Parse an image using Gemini to extract text.

    Args:
        file_path: Path to the image file.

    Returns:
        ParsedDocument with extracted text.

    Raises:
        FileNotFoundError: If the file doesn't exist.
        ValueError: If parsing fails.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}")

    settings = get_settings()
    if not settings.google_api_key:
        raise ValueError("Google API key not configured for image parsing.")

    client = genai.Client(api_key=settings.google_api_key)

    try:
        img = Image.open(path)
        # Convert to RGB to avoid issues with some formats/alphas
        if img.mode != "RGB":
            img = img.convert("RGB")

        prompt = "Extract all text and structural formatting from this image as Markdown. Do not include any other commentary or markdown formatting blocks (like ```markdown), just return the raw markdown text."

        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=[prompt, img]
        )
        text = response.text or ""
    except Exception as exc:
        raise ValueError(f"Failed to parse image: {exc}") from exc

    page = ParsedPage(page_number=1, text=text.strip(), headings=[])

    logger.info("Parsed Image: %s (%d chars)", path.stem, len(text))

    return ParsedDocument(
        title=path.stem,
        pages=[page],
        total_pages=1,
        source_type="image",
        metadata={
            "file_name": path.name,
            "file_size": path.stat().st_size,
        }
    )
