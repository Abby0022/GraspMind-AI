"""Provider management API — BYOK key CRUD, testing, and audit.

Endpoints for users to manage their LLM provider configurations:
- List supported providers (public catalog)
- Add/update/delete their own provider keys
- Test a key before saving
- View audit log of key operations
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from graspmind.api.deps import AuthUser, ServiceSupabase
from graspmind.providers.registry import get_provider, list_providers
from graspmind.security.key_sanitizer import scrub_keys
from graspmind.security.rate_limiter import RateLimiter
from graspmind.security.vault import VaultError, decrypt_key, encrypt_key, mask_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/providers", tags=["Providers"])


# ── Schemas ──────────────────────────────────────────────────────

class ProviderConfigRequest(BaseModel):
    """Request body for creating/updating a provider config."""
    provider: str = Field(..., description="Provider slug (e.g. 'groq', 'openai')")
    api_key: str = Field("", description="API key (plaintext — encrypted before storage)")
    model: str = Field("", description="Model override (empty = use default)")
    base_url: str = Field("", description="Custom base URL (for 'custom' provider)")
    is_default: bool = Field(False, description="Set as the default provider")


class ProviderTestRequest(BaseModel):
    """Request body for testing an API key."""
    provider: str
    api_key: str
    model: str = ""
    base_url: str = ""


class ProviderConfigResponse(BaseModel):
    """Response for a single provider config (key is always masked)."""
    provider: str
    provider_name: str
    model: str
    base_url: str
    api_key_masked: str
    is_active: bool
    is_default: bool
    last_used_at: str | None
    last_error: str | None
    created_at: str
    updated_at: str


# ── Public Catalog ───────────────────────────────────────────────

@router.get("/catalog")
async def get_provider_catalog():
    """List all supported LLM providers (public, no auth required)."""
    return {"providers": list_providers()}


# ── User Provider Management ────────────────────────────────────

@router.get("/user")
async def list_user_providers(
    user: AuthUser,
    supabase: ServiceSupabase,
):
    """List the current user's configured providers with masked keys."""
    try:
        result = await (
            supabase.table("user_providers")
            .select("*")
            .eq("user_id", user.id)
            .order("is_default", desc=True)
            .execute()
        )
    except Exception as e:
        # Table may not exist yet — return empty list gracefully
        logger.warning("user_providers query failed (table may not exist): %s", e)
        return {"providers": [], "setup_required": True}

    configs = []
    for row in result.data or []:
        spec = get_provider(row["provider"])
        # Decrypt key just to mask it, then wipe
        masked = ""
        if row.get("api_key_enc"):
            try:
                plain = decrypt_key(row["api_key_enc"])
                masked = mask_key(plain)
                del plain
            except VaultError:
                masked = "[decryption failed]"

        configs.append(ProviderConfigResponse(
            provider=row["provider"],
            provider_name=spec.name if spec else row["provider"],
            model=row.get("model", ""),
            base_url=row.get("base_url", ""),
            api_key_masked=masked,
            is_active=row.get("is_active", True),
            is_default=row.get("is_default", False),
            last_used_at=row.get("last_used_at"),
            last_error=row.get("last_error"),
            created_at=row.get("created_at", ""),
            updated_at=row.get("updated_at", ""),
        ))

    return {"providers": configs}


@router.post(
    "/user",
    dependencies=[Depends(RateLimiter(max_requests=10, window_seconds=60))],
)
async def upsert_user_provider(
    body: ProviderConfigRequest,
    user: AuthUser,
    request: Request,
    supabase: ServiceSupabase,
):
    """Add or update a provider configuration.

    Pipeline: validate → test → encrypt → store → audit → wipe.
    """
    # 1. Validate provider slug
    spec = get_provider(body.provider)
    if not spec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown provider '{body.provider}'. Use /providers/catalog for the full list.",
        )

    # 2. Validate key requirement
    if spec.key_required and not body.api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"API key is required for {spec.name}.",
        )

    # 3. Validate key length
    if body.api_key and (len(body.api_key) < 10 or len(body.api_key) > 500):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key must be between 10 and 500 characters.",
        )

    # 4. Test the key with a tiny completion
    if body.api_key and spec.key_required:
        test_result = await _test_key(
            provider_slug=body.provider,
            api_key=body.api_key,
            model=body.model or spec.default_model,
            base_url=body.base_url or spec.base_url,
            spec=spec,
        )
        if not test_result["success"]:
            # Log the failed test
            await _write_audit(
                supabase, user.id, "tested", body.provider,
                request, {"success": False, "error": test_result["error"]},
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"API key test failed: {test_result['error']}",
            )

    # 5. Encrypt the key
    encrypted = ""
    if body.api_key:
        try:
            encrypted = encrypt_key(body.api_key)
        except VaultError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Key encryption failed: {str(e)}",
            )

    # 6. If setting as default, unset other defaults
    if body.is_default:
        await (
            supabase.table("user_providers")
            .update({"is_default": False})
            .eq("user_id", user.id)
            .execute()
        )

    # 7. Upsert the config
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "user_id": user.id,
        "provider": body.provider,
        "model": body.model or spec.default_model,
        "base_url": body.base_url or "",
        "api_key_enc": encrypted,
        "is_active": True,
        "is_default": body.is_default,
        "last_error": None,
        "updated_at": now,
    }

    result = await (
        supabase.table("user_providers")
        .upsert(row, on_conflict="user_id,provider")
        .execute()
    )

    # 8. Invalidate Redis cache
    from graspmind.providers.resolver import invalidate_cache
    await invalidate_cache(user.id)

    # 9. Audit log
    await _write_audit(supabase, user.id, "created", body.provider, request)

    # 10. Wipe plaintext key
    body.api_key = ""

    return {"status": "ok", "message": f"{spec.name} configured successfully"}


