"""Supabase client factories.

Separated from deps.py to prevent circular imports with security/auth.py.
"""

from supabase import AsyncClient, acreate_client
from graspmind.config import Settings

_supabase_service_client: AsyncClient | None = None

async def get_service_client(settings: Settings) -> AsyncClient:
    """Lazy singleton Supabase client using the service key (bypasses RLS)."""
    global _supabase_service_client  # noqa: PLW0603
    if _supabase_service_client is None:
        _supabase_service_client = await acreate_client(
            settings.supabase_url,
            settings.supabase_service_key,
        )
    return _supabase_service_client

async def create_user_client(settings: Settings, access_token: str) -> AsyncClient:
    """Create a Supabase client scoped to a user's JWT (enforces RLS)."""
    client = await acreate_client(settings.supabase_url, settings.supabase_anon_key)
    await client.auth.set_session(access_token=access_token, refresh_token=access_token)
    return client
