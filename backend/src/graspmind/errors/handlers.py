"""FastAPI exception handlers."""

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .exceptions import GraspMindAIError

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Register custom exception handlers with the FastAPI app.

    Handler registration order matters: FastAPI matches the first applicable
    handler. More specific handlers (GraspMindAIError, HTTPException) are registered
    before the generic Exception catch-all so they are not swallowed.
    """

    @app.exception_handler(GraspMindAIError)
    async def grasp_error_handler(request: Request, exc: GraspMindAIError) -> JSONResponse:
        """Handle custom application errors."""
        logger.warning(
            "Application error: %s (status: %s)", exc.message, exc.status_code
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "message": exc.message,
                    "details": exc.details,
                    "type": exc.__class__.__name__,
                }
            },
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request, exc: HTTPException
    ) -> JSONResponse:
        """Pass FastAPI's HTTPException through with the correct status code.

        Without this handler, the generic Exception handler below would catch
        HTTPExceptions (like 401s and 404s) and convert them all into 500s.
        """
        logger.debug("HTTP %s at %s: %s", exc.status_code, request.url.path, exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
                    "details": {},
                    "type": "HTTPException",
                }
            },
            headers=dict(exc.headers) if exc.headers else {},
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Handle unexpected global exceptions.

        This is the last-resort handler. It intentionally returns a generic
        message to avoid leaking internal details to the client.
        """
        logger.exception("Unexpected unhandled exception at %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "message": "An unexpected internal server error occurred.",
                    "details": {},
                    "type": "InternalServerError",
                }
            },
        )
