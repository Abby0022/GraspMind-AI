"""Security middleware — CORS, CSP, HSTS, and other security headers.

All security headers are applied globally via middleware. CORS is
configured via FastAPI's built-in CORSMiddleware with strict origin
whitelisting.
"""

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from graspmind.config import Settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject security headers into every response.

    Headers applied:
    - Content-Security-Policy (CSP)
    - Strict-Transport-Security (HSTS)
    - X-Content-Type-Options
    - X-Frame-Options
    - X-XSS-Protection
    - Referrer-Policy
    - Permissions-Policy
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Preflight requests (OPTIONS) should be handled primarily by CORSMiddleware.
        # Custom security headers are often not required for preflights and can
        # sometimes cause 400/CORS issues if applied incorrectly.
        if request.method == "OPTIONS":
            return await call_next(request)

        response: Response = await call_next(request)

        # Content Security Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' blob: data:; "
            "font-src 'self'; "
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com; "
            "frame-ancestors 'none';"
        )

        # HTTP Strict Transport Security — 2 years, include subdomains
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Legacy XSS protection (for older browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Control referer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Restrict browser features
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        return response


def configure_security(app: FastAPI, settings: Settings) -> None:
    """Apply all security middleware to the FastAPI application."""

    # 1. Apply custom security headers first (innermost middleware)
    app.add_middleware(SecurityHeadersMiddleware)

    # 2. Apply CORS last (outermost middleware)
    # This ensures CORSMiddleware can handle OPTIONS requests immediately
    # before they hit any other logic or custom middleware.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],  # Allow all standard methods
        allow_headers=["*"],  # Allow all headers to prevent 400 on custom headers
        max_age=600,  # Cache preflight for 10 minutes
    )
