"""Live model-price lookup with a small offline fallback catalog.

Vendors do not expose one common pricing API.  LLMStorm therefore refreshes a
machine-readable public pricing index and always links the user to the vendor's
official pricing page.  The response explicitly reports whether it came from
the online index, an in-memory cache, or the bundled last-known snapshot.
"""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import aiohttp

DEFAULT_CATALOG_URL = (
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
)
SNAPSHOT_VERIFIED_AT = "2026-08-05"

OFFICIAL_PRICING_URLS = {
    "openai": "https://developers.openai.com/api/docs/models",
    "anthropic": "https://platform.claude.com/docs/en/about-claude/pricing",
    "gemini": "https://ai.google.dev/gemini-api/docs/pricing",
    "deepseek": "https://api-docs.deepseek.com/quick_start/pricing-details-usd",
    "qwen": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
    "zhipu": "https://docs.z.ai/guides/overview/pricing",
    "moonshot": "https://platform.moonshot.ai/docs/pricing/chat",
    "minimax": "https://platform.minimax.io/docs/guides/pricing-paygo",
    "xai": "https://docs.x.ai/docs/models",
    "mistral": "https://mistral.ai/pricing#api-pricing",
}

# Values are USD per million tokens and are deliberately small in scope.  They
# keep the calculator useful offline while the UI clearly labels them as a
# snapshot rather than a live refresh.
PRICE_SNAPSHOT: dict[tuple[str, str], dict[str, float | None]] = {
    ("openai", "gpt-5.6"): {"input": 5, "output": 30, "cacheRead": 0.5, "cacheWrite": 6.25},
    ("openai", "gpt-5.6-sol"): {"input": 5, "output": 30, "cacheRead": 0.5, "cacheWrite": 6.25},
    ("openai", "gpt-5.6-terra"): {
        "input": 2.5,
        "output": 15,
        "cacheRead": 0.25,
        "cacheWrite": 3.125,
    },
    ("openai", "gpt-5.6-luna"): {"input": 1, "output": 6, "cacheRead": 0.1, "cacheWrite": 1.25},
    ("openai", "gpt-5.5"): {"input": 5, "output": 30, "cacheRead": 0.5, "cacheWrite": None},
    ("openai", "gpt-5.4"): {"input": 2.5, "output": 15, "cacheRead": 0.25, "cacheWrite": None},
    ("openai", "gpt-5.4-mini"): {
        "input": 0.75,
        "output": 4.5,
        "cacheRead": 0.075,
        "cacheWrite": None,
    },
    ("openai", "gpt-5.4-nano"): {
        "input": 0.2,
        "output": 1.25,
        "cacheRead": 0.02,
        "cacheWrite": None,
    },
    ("openai", "gpt-4.1"): {"input": 2, "output": 8, "cacheRead": 0.5, "cacheWrite": None},
    ("openai", "gpt-4.1-mini"): {"input": 0.4, "output": 1.6, "cacheRead": 0.1, "cacheWrite": None},
    ("openai", "gpt-4o-mini"): {
        "input": 0.15,
        "output": 0.6,
        "cacheRead": 0.075,
        "cacheWrite": None,
    },
    ("anthropic", "claude-fable-5"): {
        "input": 10,
        "output": 50,
        "cacheRead": 1,
        "cacheWrite": 12.5,
    },
    ("anthropic", "claude-opus-5"): {
        "input": 5,
        "output": 25,
        "cacheRead": 0.5,
        "cacheWrite": 6.25,
    },
    ("anthropic", "claude-sonnet-5"): {
        "input": 2,
        "output": 10,
        "cacheRead": 0.2,
        "cacheWrite": 2.5,
    },
    ("anthropic", "claude-haiku-4-5-20251001"): {
        "input": 1,
        "output": 5,
        "cacheRead": 0.1,
        "cacheWrite": 1.25,
    },
    ("gemini", "gemini-3.6-flash"): {
        "input": 1.5,
        "output": 7.5,
        "cacheRead": 0.15,
        "cacheWrite": None,
    },
    ("gemini", "gemini-3.5-flash-lite"): {
        "input": 0.3,
        "output": 2.5,
        "cacheRead": 0.03,
        "cacheWrite": None,
    },
    ("gemini", "gemini-3.1-flash-lite"): {
        "input": 0.25,
        "output": 1.5,
        "cacheRead": 0.025,
        "cacheWrite": None,
    },
    ("gemini", "gemini-2.5-flash"): {
        "input": 0.3,
        "output": 2.5,
        "cacheRead": 0.03,
        "cacheWrite": None,
    },
    ("gemini", "gemini-2.5-flash-lite"): {
        "input": 0.1,
        "output": 0.4,
        "cacheRead": 0.01,
        "cacheWrite": None,
    },
}

