"""Provider adapter contracts and endpoint helpers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any
from urllib.parse import SplitResult, urlsplit, urlunsplit


@dataclass(frozen=True, slots=True)
class RequestContext:
    api_key: str
    model: str
    prompt: str
    max_tokens: int
    user_agent: str


class ProviderAdapter(ABC):
    """Translate one provider protocol without coupling it to the load engine."""

    id: str

    @abstractmethod
    def resolve_endpoint(self, raw_url: str, model: str) -> str:
        """Resolve a conventional base URL to the protocol request endpoint."""

    @abstractmethod
    def build_request(self, context: RequestContext) -> tuple[dict[str, str], dict[str, Any]]:
        """Build headers and a JSON body for one streaming request."""

    @abstractmethod
    def extract_text(self, chunk: dict[str, Any]) -> str:
        """Extract text from one decoded streaming or JSON response chunk."""


def split_endpoint(raw_url: str) -> tuple[str, SplitResult, str, str, bool]:
    """Normalize an endpoint and describe whether its path is a conventional base."""
    url = raw_url.strip().rstrip("/")
    parsed = urlsplit(url)
    path = parsed.path.rstrip("/")
    tail = path.rsplit("/", 1)[-1].lower() if path else ""
    is_version_segment = tail.startswith("v") and tail[1:].isdigit()
    is_base = not path or tail in {"v1", "v1beta", "api"} or is_version_segment
    return url, parsed, path, tail, is_base


def replace_path(parsed: SplitResult, path: str) -> str:
    return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, parsed.fragment))


def common_headers(user_agent: str) -> dict[str, str]:
    return {
        "Accept": "text/event-stream, application/json",
        "Content-Type": "application/json",
        "User-Agent": user_agent,
    }
