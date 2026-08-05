"""Provider adapter registry.

Adding a provider requires registering its public provider ID here and adding
its UI/catalog metadata. The load engine itself remains unchanged.
"""

from __future__ import annotations

from .anthropic import AnthropicAdapter
from .base import ProviderAdapter, RequestContext
from .gemini import GeminiAdapter
from .openai_compatible import OpenAICompatibleAdapter

_OPENAI_COMPATIBLE_IDS = (
    "openai",
    "deepseek",
    "qwen",
    "zhipu",
    "moonshot",
    "minimax",
    "xai",
    "mistral",
    "openai_compatible",
)

_ADAPTERS: dict[str, ProviderAdapter] = {
    "anthropic": AnthropicAdapter(),
    "gemini": GeminiAdapter(),
}
_openai_adapter = OpenAICompatibleAdapter()
_ADAPTERS.update({provider_id: _openai_adapter for provider_id in _OPENAI_COMPATIBLE_IDS})

SUPPORTED_PROVIDERS = frozenset(_ADAPTERS)


def get_adapter(provider: str) -> ProviderAdapter:
    try:
        return _ADAPTERS[provider]
    except KeyError as exc:
        raise ValueError(f"Unsupported provider adapter: {provider}") from exc


__all__ = ["RequestContext", "SUPPORTED_PROVIDERS", "get_adapter"]