PROVIDER_ALIASES = {
    "openai": {"openai"},
    "anthropic": {"anthropic"},
    "gemini": {"gemini", "google"},
    "deepseek": {"deepseek"},
    "qwen": {"dashscope", "qwen"},
    "zhipu": {"zai", "zhipu"},
    "moonshot": {"moonshot"},
    "minimax": {"minimax"},
    "xai": {"xai"},
    "mistral": {"mistral"},
    "openai_compatible": set(),
}


def _iso_timestamp(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, UTC).isoformat().replace("+00:00", "Z")


def _per_million(record: dict[str, Any], key: str) -> float | None:
    value = record.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
        return None
    return round(float(value) * 1_000_000, 8)


def _remote_prices(record: dict[str, Any]) -> dict[str, float | None] | None:
    prices = {
        "input": _per_million(record, "input_cost_per_token"),
        "output": _per_million(record, "output_cost_per_token"),
        "cacheRead": _per_million(record, "cache_read_input_token_cost"),
        "cacheWrite": _per_million(record, "cache_creation_input_token_cost"),
    }
    return prices if prices["input"] is not None or prices["output"] is not None else None


def _remote_tiers(record: dict[str, Any]) -> list[dict[str, Any]]:
    thresholds: set[int] = set()
    for key in record:
        match = re.fullmatch(r"input_cost_per_token_above_(\d+)k_tokens", key)
        if match:
            thresholds.add(int(match.group(1)) * 1000)
    tiers = []
    for threshold in sorted(thresholds):
        suffix = f"_above_{threshold // 1000}k_tokens"
        prices = {
            "input": _per_million(record, f"input_cost_per_token{suffix}"),
            "output": _per_million(record, f"output_cost_per_token{suffix}"),
            "cacheRead": _per_million(record, f"cache_read_input_token_cost{suffix}"),
            "cacheWrite": _per_million(
                record, f"cache_creation_input_token_cost{suffix}"
            ),
        }
        if prices["input"] is not None or prices["output"] is not None:
            tiers.append({"minTokens": threshold + 1, "prices": prices})
    return tiers


@dataclass(slots=True)
class PriceLookup:
    prices: dict[str, float | None]
    status: str
    fetched_at: float
    index_source: str | None


