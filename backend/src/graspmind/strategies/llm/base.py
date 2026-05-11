"""Base class for LLM strategies."""

from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator


class LLMStrategy(ABC):
    """Abstract base class representing an LLM Provider strategy.

    All strategies accept per-request credentials instead of global
    settings, enabling the BYOK (Bring Your Own Key) model.
    """

    @abstractmethod
    async def stream(
        self,
        messages: list[dict],
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 60.0,
        **kwargs,
    ) -> AsyncGenerator[str]:
        """Stream a chat completion from the underlying LLM provider.

        Args:
            messages: The list of chat messages.
            base_url: The provider's API base URL.
            api_key: The decrypted API key for authentication.
            model: The model identifier to use.
            timeout: Request timeout in seconds.

        Yields:
            String chunks from the LLM response.

        Raises:
            ProviderFallbackError: If the provider fails.
        """
        pass
