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
        base_url: str | None,
        api_key: str | None,
        model: str | None,
        timeout: float = 60.0,
        auth_header: str = "Authorization",
        auth_prefix: str = "Bearer",
        **kwargs,
    ) -> AsyncGenerator[str]:
        """Stream SSE response from an OpenAI-compatible endpoint or native Google API."""
        # Defensive checks
        if not base_url:
            raise ProviderFallbackError("API Base URL is required but was not provided.")
        if not model:
            raise ProviderFallbackError("Model name is required but was not provided.")
        
        # ── SPECIAL CASE: Native Google Gemini REST API ──────────────────
        if "generativelanguage.googleapis.com" in base_url:
            logger.debug("Routing to native Gemini strategy for model: %s", model)
            async for chunk in self._stream_gemini_native(messages, base_url, api_key or "", model, timeout, **kwargs):
                yield chunk
            return

        # ── STANDARD: OpenAI Compatible ──────────────────────────────────
        url = f"{base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": kwargs.get("temperature", 0.3),
            "max_tokens": kwargs.get("max_tokens", 4096),
        }
        
        # Handle reasoning effort for o1/o3/DeepSeek-R1 models
        model_low = model.lower()
        if any(x in model_low for x in ["o1", "o3", "reasoning", "r1"]):
            payload["reasoning_effort"] = kwargs.get("reasoning_effort", "medium")

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers[auth_header] = f"{auth_prefix} {api_key}".strip() if auth_prefix else api_key
            headers["User-Agent"] = "GraspMind-AI/1.0"

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code == 429:
                        raise ProviderFallbackError("The selected AI provider is currently at capacity (429). Please wait a moment or switch to a different provider.")
                    elif response.status_code != 200:
                        body = await response.aread()
                        safe_body = scrub_keys(body.decode("utf-8", errors="replace")[:500])
                        raise ProviderFallbackError(f"API Error {response.status_code}: {safe_body}")

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "): continue
                        data = line.removeprefix("data: ").strip()
                        if data == "[DONE]": break
                        try:
                            chunk = json.loads(data)
                            choices = chunk.get("choices", [{}])
                            if not choices: continue
                            content = choices[0].get("delta", {}).get("content", "")
                            if content: yield content
                        except: continue
        except Exception as e:
            if isinstance(e, ProviderFallbackError): raise
            raise ProviderFallbackError(f"Connection failed: {scrub_keys(str(e))}")

    async def _stream_gemini_native(
        self, messages: list[dict], base_url: str, api_key: str, model: str, timeout: float, **kwargs
    ) -> AsyncGenerator[str]:
        """Direct integration with Google's native streamGenerateContent REST API."""
        # Smart versioning: preview/exp/thinking/new models MUST use v1beta
        version = "v1beta" if any(x in model.lower() for x in ["preview", "exp", "thinking", "2.0", "3-", "3.0", "3.1"]) else "v1"
        
        # Ensure the domain is correct and inject the version
        domain = "https://generativelanguage.googleapis.com"
        url = f"{domain}/{version}/models/{model}:streamGenerateContent?key={api_key}"
        
        contents = []
        system_instruction = None
        
        for msg in messages:
            if msg["role"] == "system":
                system_instruction = {"parts": [{"text": msg["content"]}]}
                continue
            role = "model" if msg["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        payload = {
            "contents": contents, 
            "generationConfig": {
                "temperature": kwargs.get("temperature", 0.2), 
                "maxOutputTokens": kwargs.get("max_tokens", 4096)
            }
        }
        
        if system_instruction:
            payload["system_instruction"] = system_instruction
            
        # Support thinking_level for Gemini 3 models
        if "3-" in model or "3.1" in model or "thinking" in model.lower():
            payload["thinking_level"] = kwargs.get("thinking_level", "HIGH")
        
        buffer = ""
        try:
            async with httpx.AsyncClient(timeout=timeout) as client, client.stream(
                "POST", url, json=payload
            ) as response:
                if response.status_code == 429:
                    raise ProviderFallbackError("Google Gemini is currently experiencing high demand. Please wait a moment or switch to an alternative provider in the chat settings to continue.")
                elif response.status_code != 200:
                    body = await response.aread()
                    raise ProviderFallbackError(f"Google Native API error {response.status_code}: {body.decode()}")

                async for chunk_bytes in response.aiter_bytes():
                    buffer += chunk_bytes.decode(errors="replace")
                    
                    # Google sends a JSON array [ {...}, {...} ]. We need to extract the objects.
                    while True:
                        buffer = buffer.lstrip().lstrip("[").lstrip(",").lstrip().lstrip("]")
                        if not buffer or not buffer.startswith("{"): break
                        
                        # Find the end of the current JSON object
                        depth = 0
                        end_pos = -1
                        for i, char in enumerate(buffer):
                            if char == "{": depth += 1
                            elif char == "}":
                                depth -= 1
                                if depth == 0:
                                    end_pos = i + 1
                                    break
                        
                        if end_pos == -1: break # Incomplete object
                        
                        try:
                            obj = json.loads(buffer[:end_pos])
                            buffer = buffer[end_pos:].strip()
                            
                            candidates = obj.get("candidates", [{}])
                            if candidates:
                                text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                                if text: yield text
                        except:
                            break
        except Exception as e:
            logger.exception("Gemini Native strategy failed")
            if isinstance(e, ProviderFallbackError): raise
            raise ProviderFallbackError(f"Google Native connection failed: {scrub_keys(str(e))}")


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
            "max_tokens": kwargs.get("max_tokens", 4096),
            "temperature": kwargs.get("temperature", 0.3),
        }
        if system_text.strip():
            payload["system"] = system_text.strip()

        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01", # Note: Anthropic versions are static for long periods
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
