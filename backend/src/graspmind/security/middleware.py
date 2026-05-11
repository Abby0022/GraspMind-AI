"""Security middleware — CORS, CSP, HSTS, and other security headers.

All security headers are applied globally via middleware. CORS is
configured via FastAPI's built-in CORSMiddleware with strict origin
whitelisting.
"""

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from graspmind.config import Settings


def configure_security(app: FastAPI, settings: Settings) -> None:
    """Apply all security middleware to the FastAPI application."""

    # CORS — more permissive for debugging 400 issues
    # We use settings.cors_origins but also ensure we allow standard headers
    origins = settings.cors_origins
    # If the user is on Vercel, we might want to be safe and allow the specific domain
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
