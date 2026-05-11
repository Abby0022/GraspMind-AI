"""Ollama LLM Strategy — for local model inference.

Ollama uses a non-standard wire format (/api/chat) so it keeps its own
strategy. Updated to accept per-request credentials for BYOK.
"""

import json
from collections.abc import AsyncGenerator

import httpx

from graspmind.errors.exceptions import ProviderFallbackError

from .base import LLMStrategy


class OllamaStrategy(LLMStrategy):
    """Strategy for streaming chat completions from a local Ollama instance."""

    async def stream(
        self,
        messages: list[dict],
        *,
        base_url: str,
        api_key: str = "",  # Not used for Ollama
        model: str,
        timeout: float = 120.0,
        **kwargs,
    ) -> AsyncGenerator[str]:
        url = f"{base_url.rstrip('/')}/api/chat"

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": 0.3,
                "num_predict": 4096,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client, client.stream(
                "POST", url, json=payload
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    raise ProviderFallbackError(
                        f"Ollama API error {response.status_code}: {body}"
                    )

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue

                    try:
                        chunk = json.loads(line)
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue
        except httpx.RequestError as e:
            raise ProviderFallbackError(f"Ollama connection error: {str(e)}") from e
