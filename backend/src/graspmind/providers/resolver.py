"""LLM Provider Resolver — per-request BYOK config loading.

Resolves the active LLM configuration for a user by:
1. Checking Redis cache for encrypted config
2. Falling back to Supabase user_providers table
3. Decrypting the key in memory for the duration of the call
4. Providing a clean interface for all LLM callers

If no user config exists, raises LLMNotConfiguredError with a
user-friendly message directing them to the Settings page.
"""

from __future__ import annotations

import gc
import json
import logging
from dataclasses import dataclass

from graspmind.config import get_settings
from graspmind.providers.registry import PROVIDER_REGISTRY, ProviderSpec, get_provider
from graspmind.security.vault import VaultError, decrypt_key

logger = logging.getLogger(__name__)


class LLMNotConfiguredError(Exception):
    """User has no active LLM provider configured."""


class LLMKeyDecryptionError(Exception):
    """Failed to decrypt user's API key — likely master key rotation."""


@dataclass
class ResolvedLLM:
    """Resolved LLM configuration ready for use in a strategy."""

    provider_spec: ProviderSpec
    api_key: str
    model: str
    base_url: str

    def wipe(self) -> None:
        """Zero out the API key from memory."""
        self.api_key = ""
        gc.collect()


async def resolve_user_llm(user_id: str) -> ResolvedLLM:
    """Resolve the active LLM config for a user.

    Resolution order:
    1. Redis cache (encrypted config, 5-min TTL)
    2. Supabase user_providers table
    3. Fallback to server-configured provider (if available)

    Returns:
        ResolvedLLM with decrypted credentials.

    Raises:
        LLMNotConfiguredError: No active provider found.
        LLMKeyDecryptionError: Key decryption failed.
    """
    settings = get_settings()

    # Try Redis cache first
    config = await _load_from_cache(user_id)

    # Fall back to Supabase
    if not config:
        config = await _load_from_db(user_id)
        if config:
            await _cache_config(user_id, config)

    # If user has no config, try server-level fallback
    if not config:
        config = _server_fallback()

    if not config:
        raise LLMNotConfiguredError(
            "No LLM provider configured. Please add an API key in Settings → Providers."
        )

    # Resolve provider spec
    provider_spec = get_provider(config["provider"])
    if not provider_spec:
        raise LLMNotConfiguredError(
            f"Unknown provider '{config['provider']}'. Please reconfigure in Settings."
        )

    # Decrypt the API key
    api_key = ""
    if config.get("api_key_enc"):
        try:
            api_key = decrypt_key(config["api_key_enc"])
        except VaultError as e:
            logger.error("Key decryption failed for user %s: %s", user_id, str(e))
            raise LLMKeyDecryptionError(
                "Failed to decrypt your API key. It may need to be re-entered in Settings."
            ) from e

    # Determine base URL and model
    base_url = config.get("base_url") or provider_spec.base_url
    model = config.get("model") or provider_spec.default_model

    return ResolvedLLM(
        provider_spec=provider_spec,
        api_key=api_key,
        model=model,
        base_url=base_url,
    )


def _server_fallback() -> dict | None:
    """Check if the server has global API keys configured as a fallback."""
    settings = get_settings()

    if settings.groq_api_key:
        return {
            "provider": "groq",
            "api_key_enc": "",  # Not encrypted — it's from env
            "_raw_key": settings.groq_api_key,
            "model": settings.llm_model,
            "base_url": "",
        }
    if settings.google_api_key:
        return {
            "provider": "google",
            "api_key_enc": "",
            "_raw_key": settings.google_api_key,
            "model": "gemini-2.0-flash",
            "base_url": "",
        }
    return None


async def resolve_user_llm_with_server_fallback(user_id: str) -> ResolvedLLM:
    """Like resolve_user_llm but uses _raw_key for server-level keys."""
    settings = get_settings()

    # Try user config first
    config = await _load_from_cache(user_id)
    if not config:
        config = await _load_from_db(user_id)
        if config:
            await _cache_config(user_id, config)

    if not config:
        config = _server_fallback()

    if not config:
        raise LLMNotConfiguredError(
            "No LLM provider configured. Please add an API key in Settings → Providers."
        )

    provider_spec = get_provider(config["provider"])
    if not provider_spec:
        raise LLMNotConfiguredError(f"Unknown provider '{config['provider']}'.")

    # Determine API key — either from vault or raw server key
    api_key = ""
    if config.get("_raw_key"):
        api_key = config["_raw_key"]
    elif config.get("api_key_enc"):
        try:
            api_key = decrypt_key(config["api_key_enc"])
        except VaultError as e:
            raise LLMKeyDecryptionError(str(e)) from e

    base_url = config.get("base_url") or provider_spec.base_url
    model = config.get("model") or provider_spec.default_model

    return ResolvedLLM(
        provider_spec=provider_spec,
        api_key=api_key,
        model=model,
        base_url=base_url,
    )


# ── Cache helpers ────────────────────────────────────────────────

_CACHE_TTL = 300  # 5 minutes

async def _load_from_cache(user_id: str) -> dict | None:
    """Load encrypted config from Redis cache."""
    try:
        from graspmind.security.rate_limiter import get_redis
        redis = await get_redis()
        cached = await redis.get(f"llm_config:{user_id}")
        if cached:
            return json.loads(cached)
    except Exception:
        pass  # Cache miss is not an error
    return None


async def _cache_config(user_id: str, config: dict) -> None:
    """Cache encrypted config in Redis (never caches decrypted keys)."""
    try:
        from graspmind.security.rate_limiter import get_redis
        redis = await get_redis()
        # Only cache safe fields — never raw keys
        safe = {
            "provider": config.get("provider"),
            "model": config.get("model"),
            "base_url": config.get("base_url"),
            "api_key_enc": config.get("api_key_enc", ""),
        }
        await redis.setex(f"llm_config:{user_id}", _CACHE_TTL, json.dumps(safe))
    except Exception:
        pass  # Cache write failure is not critical


async def invalidate_cache(user_id: str) -> None:
    """Invalidate the cached config for a user (called on CRUD operations)."""
    try:
        from graspmind.security.rate_limiter import get_redis
        redis = await get_redis()
        await redis.delete(f"llm_config:{user_id}")
    except Exception:
        pass


# ── Database helpers ─────────────────────────────────────────────

async def _load_from_db(user_id: str) -> dict | None:
    """Load the user's default active provider from Supabase."""
    try:
        from supabase import acreate_client
        settings = get_settings()
        client = await acreate_client(settings.supabase_url, settings.supabase_service_key)

        # Prefer the default provider; fall back to any active one
        result = await (
            client.table("user_providers")
            .select("provider, model, base_url, api_key_enc")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("is_default", desc=True)
            .limit(1)
            .execute()
        )

        if result.data:
            return result.data[0]
    except Exception as e:
        logger.warning("Failed to load user LLM config: %s", str(e))

    return None
