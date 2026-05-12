"""LLM client — BYOK-aware streaming with universal provider support.

All LLM calls flow through this module. It resolves the user's
configured provider, decrypts their key, calls the appropriate
strategy, and wipes the key from memory afterward.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from graspmind.config import get_settings
from graspmind.providers.resolver import (
    LLMKeyDecryptionError,
    LLMNotConfiguredError,
    ResolvedLLM,
    resolve_alternate_fallback,
    resolve_user_llm_with_server_fallback,
)
from graspmind.security.key_sanitizer import scrub_keys
from graspmind.strategies.llm.ollama_strategy import OllamaStrategy
from graspmind.strategies.llm.openai_compat import AnthropicStrategy, OpenAICompatibleStrategy

logger = logging.getLogger(__name__)


async def stream_chat_completion(
    messages: list[dict],
    user_id: str,
) -> AsyncGenerator[str]:
    """Stream a chat completion with automated fallback for capacity errors.

    If the primary provider (BYOK or default fallback) is at capacity,
    it tries alternative server-side providers before failing.
    """
    settings = get_settings()
    tried_providers = set()
    
    # We allow up to 2 attempts (Primary -> Secondary Fallback)
    for attempt in range(2):
        resolved: ResolvedLLM | None = None
        try:
            # On first attempt, use standard resolution
            # On second attempt, force server fallback skipping user config if needed
            if attempt == 0:
                resolved = await resolve_user_llm_with_server_fallback(user_id)
            else:
                # Try to find a fallback that isn't the one we just tried
                resolved = await resolve_alternate_fallback(user_id, exclude_slugs=tried_providers)
            
            if not resolved:
                break

            tried_providers.add(resolved.provider_spec.slug)
            
            # Select strategy based on provider
            provider_slug = resolved.provider_spec.slug
            if provider_slug == "ollama":
                strategy = OllamaStrategy()
            elif provider_slug == "anthropic":
                strategy = AnthropicStrategy()
            else:
                strategy = OpenAICompatibleStrategy()

            logger.info(
                "LLM call (attempt %d): user=%s provider=%s model=%s",
                attempt + 1,
                user_id[:8],
                provider_slug,
                resolved.model,
            )

            # Flag to track if we started receiving content
            started = False
            async for chunk in strategy.stream(
                messages,
                base_url=resolved.base_url,
                api_key=resolved.api_key,
                model=resolved.model,
                auth_header=resolved.provider_spec.auth_header,
                auth_prefix=resolved.provider_spec.auth_prefix,
            ):
                started = True
                yield chunk
            
            # If we successfully finished streaming, we're done
            if started:
                return

        except Exception as e:
            error_msg = str(e).lower()
            is_capacity = any(kw in error_msg for kw in ["capacity", "rate limit", "429", "overloaded", "quota"])
            
            if is_capacity and not started and attempt < 1:
                logger.warning("LLM provider %s at capacity, trying fallback...", tried_providers)
                continue
            
            safe_msg = scrub_keys(str(e))
            logger.error("LLM streaming error for user %s: %s", user_id[:8], safe_msg)
            yield f"\n\n[Error: AI provider failed — {safe_msg}]"
            return
        finally:
            if resolved:
                resolved.wipe()

    yield "\n\n[Error: All AI providers are currently at capacity. Please try again in a few minutes.]"


async def complete_chat(
    messages: list[dict],
    user_id: str,
) -> str:
    """Non-streaming chat completion (for quiz gen, summaries, etc).

    Returns the complete response text.
    """
    chunks: list[str] = []
    async for chunk in stream_chat_completion(messages, user_id):
        chunks.append(chunk)
    return "".join(chunks)
