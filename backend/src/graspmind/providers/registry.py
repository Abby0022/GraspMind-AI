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
        default_model="llama-3.3-70b-versatile",
        key_hint="gsk_...",
        models=(
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "mixtral-8x7b-32768",
            "gemma2-9b-it",
        ),
    ),
    "google": ProviderSpec(
        slug="google",
        name="Google Gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        default_model="gemini-2.0-flash",
        key_hint="AI...",
        models=(
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
        ),
    ),
    "openai": ProviderSpec(
        slug="openai",
        name="OpenAI",
        base_url="https://api.openai.com/v1",
        default_model="gpt-4o-mini",
        key_hint="sk-...",
        models=(
            "gpt-4o-mini",
            "gpt-4o",
            "gpt-4.1-mini",
            "gpt-4.1-nano",
            "o4-mini",
        ),
    ),
    "anthropic": ProviderSpec(
        slug="anthropic",
        name="Anthropic (Claude)",
        base_url="https://api.anthropic.com/v1",
        default_model="claude-sonnet-4-20250514",
        auth_header="x-api-key",
        auth_prefix="",
        key_hint="sk-ant-...",
        models=(
            "claude-sonnet-4-20250514",
            "claude-3-5-haiku-20241022",
            "claude-3-5-sonnet-20241022",
        ),
    ),
    "mistral": ProviderSpec(
        slug="mistral",
        name="Mistral AI",
        base_url="https://api.mistral.ai/v1",
        default_model="mistral-small-latest",
        key_hint="",
        models=(
            "mistral-small-latest",
            "mistral-medium-latest",
            "mistral-large-latest",
            "open-mistral-nemo",
        ),
    ),
    "together": ProviderSpec(
        slug="together",
        name="Together AI",
        base_url="https://api.together.xyz/v1",
        default_model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
        key_hint="",
        models=(
            "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
            "mistralai/Mixtral-8x7B-Instruct-v0.1",
            "Qwen/Qwen2.5-72B-Instruct-Turbo",
        ),
    ),
    "fireworks": ProviderSpec(
        slug="fireworks",
        name="Fireworks AI",
        base_url="https://api.fireworks.ai/inference/v1",
        default_model="accounts/fireworks/models/llama-v3p3-70b-instruct",
        key_hint="",
        models=(
            "accounts/fireworks/models/llama-v3p3-70b-instruct",
            "accounts/fireworks/models/llama-v3p1-8b-instruct",
        ),
    ),
    "openrouter": ProviderSpec(
        slug="openrouter",
        name="OpenRouter",
        base_url="https://openrouter.ai/api/v1",
        default_model="meta-llama/llama-3.3-70b-instruct:free",
        key_hint="sk-or-...",
        models=(
            "meta-llama/llama-3.3-70b-instruct:free",
            "google/gemini-2.0-flash-exp:free",
            "mistralai/mistral-small-3.1-24b-instruct:free",
            "qwen/qwen3-8b:free",
        ),
    ),
    "deepseek": ProviderSpec(
        slug="deepseek",
        name="DeepSeek",
        base_url="https://api.deepseek.com/v1",
        default_model="deepseek-chat",
        key_hint="sk-...",
        models=(
            "deepseek-chat",
            "deepseek-reasoner",
        ),
    ),
    "xai": ProviderSpec(
        slug="xai",
        name="xAI (Grok)",
        base_url="https://api.x.ai/v1",
        default_model="grok-3-mini-fast",
        key_hint="xai-...",
        models=(
            "grok-3-mini-fast",
            "grok-3-fast",
            "grok-2",
        ),
    ),
    "cerebras": ProviderSpec(
        slug="cerebras",
        name="Cerebras",
        base_url="https://api.cerebras.ai/v1",
        default_model="llama-3.3-70b",
        key_hint="csk-...",
        models=(
            "llama-3.3-70b",
            "llama-3.1-8b",
        ),
    ),
    "perplexity": ProviderSpec(
        slug="perplexity",
        name="Perplexity",
        base_url="https://api.perplexity.ai",
        default_model="sonar",
        key_hint="pplx-...",
        models=(
            "sonar",
            "sonar-pro",
            "sonar-reasoning",
        ),
    ),
    "cohere": ProviderSpec(
        slug="cohere",
        name="Cohere",
        base_url="https://api.cohere.com/v2",
        default_model="command-r-plus",
        key_hint="",
        models=(
            "command-r-plus",
            "command-r",
            "command-light",
        ),
    ),
    "ollama": ProviderSpec(
        slug="ollama",
        name="Ollama (Local)",
        base_url="http://localhost:11434",
        default_model="llama3",
        key_required=False,
        key_hint="No key needed",
        models=(
            "llama3",
            "llama3.1",
            "mistral",
            "phi3",
            "gemma2",
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
