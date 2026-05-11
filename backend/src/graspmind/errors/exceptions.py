"""Custom exception classes for the application."""

from typing import Any


class GraspMindAIError(Exception):
    """Base exception for all application-level errors."""

    def __init__(self, message: str, status_code: int = 500, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class ProviderFallbackError(GraspMindAIError):
    """Raised when an LLM provider fails, triggering a fallback."""
    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message=message, status_code=502, details=details)


class ResourceNotFoundError(GraspMindAIError):
    """Raised when a requested resource is not found."""
    def __init__(self, message: str = "Resource not found", details: dict[str, Any] | None = None):
        super().__init__(message=message, status_code=404, details=details)


class AuthenticationError(GraspMindAIError):
    """Raised when authentication fails."""
    def __init__(self, message: str = "Authentication failed", details: dict[str, Any] | None = None):
        super().__init__(message=message, status_code=401, details=details)


class AuthorizationError(GraspMindAIError):
    """Raised when the user does not have permission for an action."""
    def __init__(self, message: str = "Permission denied", details: dict[str, Any] | None = None):
        super().__init__(message=message, status_code=403, details=details)


class RateLimitExceededError(GraspMindAIError):
    """Raised when a user exceeds their rate limit."""
    def __init__(self, message: str = "Rate limit exceeded", details: dict[str, Any] | None = None):
        super().__init__(message=message, status_code=429, details=details)
