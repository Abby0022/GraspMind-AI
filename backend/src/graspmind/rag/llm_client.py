"""LLM client — BYOK-aware streaming with universal provider support.

All LLM calls flow through this module. It resolves the user's
configured provider, decrypts their key, calls the appropriate
strategy, and wipes the key from memory afterward.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from graspmind.providers.resolver import (
    LLMKeyDecryptionError,
    LLMNotConfiguredError,
    ResolvedLLM,
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
    """Stream a chat completion using the user's configured LLM.

    Resolves the user's BYOK config, selects the correct strategy,
    streams the response, and wipes the key from memory.

    Args:
        messages: Chat messages in OpenAI format.
        user_id: The authenticated user's ID.

    Yields:
        Text chunks as they arrive from the LLM.
    """
    resolved: ResolvedLLM | None = None
    try:
        resolved = await resolve_user_llm_with_server_fallback(user_id)

        # Select strategy based on provider
        provider_slug = resolved.provider_spec.slug
        if provider_slug == "ollama":
            strategy = OllamaStrategy()
        elif provider_slug == "anthropic":
            strategy = AnthropicStrategy()
        else:
            strategy = OpenAICompatibleStrategy()

        logger.info(
            "LLM call: user=%s provider=%s model=%s",
            user_id[:8],
            provider_slug,
            resolved.model,
        )

        async for chunk in strategy.stream(
            messages,
            base_url=resolved.base_url,
            api_key=resolved.api_key,
            model=resolved.model,
            auth_header=resolved.provider_spec.auth_header,
            auth_prefix=resolved.provider_spec.auth_prefix,
        ):
            yield chunk

    except LLMNotConfiguredError as e:
        yield f"\n\n[Error: {str(e)}]"
    except LLMKeyDecryptionError as e:
        yield f"\n\n[Error: {str(e)}]"
    except Exception as e:
        safe_msg = scrub_keys(str(e))
        logger.error("LLM streaming error for user %s: %s", user_id[:8], safe_msg)
        yield f"\n\n[Error: AI provider failed — {safe_msg}]"
    finally:
        if resolved:
            resolved.wipe()


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
