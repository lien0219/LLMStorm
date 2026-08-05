"""Anthropic Messages protocol adapter."""

from __future__ import annotations

from typing import Any

from .base import ProviderAdapter, RequestContext, common_headers, replace_path, split_endpoint


class AnthropicAdapter(ProviderAdapter):
    id = "anthropic"

    def resolve_endpoint(self, raw_url: str, model: str) -> str:
        del model
        url, parsed, path, tail, is_base = split_endpoint(raw_url)
        if path.lower().endswith("/messages") or not is_base:
            return url
        suffix = "/messages" if tail.startswith("v") and tail[1:].isdigit() else "/v1/messages"
        return replace_path(parsed, f"{path}{suffix}")

    def build_request(self, context: RequestContext) -> tuple[dict[str, str], dict[str, Any]]:
        headers = {
            **common_headers(context.user_agent),
            "x-api-key": context.api_key,
            "anthropic-version": "2023-06-01",
        }
        if context.api_key:
            headers["Authorization"] = f"Bearer {context.api_key}"
        return headers, {
            "model": context.model,
            "messages": [{"role": "user", "content": context.prompt}],
            "max_tokens": context.max_tokens,
            "stream": True,
        }

    def extract_text(self, chunk: dict[str, Any]) -> str:
        delta = chunk.get("delta")
        if isinstance(delta, dict) and isinstance(delta.get("text"), str):
            return delta["text"]
        content = chunk.get("content_block")
        if isinstance(content, dict) and isinstance(content.get("text"), str):
            return content["text"]
        blocks = chunk.get("content")
        if isinstance(blocks, list):
            return "".join(
                block.get("text", "")
                for block in blocks
                if isinstance(block, dict) and isinstance(block.get("text"), str)
            )
        return ""
