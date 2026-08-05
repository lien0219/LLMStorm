"""OpenAI Chat Completions compatible protocol adapter."""

from __future__ import annotations

from typing import Any

from .base import ProviderAdapter, RequestContext, common_headers, replace_path, split_endpoint


class OpenAICompatibleAdapter(ProviderAdapter):
    id = "openai_compatible"

    def resolve_endpoint(self, raw_url: str, model: str) -> str:
        del model
        url, parsed, path, tail, is_base = split_endpoint(raw_url)
        if path.lower().endswith("/chat/completions") or not is_base:
            return url
        suffix = (
            "/chat/completions"
            if tail.startswith("v") and tail[1:].isdigit()
            else "/v1/chat/completions"
        )
        return replace_path(parsed, f"{path}{suffix}")

    def build_request(self, context: RequestContext) -> tuple[dict[str, str], dict[str, Any]]:
        headers = common_headers(context.user_agent)
        if context.api_key:
            headers["Authorization"] = f"Bearer {context.api_key}"
        token_field = (
            "max_completion_tokens"
            if context.model.lower().startswith(("gpt-5", "o1", "o3", "o4"))
            else "max_tokens"
        )
        return headers, {
            "model": context.model,
            "messages": [{"role": "user", "content": context.prompt}],
            token_field: context.max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }

    def extract_text(self, chunk: dict[str, Any]) -> str:
        choices = chunk.get("choices")
        if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
            return ""
        choice = choices[0]
        delta = choice.get("delta")
        if isinstance(delta, dict):
            for key in ("content", "reasoning_content", "reasoning"):
                value = delta.get(key)
                if isinstance(value, str):
                    return value
        value = choice.get("text")
        if isinstance(value, str):
            return value
        result = choice.get("message")
        if isinstance(result, dict) and isinstance(result.get("content"), str):
            return result["content"]
        return ""

    def extract_usage(self, chunk: dict[str, Any]) -> dict[str, int]:
        usage = chunk.get("usage")
        if not isinstance(usage, dict):
            return {}
        details = usage.get("prompt_tokens_details")
        details = details if isinstance(details, dict) else {}
        return {
            "input": int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0),
            "output": int(usage.get("completion_tokens") or usage.get("output_tokens") or 0),
            "cacheRead": int(details.get("cached_tokens") or 0),
            "cacheWrite": int(details.get("cache_write_tokens") or 0),
        }
