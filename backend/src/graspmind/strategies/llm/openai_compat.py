"""Universal OpenAI-compatible LLM strategy.

Handles streaming chat completions for any provider that speaks the
OpenAI /v1/chat/completions protocol. This covers Groq, Google Gemini,
OpenAI, Mistral, Together, Fireworks, OpenRouter, DeepSeek, xAI,
Cerebras, Perplexity, Cohere, and any custom endpoint.

Special cases (Anthropic) are handled via request/response translation
within this same strategy.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator

import httpx

from graspmind.errors.exceptions import ProviderFallbackError
from graspmind.security.key_sanitizer import scrub_keys

from .base import LLMStrategy

logger = logging.getLogger(__name__)


class OpenAICompatibleStrategy(LLMStrategy):
    """Universal strategy for any OpenAI-compatible chat completions API."""

    async def stream(
        self,
        messages: list[dict],
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 60.0,
        auth_header: str = "Authorization",
        auth_prefix: str = "Bearer",
        **kwargs,
    ) -> AsyncGenerator[str]:
        """Stream SSE response from an OpenAI-compatible endpoint."""
        url = f"{base_url.rstrip('/')}/chat/completions"

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": 0.3,
            "max_tokens": 4096,
        }

        headers: dict[str, str] = {
            "Content-Type": "application/json",
        }

        # Set auth header (most use Authorization: Bearer, Anthropic uses x-api-key)
        if api_key:
            if auth_prefix:
                headers[auth_header] = f"{auth_prefix} {api_key}"
            else:
                headers[auth_header] = api_key

        try:
            async with httpx.AsyncClient(timeout=timeout) as client, client.stream(
                "POST", url, json=payload, headers=headers
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    # Scrub any key echoes from error body
                    safe_body = scrub_keys(body.decode("utf-8", errors="replace")[:500])
                    raise ProviderFallbackError(
                        f"API returned status {response.status_code}: {safe_body}"
                    )

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data = line.removeprefix("data: ").strip()
                    if data == "[DONE]":
                        break

                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, IndexError, KeyError):
                        continue

        except ProviderFallbackError:
            raise
        except httpx.RequestError as e:
            raise ProviderFallbackError(
                f"Connection error: {scrub_keys(str(e))}"
            ) from e
        except Exception as e:
            raise ProviderFallbackError(
                f"Unexpected error: {scrub_keys(str(e))}"
            ) from e


class AnthropicStrategy(LLMStrategy):
    """Strategy for Anthropic's Claude API.

    Anthropic uses a non-standard API format (/v1/messages with x-api-key header).
    This strategy translates between OpenAI message format and Anthropic's format.
    """

    async def stream(
        self,
        messages: list[dict],
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 60.0,
        **kwargs,
    ) -> AsyncGenerator[str]:
        url = f"{base_url.rstrip('/')}/messages"

        # Extract system message if present
        system_text = ""
        chat_messages = []
        for msg in messages:
            if msg.get("role") == "system":
                system_text += msg.get("content", "") + "\n"
            else:
                chat_messages.append({
                    "role": msg["role"],
                    "content": msg.get("content", ""),
                })

        payload: dict = {
            "model": model,
            "messages": chat_messages,
            "stream": True,
            "max_tokens": 4096,
            "temperature": 0.3,
        }
        if system_text.strip():
            payload["system"] = system_text.strip()

        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client, client.stream(
                "POST", url, json=payload, headers=headers
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    safe_body = scrub_keys(body.decode("utf-8", errors="replace")[:500])
                    raise ProviderFallbackError(
                        f"Anthropic API error {response.status_code}: {safe_body}"
                    )

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data = line.removeprefix("data: ").strip()
                    if not data:
                        continue

                    try:
                        event = json.loads(data)
                        event_type = event.get("type", "")

                        if event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            text = delta.get("text", "")
                            if text:
                                yield text
                        elif event_type == "message_stop":
                            break
                    except (json.JSONDecodeError, KeyError):
                        continue

        except ProviderFallbackError:
            raise
        except httpx.RequestError as e:
            raise ProviderFallbackError(
                f"Anthropic connection error: {scrub_keys(str(e))}"
            ) from e
