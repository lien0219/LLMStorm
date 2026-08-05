"""Google Gemini native streaming protocol adapter."""

from __future__ import annotations

from typing import Any

from .base import ProviderAdapter, RequestContext, common_headers, replace_path, split_endpoint


class GeminiAdapter(ProviderAdapter):
    id = "gemini"

    def resolve_endpoint(self, raw_url: str, model: str) -> str:
        url, parsed, path, tail, is_base = split_endpoint(raw_url)
        lowered = path.lower()
        if lowered.endswith((":streamgeneratecontent", ":generatecontent")) or not is_base:
            return url
        prefix = "" if tail == "v1beta" else "/v1beta"
        return replace_path(parsed, f"{path}{prefix}/models/{model}:streamGenerateContent")

    def build_request(self, context: RequestContext) -> tuple[dict[str, str], dict[str, Any]]:
        headers = {**common_headers(context.user_agent), "x-goog-api-key": context.api_key}
        return headers, {
            "contents": [{"role": "user", "parts": [{"text": context.prompt}]}],
            "generationConfig": {"maxOutputTokens": context.max_tokens},
        }

    def extract_text(self, chunk: dict[str, Any]) -> str:
        candidates = chunk.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            return ""
        content = candidates[0].get("content", {}) if isinstance(candidates[0], dict) else {}
        parts = content.get("parts", []) if isinstance(content, dict) else []
        return "".join(
            part.get("text", "")
            for part in parts
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        )