@router.delete("/user/{provider}")
async def delete_user_provider(
    provider: str,
    user: AuthUser,
    request: Request,
    supabase: ServiceSupabase,
):
    """Delete a provider configuration and wipe the encrypted key."""
    result = await (
        supabase.table("user_providers")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider)
        .execute()
    )

    # Invalidate cache
    from graspmind.providers.resolver import invalidate_cache
    await invalidate_cache(user.id)

    # Audit
    await _write_audit(supabase, user.id, "deleted", provider, request)

    return {"status": "ok", "message": f"Provider '{provider}' removed"}


@router.post(
    "/user/test",
    dependencies=[Depends(RateLimiter(max_requests=5, window_seconds=60))],
)
async def test_provider_key(
    body: ProviderTestRequest,
    user: AuthUser,
    request: Request,
    supabase: ServiceSupabase,
):
    """Test an API key without saving it (dry run)."""
    spec = get_provider(body.provider)
    if not spec:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{body.provider}'")

    result = await _test_key(
        provider_slug=body.provider,
        api_key=body.api_key,
        model=body.model or spec.default_model,
        base_url=body.base_url or spec.base_url,
        spec=spec,
    )

    # Audit
    await _write_audit(
        supabase, user.id, "tested", body.provider,
        request, {"success": result["success"]},
    )

    # Wipe key
    body.api_key = ""

    if result["success"]:
        return {"status": "ok", "message": "API key is valid", "model_response": result.get("response", "")}
    else:
        raise HTTPException(status_code=422, detail=f"Test failed: {result['error']}")


@router.get("/user/audit")
async def get_audit_log(
    user: AuthUser,
    supabase: ServiceSupabase,
):
    """View the user's API key audit log (last 50 events)."""
    try:
        result = await (
            supabase.table("api_key_audit_log")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"events": result.data or []}
    except Exception:
        return {"events": []}


# ── Internal Helpers ─────────────────────────────────────────────

async def _test_key(
    provider_slug: str,
    api_key: str,
    model: str,
    base_url: str,
    spec,
) -> dict:
    """Test an API key by making a tiny completion call."""
    try:
        if provider_slug == "ollama":
            from graspmind.strategies.llm.ollama_strategy import OllamaStrategy
            strategy = OllamaStrategy()
        elif provider_slug == "anthropic":
            from graspmind.strategies.llm.openai_compat import AnthropicStrategy
            strategy = AnthropicStrategy()
        else:
            from graspmind.strategies.llm.openai_compat import OpenAICompatibleStrategy
            strategy = OpenAICompatibleStrategy()

        messages = [{"role": "user", "content": "Say 'hello' in one word."}]
        response_text = ""

        async for chunk in strategy.stream(
            messages,
            base_url=base_url,
            api_key=api_key,
            model=model,
            auth_header=spec.auth_header,
            auth_prefix=spec.auth_prefix,
            timeout=15.0,
        ):
            response_text += chunk
            if len(response_text) > 100:
                break  # Enough to confirm it works

        return {"success": True, "response": response_text[:100]}

    except Exception as e:
        safe_error = scrub_keys(str(e))
        logger.warning("Key test failed for %s: %s", provider_slug, safe_error)
        return {"success": False, "error": safe_error}


async def _write_audit(
    supabase,
    user_id: str,
    action: str,
    provider: str,
    request: Request | None = None,
    metadata: dict | None = None,
):
    """Write an entry to the audit log (best-effort)."""
    try:
        ip = ""
        ua = ""
        if request:
            ip = request.client.host if request.client else ""
            ua = request.headers.get("user-agent", "")[:200]

        await supabase.table("api_key_audit_log").insert({
            "user_id": user_id,
            "action": action,
            "provider": provider,
            "ip_address": ip,
            "user_agent": ua,
            "metadata": metadata or {},
        }).execute()
    except Exception as e:
        logger.warning("Failed to write audit log: %s", e)