class PricingService:
    """Refresh and query a normalized token-price catalog."""

    def __init__(
        self,
        *,
        catalog_url: str = DEFAULT_CATALOG_URL,
        ttl_seconds: int = 6 * 60 * 60,
        timeout_seconds: float = 12,
    ) -> None:
        self.catalog_url = catalog_url
        self.ttl_seconds = max(60, ttl_seconds)
        self.timeout_seconds = max(1.0, timeout_seconds)
        self._catalog: dict[str, Any] | None = None
        self._fetched_at = 0.0
        self._last_attempt = 0.0
        self._last_error: str | None = None
        self._lock = asyncio.Lock()

    async def _refresh(self) -> None:
        now = time.time()
        if self._catalog is not None and now - self._fetched_at < self.ttl_seconds:
            return
        # Avoid repeatedly holding up requests when the network is unavailable.
        if self._last_error and now - self._last_attempt < 60:
            return
        async with self._lock:
            now = time.time()
            if self._catalog is not None and now - self._fetched_at < self.ttl_seconds:
                return
            self._last_attempt = now
            timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
            try:
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(
                        self.catalog_url,
                        headers={"User-Agent": "LLMStorm pricing refresh"},
                    ) as response:
                        response.raise_for_status()
                        payload = await response.json(content_type=None)
                if not isinstance(payload, dict):
                    raise ValueError("pricing index is not a JSON object")
                self._catalog = payload
                self._fetched_at = time.time()
                self._last_error = None
            except (aiohttp.ClientError, TimeoutError, ValueError, TypeError) as exc:
                self._last_error = f"{type(exc).__name__}: {exc}"

    def _candidate_keys(self, provider: str, model: str) -> list[str]:
        prefixes = {
            "anthropic": ["", "anthropic/"],
            "gemini": ["gemini/", ""],
            "deepseek": ["deepseek/", ""],
            "qwen": ["dashscope/", "qwen/", ""],
            "zhipu": ["zai/", "zhipu/", ""],
            "moonshot": ["moonshot/", ""],
            "minimax": ["minimax/", ""],
            "xai": ["xai/", ""],
            "mistral": ["mistral/", ""],
        }.get(provider, [""])
        return list(dict.fromkeys(f"{prefix}{model}" for prefix in prefixes))

    def _find_remote(self, provider: str, model: str) -> dict[str, Any] | None:
        if not self._catalog:
            return None
        allowed = PROVIDER_ALIASES.get(provider, set())
        if not allowed:
            return None
        for key in self._candidate_keys(provider, model):
            record = self._catalog.get(key)
            if not isinstance(record, dict):
                continue
            record_provider = str(record.get("litellm_provider", "")).lower()
            if record_provider in allowed:
                return record
        return None

    async def lookup(self, provider: str, model: str) -> dict[str, Any]:
        provider = provider.strip().lower()
        model = model.strip()
        await self._refresh()

        record = self._find_remote(provider, model)
        prices = _remote_prices(record) if record else None
        tiers = _remote_tiers(record) if record else []
        snapshot = PRICE_SNAPSHOT.get((provider, model))
        if prices is not None and snapshot is not None:
            online_prices = prices
            comparable_keys = ("input", "output", "cacheRead", "cacheWrite")

            def differs(key: str) -> bool:
                online_value = online_prices.get(key)
                snapshot_value = snapshot.get(key)
                return (
                    online_value is not None
                    and snapshot_value is not None
                    and abs(online_value - snapshot_value) > 1e-8
                )

            conflicts = any(differs(key) for key in comparable_keys)
            if conflicts:
                prices = None
                self._last_error = "online index differs from the last verified official snapshot"
        official_url = OFFICIAL_PRICING_URLS.get(provider)
        if provider == "openai" and model:
            official_url = f"https://developers.openai.com/api/docs/models/{model}"

        if prices is not None:
            lookup = PriceLookup(prices, "live", self._fetched_at, self.catalog_url)
        elif snapshot is not None:
            lookup = PriceLookup(snapshot, "snapshot", 0, None)
        else:
            return {
                "found": False,
                "provider": provider,
                "model": model,
                "currency": "USD",
                "unit": "MTok",
                "status": "unavailable",
                "cacheTtlSeconds": self.ttl_seconds,
                "officialUrl": official_url,
                "lastError": self._last_error,
            }

        return {
            "found": True,
            "provider": provider,
            "model": model,
            "currency": "USD",
            "unit": "MTok",
            "prices": lookup.prices,
            "tiers": tiers if lookup.status == "live" else [],
            "status": lookup.status,
            "cacheTtlSeconds": self.ttl_seconds,
            "fetchedAt": _iso_timestamp(lookup.fetched_at) if lookup.fetched_at else None,
            "verifiedAt": SNAPSHOT_VERIFIED_AT if lookup.status == "snapshot" else None,
            "officialUrl": official_url,
            "indexUrl": lookup.index_source,
            "lastError": self._last_error if lookup.status != "live" else None,
        }
