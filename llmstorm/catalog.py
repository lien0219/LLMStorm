"""Validated provider and model catalog shared by the API and browser."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .providers import SUPPORTED_PROVIDERS, get_adapter

CATALOG_PATH = Path(__file__).resolve().parents[1] / "static" / "model_catalog.json"


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, Any]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return validate_catalog(catalog)


def validate_catalog(catalog: dict[str, Any]) -> dict[str, Any]:
    """Validate catalog structure and adapter coverage before serving it."""
    providers = catalog.get("providers")
    if catalog.get("schemaVersion") != 1 or not isinstance(providers, list):
        raise RuntimeError("Unsupported or malformed model catalog")

    provider_ids: set[str] = set()
    for provider in providers:
        if not isinstance(provider, dict) or not isinstance(provider.get("id"), str):
            raise RuntimeError("Every catalog provider must have a string ID")
        provider_id = provider["id"]
        if provider_id in provider_ids:
            raise RuntimeError(f"Duplicate catalog provider ID: {provider_id}")
        provider_ids.add(provider_id)
        if not provider.get("label") or not isinstance(provider.get("placeholder"), str):
            raise RuntimeError(f"Catalog provider metadata is incomplete: {provider_id}")
        if provider_id not in SUPPORTED_PROVIDERS:
            raise RuntimeError(f"Catalog provider has no adapter: {provider_id}")
        if provider.get("adapter") != get_adapter(provider_id).id:
            raise RuntimeError(f"Catalog adapter mismatch for provider: {provider_id}")
        groups = provider.get("groups")
        if not isinstance(groups, list) or not groups:
            raise RuntimeError(f"Catalog provider has no model groups: {provider_id}")
        model_ids: set[str] = set()
        for group in groups:
            if not isinstance(group, dict) or not isinstance(group.get("labelKey"), str):
                raise RuntimeError(f"Malformed model group for provider: {provider_id}")
            models = group.get("models")
            if not isinstance(models, list) or not models:
                raise RuntimeError(f"Empty model group for provider: {provider_id}")
            for model in models:
                model_id: Any
                if isinstance(model, str):
                    model_id = model
                elif isinstance(model, dict):
                    model_id = model.get("id")
                else:
                    model_id = None
                if not isinstance(model_id, str) or not model_id:
                    raise RuntimeError(f"Malformed model entry for provider: {provider_id}")
                if model_id in model_ids:
                    raise RuntimeError(f"Duplicate model ID for provider {provider_id}: {model_id}")
                model_ids.add(model_id)

    if provider_ids != set(SUPPORTED_PROVIDERS):
        missing = sorted(set(SUPPORTED_PROVIDERS) - provider_ids)
        raise RuntimeError(f"Provider adapters missing from catalog: {', '.join(missing)}")
    return catalog


def catalog_provider_ids() -> frozenset[str]:
    return frozenset(provider["id"] for provider in load_catalog()["providers"])
