"""Centralized error handling for the GraspMindAI application."""

from .exceptions import (
    AuthenticationError,
    AuthorizationError,
    GraspMindAIError,
    ProviderFallbackError,
    RateLimitExceededError,
    ResourceNotFoundError,
)
from .handlers import register_exception_handlers

__all__ = [
    "GraspMindAIError",
    "ProviderFallbackError",
    "ResourceNotFoundError",
    "AuthenticationError",
    "AuthorizationError",
    "RateLimitExceededError",
    "register_exception_handlers",
]
