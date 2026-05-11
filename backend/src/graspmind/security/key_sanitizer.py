"""API key sanitizer — scrubs key patterns from text.

Applied globally in error handlers and logging to ensure API keys
never leak through stack traces, error messages, or log output.
"""

from __future__ import annotations

import re

# Patterns that match common API key formats.
# Each pattern is greedy enough to catch full keys but narrow enough
# to avoid false positives in normal text.
_KEY_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"gsk_[a-zA-Z0-9]{20,}"),          # Groq
    re.compile(r"sk-ant-[a-zA-Z0-9\-]{20,}"),     # Anthropic
    re.compile(r"sk-or-[a-zA-Z0-9\-]{20,}"),      # OpenRouter
    re.compile(r"sk-proj-[a-zA-Z0-9\-]{20,}"),    # OpenAI (project keys)
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),            # OpenAI / DeepSeek (generic)
    re.compile(r"xai-[a-zA-Z0-9]{20,}"),           # xAI
    re.compile(r"csk-[a-zA-Z0-9]{20,}"),           # Cerebras
    re.compile(r"pplx-[a-zA-Z0-9]{20,}"),          # Perplexity
    re.compile(r"AI[a-zA-Z0-9_\-]{30,}"),          # Google (AIza...)
    # Generic Bearer token pattern (last resort)
    re.compile(r"Bearer\s+[a-zA-Z0-9_\-\.]{20,}"),
]

_REPLACEMENT = "[REDACTED]"


def scrub_keys(text: str) -> str:
    """Replace any API key patterns in text with [REDACTED].

    Safe to call on any string — returns the original if no keys found.
    """
    if not text:
        return text

    result = text
    for pattern in _KEY_PATTERNS:
        result = pattern.sub(_REPLACEMENT, result)
    return result


def scrub_exception(exc: Exception) -> str:
    """Extract and scrub the string representation of an exception."""
    return scrub_keys(str(exc))
