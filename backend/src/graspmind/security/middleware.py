import time
import logging
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from graspmind.config import Settings, get_settings
from graspmind.supabase_client import get_service_client

logger = logging.getLogger(__name__)

async def log_security_event(
    event_type: str,
    request: Request,
    status_code: int = 200,
    metadata: dict | None = None
) -> None:
    """Log a security event to the database for measurement and auditing."""
    try:
        settings = get_settings()
        client = await get_service_client(settings)
        user_id = getattr(request.state, "user_id", None)
        
        await client.table("audit_logs").insert({
            "user_id": user_id,
            "event_type": event_type,
            "action": f"{request.method} {request.url.path}",
            "status_code": status_code,
            "ip_address": request.client.host if request.client else "unknown",
            "metadata": metadata or {}
        }).execute()
    except Exception as exc:
        # We NEVER want security logging to break the main request flow
        # But we do want to know exactly what failed for institutional auditing.
        error_msg = str(exc)
        if "Could not find the 'action' column" in error_msg:
             logger.warning("Supabase Schema Cache mismatch detected. Please run: NOTIFY pgrst, 'reload schema'; in SQL Editor.")
        logger.error("Failed to log security event: %s", error_msg)

def configure_security(app: FastAPI, settings: Settings) -> None:
    """Apply all security middleware to the FastAPI application."""

    # CORS — strict origin whitelisting
    origins = settings.cors_origins
    if "https://graspmindai.vercel.app" not in origins:
        origins.append("https://graspmindai.vercel.app")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=600,
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        """Add modern security headers and perform CSRF validation."""
        start_time = time.perf_counter()
        
        # ── CSRF PROTECTION ───────────────────
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("Origin")
            referer = request.headers.get("Referer")
            
            if not settings.debug:
                is_valid = False
                if origin and origin in origins:
                    is_valid = True
                elif referer:
                    if any(referer.startswith(o) for o in origins):
                        is_valid = True
                
                if not is_valid:
                    await log_security_event(
                        "csrf_failure", 
                        request, 
                        status_code=403, 
                        metadata={"origin": origin, "referer": referer}
                    )
                    return Response(
                        content="CSRF validation failed: Unauthorized origin.",
                        status_code=403
                    )

        # Execute request
        try:
            response: Response = await call_next(request)
        except Exception as exc:
            # Measure and log internal security-relevant crashes
            await log_security_event("internal_error", request, status_code=500, metadata={"error": str(exc)})
            raise

        # ── MEASUREMENT: Log security-relevant status codes ──────────────
        if response.status_code in (401, 403, 429):
            event_map = {401: "auth_failure", 403: "forbidden", 429: "rate_limit_hit"}
            await log_security_event(event_map[response.status_code], request, status_code=response.status_code)

        # Performance measurement of security overhead
        process_time = time.perf_counter() - start_time
        response.headers["X-Security-Process-Time"] = f"{process_time:.4f}s"

        # 1. HSTS
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # 2. CSP
        csp_policies = [
            "default-src 'self'",
            "connect-src 'self' https://*.supabase.co https://*.qdrant.io https://api.groq.com https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com",
            "img-src 'self' data: https://*.supabase.co",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "frame-ancestors 'none'",
        ]
        response.headers["Content-Security-Policy"] = "; ".join(csp_policies)

        # 3. Anti-Clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # 4. MIME-Sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # 5. Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        return response

