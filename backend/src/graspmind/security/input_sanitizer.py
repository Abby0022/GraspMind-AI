"""Input sanitization utilities.

Provides functions to sanitize user input to prevent XSS,
SQL injection via content, and other injection attacks.
"""

import re
from pathlib import PurePosixPath

import bleach

# Allowed HTML tags for rich text fields (very restrictive)
ALLOWED_TAGS = [
    "p", "br", "strong", "em", "u", "ol", "ul", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre",
]
ALLOWED_ATTRIBUTES: dict[str, list[str]] = {}

# Pattern for safe filenames
SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9._\- ]")


def sanitize_html(html: str) -> str:
    """Strip dangerous HTML tags and attributes, keeping safe formatting."""
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True,
    )


def sanitize_filename(filename: str) -> str:
    """Sanitize an uploaded filename to prevent path traversal and injection.

    - Strips directory components
    - Removes dangerous characters
    - Limits length to 255 characters
    """
    # Extract just the filename (no directory traversal)
    name = PurePosixPath(filename).name

    # Remove null bytes
    name = name.replace("\x00", "")

    # Replace unsafe characters
    name = SAFE_FILENAME_RE.sub("_", name)

    # Limit length
    name = name[:255]

    # Don't allow empty or dot-only filenames
    if not name or name.startswith("."):
        name = f"upload_{name}"

    return name


def sanitize_text(text: str, max_length: int = 10_000) -> str:
    """Sanitize plain text input — strip control chars, limit length."""
    # Remove null bytes and other control characters (keep newlines/tabs)
    cleaned = "".join(
        ch for ch in text if ch in ("\n", "\t", "\r") or (ord(ch) >= 32)
    )
    return cleaned[:max_length]
