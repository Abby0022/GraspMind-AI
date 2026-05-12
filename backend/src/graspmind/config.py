"""Application configuration via Pydantic Settings.

All environment variables are validated at startup. Missing required
values will raise a clear error before the server starts.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration — loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────
    app_name: str = "GraspMind AI"
    debug: bool = False
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"  # Comma-separated

    # ── LLM ──────────────────────────────────────────────────
    groq_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    llm_provider: str = "groq"  # groq | ollama | openrouter
    llm_model: str = "llama-3.3-70b-versatile"
    llm_timeout: float = 60.0
    llm_timeout_ollama: float = 120.0

    # ── Embeddings (Google Gemini) ───────────────────────────
    google_api_key: str = ""
    embedding_provider: str = "google"  # google | vertex_ai
    embedding_model: str = "gemini-embedding-2"
    embedding_dimensions: int = 3072

    # ── Qdrant ───────────────────────────────────────────────
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # ── Supabase ─────────────────────────────────────────────
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""  # BACKEND ONLY

    # ── Redis ────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"

    # ── Security ─────────────────────────────────────────────
    jwt_secret: str = ""
    rate_limit_chat: int = 60  # requests per minute
    rate_limit_upload: int = 10  # requests per minute
    vault_master_key: str = ""  # 64-char hex (32 bytes) for AES-256-GCM key encryption

    # ── Teacher Portal ───────────────────────────────────────
    # Set TEACHER_INVITE_CODE in .env to enable teacher account creation.
    # Leave empty to disable teacher signup entirely.
    teacher_invite_code: str = ""

    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated ALLOWED_ORIGINS into a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — parsed once at startup."""
    return Settings()
