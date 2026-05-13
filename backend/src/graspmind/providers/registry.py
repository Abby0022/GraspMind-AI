"""Provider registry — catalog of all supported LLM providers.

Maps provider slugs to their base URLs, default models, authentication
formats, and display metadata. Used by the resolver and the frontend
settings page.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ProviderSpec:
    """Immutable specification for a single LLM provider."""

    slug: str
    name: str
    base_url: str
    default_model: str
    auth_header: str = "Authorization"
    auth_prefix: str = "Bearer"
    supports_streaming: bool = True
    key_hint: str = ""
    key_required: bool = True
    models: tuple[str, ...] = field(default_factory=tuple)


# ── Provider Catalog ─────────────────────────────────────────────
# Every provider that speaks the OpenAI chat completions protocol
# (or has a thin adapter) belongs here.

PROVIDER_REGISTRY: dict[str, ProviderSpec] = {
    "groq": ProviderSpec(
        slug="groq",
        name="Groq",
        base_url="https://api.groq.com/openai/v1",
        default_model="llama-4-scout",
        key_hint="gsk_...",
        models=(
            "llama-4-scout",
            "llama-4-maverick",
            "llama-3.3-70b-versatile",
            "deepseek-v4-flash",
            "mixtral-8x22b-instant",
        ),
    ),
    "google": ProviderSpec(
        slug="google",
        name="Google Gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta",
        default_model="gemini-3.1-flash",
        auth_header="x-goog-api-key",
        auth_prefix="",
        key_hint="AI...",
        models=(
            "gemini-3.1-pro",
            "gemini-3.1-flash",
            "gemini-3.1-flash-lite",
            "gemini-3.1-flash-live",
            "gemini-3-pro-thinking",
            "gemma-4-27b-it",
            "gemini-2.0-flash",
            "gemini-1.5-pro",
        ),
    ),
    "openai": ProviderSpec(
        slug="openai",
        name="OpenAI",
        base_url="https://api.openai.com/v1",
        default_model="gpt-5.5-instant",
        key_hint="sk-...",
        models=(
            "gpt-5.5",
            "gpt-5.5-instant",
            "gpt-5",
            "o3-mini",
            "o1",
            "gpt-4o",
        ),
    ),
    "anthropic": ProviderSpec(
        slug="anthropic",
        name="Anthropic (Claude)",
        base_url="https://api.anthropic.com/v1",
        default_model="claude-4-7-sonnet",
        auth_header="x-api-key",
        auth_prefix="",
        key_hint="sk-ant-...",
        models=(
            "claude-4-7-opus",
            "claude-4-7-sonnet",
            "claude-4-7-haiku",
            "claude-3-7-sonnet-20250219",
        ),
    ),
    "mistral": ProviderSpec(
        slug="mistral",
        name="Mistral AI",
        base_url="https://api.mistral.ai/v1",
        default_model="mistral-large-v4",
        key_hint="",
        models=(
            "mistral-large-v4",
            "mistral-medium-v3",
            "mistral-small-v4",
            "pixtral-large-latest",
        ),
    ),
    "together": ProviderSpec(
        slug="together",
        name="Together AI",
        base_url="https://api.together.xyz/v1",
        default_model="meta-llama/Llama-4-Scout-Instruct",
        key_hint="",
        models=(
            "meta-llama/Llama-4-Scout-Instruct",
            "meta-llama/Llama-4-Maverick-Instruct",
            "mistralai/Mistral-Large-v4",
            "Qwen/Qwen3-72B-Instruct",
        ),
    ),
    "fireworks": ProviderSpec(
        slug="fireworks",
        name="Fireworks AI",
        base_url="https://api.fireworks.ai/inference/v1",
        default_model="accounts/fireworks/models/llama-v4-scout",
        key_hint="",
        models=(
            "accounts/fireworks/models/llama-v4-scout",
            "accounts/fireworks/models/llama-v4-maverick",
        ),
    ),
    "openrouter": ProviderSpec(
        slug="openrouter",
        name="OpenRouter",
        base_url="https://openrouter.ai/api/v1",
        default_model="google/gemini-3.1-flash:free",
        key_hint="sk-or-...",
        models=(
            "google/gemini-3.1-flash:free",
            "meta-llama/llama-4-scout:free",
            "anthropic/claude-4-7-haiku:free",
            "mistralai/mistral-small-v4:free",
            "qwen/qwen3-8b:free",
        ),
    ),
    "deepseek": ProviderSpec(
        slug="deepseek",
        name="DeepSeek",
        base_url="https://api.deepseek.com/v1",
        default_model="deepseek-v4-flash",
        key_hint="sk-...",
        models=(
            "deepseek-v4-pro",
            "deepseek-v4-flash",
            "deepseek-chat",
            "deepseek-reasoner",
        ),
    ),
    "xai": ProviderSpec(
        slug="xai",
        name="xAI (Grok)",
        base_url="https://api.x.ai/v1",
        default_model="grok-4.3",
        key_hint="xai-...",
        models=(
            "grok-4.3",
            "grok-4-mini",
            "grok-3",
        ),
    ),
    "cerebras": ProviderSpec(
        slug="cerebras",
        name="Cerebras",
        base_url="https://api.cerebras.ai/v1",
        default_model="llama-4-scout",
        key_hint="csk-...",
        models=(
            "llama-4-scout",
            "llama-3.3-70b",
        ),
    ),
    "perplexity": ProviderSpec(
        slug="perplexity",
        name="Perplexity",
        base_url="https://api.perplexity.ai",
        default_model="sonar-pro",
        key_hint="pplx-...",
        models=(
            "sonar-pro",
            "sonar-reasoning-pro",
            "sonar",
        ),
    ),
    "cohere": ProviderSpec(
        slug="cohere",
        name="Cohere",
        base_url="https://api.cohere.com/v2",
        default_model="command-r-v2",
        key_hint="",
        models=(
            "command-r-v2",
            "command-r-plus-v2",
            "command-light",
        ),
    ),
    "ollama": ProviderSpec(
        slug="ollama",
        name="Ollama (Local)",
        base_url="http://localhost:11434",
        default_model="llama4",
        key_required=False,
        key_hint="No key needed",
        models=(
            "llama4",
            "llama3.3",
            "mistral-v4",
            "phi4",
            "gemma4",
        ),
    ),
    "custom": ProviderSpec(
        slug="custom",
        name="Custom Endpoint",
        base_url="",
        default_model="",
        key_required=False,
        key_hint="Depends on provider",
        models=(),
    ),
}


def get_provider(slug: str) -> ProviderSpec | None:
    """Look up a provider by slug. Returns None if not found."""
    return PROVIDER_REGISTRY.get(slug)


def list_providers() -> list[dict]:
    """Return a JSON-serializable list of all providers for the frontend catalog."""
    return [
        {
            "slug": spec.slug,
            "name": spec.name,
            "default_model": spec.default_model,
            "models": list(spec.models),
            "key_required": spec.key_required,
            "key_hint": spec.key_hint,
        }
        for spec in PROVIDER_REGISTRY.values()
    ]
