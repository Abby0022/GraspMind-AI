"""GraspMindAI — FastAPI Application Entry Point.

This is the main application factory. It configures security
middleware, registers route modules, and exposes health endpoints.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

from graspmind import __version__
from graspmind.api.routes import (
    analytics,
    assignments,
    auth,
    chat,
    classes,
    flashcards,
    history,
    knowledge,
    notebooks,
    providers,
    quizzes,
    sessions,
    sources,
)
from graspmind.api.websockets import chat as ws_chat
from graspmind.config import get_settings
from graspmind.errors import register_exception_handlers
from graspmind.models.schemas import HealthResponse
from graspmind.security.middleware import configure_security


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown events."""
    settings = get_settings()
    # Startup: validate critical config
    missing = []
    if not settings.supabase_url:
        missing.append("SUPABASE_URL")
    if not settings.supabase_anon_key:
        missing.append("SUPABASE_ANON_KEY")
    if not settings.jwt_secret:
        missing.append("JWT_SECRET")
    if missing:
        import logging
        logging.warning("Missing env vars (some features may not work): %s", ", ".join(missing))

    yield

    # Shutdown: cleanup connections
    from graspmind.security.rate_limiter import _redis_client
    if _redis_client:
        await _redis_client.aclose()


def create_app() -> FastAPI:
    """Application factory — creates and configures the FastAPI app."""
    settings = get_settings()

    app = FastAPI(
        title="GraspMindAI API",
        description="AI-Powered Study Platform Backend",
        version=__version__,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        lifespan=lifespan,
    )

    # ── Security middleware (CORS, CSP, HSTS) ────────────────
    configure_security(app, settings)

    # ── Exception handlers ───────────────────────────────────
    register_exception_handlers(app)

    # ── Route registration ───────────────────────────────────
    api_prefix = "/api/v1"
    app.include_router(auth.router, prefix=api_prefix)
    app.include_router(notebooks.router, prefix=api_prefix)
    app.include_router(sources.router, prefix=api_prefix)
    app.include_router(chat.router, prefix=api_prefix)
    app.include_router(quizzes.router, prefix=api_prefix)
    app.include_router(sessions.router, prefix=api_prefix)
    app.include_router(history.router, prefix=api_prefix)
    app.include_router(knowledge.router, prefix=api_prefix)
    app.include_router(flashcards.router, prefix=api_prefix)
    app.include_router(providers.router, prefix=api_prefix)
    # ── Teacher Portal ───────────────────────────────────────
    app.include_router(classes.router, prefix=api_prefix)
    app.include_router(assignments.router, prefix=api_prefix)
    app.include_router(analytics.router, prefix=api_prefix)

    # ── WebSocket routes (no prefix — direct path) ───────────
    app.include_router(ws_chat.router)

    # ── Health check (no auth required) ──────────────────────
    @app.get("/health", response_model=HealthResponse, tags=["System"])
    async def health_check():
        return HealthResponse(status="ok", version=__version__)

    @app.get("/", tags=["System"], include_in_schema=False)
    async def root():
        return {"status": "ok", "message": "GraspMindAI API is running", "version": __version__}

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        from fastapi import Response
        return Response(content=b"", media_type="image/x-icon")

    return app


# Default app instance for uvicorn
app = create_app()
