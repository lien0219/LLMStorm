from __future__ import annotations

import copy
import unittest

from llmstorm.catalog import catalog_provider_ids, load_catalog, validate_catalog
from llmstorm.providers import SUPPORTED_PROVIDERS, get_adapter
from load_test_engine import (
    TestConfig,
    build_final_summary,
    concurrency_levels,
    extract_stream_text,
    extract_stream_usage,
    request_spec,
    resolve_endpoint,
    validate_config,
)


class EngineTests(unittest.TestCase):
    def test_catalog_and_adapter_registry_stay_in_sync(self) -> None:
        self.assertEqual(catalog_provider_ids(), SUPPORTED_PROVIDERS)
        self.assertEqual(load_catalog()["schemaVersion"], 1)
        self.assertEqual(get_adapter("deepseek").id, "openai_compatible")

        duplicate = copy.deepcopy(load_catalog())
        duplicate["providers"].append(copy.deepcopy(duplicate["providers"][0]))
        with self.assertRaisesRegex(RuntimeError, "Duplicate catalog provider"):
            validate_catalog(duplicate)

    def test_concurrency_ramp_is_sorted_and_includes_maximum(self) -> None:
        self.assertEqual(concurrency_levels(20), [1, 5, 10, 15, 20])
        self.assertEqual(concurrency_levels(4), [1, 2, 3, 4])
        self.assertEqual(concurrency_levels(1), [1])
        self.assertEqual(concurrency_levels(10, (0.5,)), [1, 5, 10])

    def test_endpoint_resolution(self) -> None:
        self.assertEqual(
            resolve_endpoint("https://relay.test/v1", "openai", "gpt-5.6"),
            "https://relay.test/v1/chat/completions",
        )
        self.assertEqual(
            resolve_endpoint("https://relay.test/v1", "anthropic", "claude-sonnet-5"),
            "https://relay.test/v1/messages",
        )
        self.assertEqual(
            resolve_endpoint("https://relay.test/v1beta", "gemini", "gemini-3.6-flash"),
            "https://relay.test/v1beta/models/gemini-3.6-flash:streamGenerateContent",
        )
        self.assertEqual(
            resolve_endpoint("https://relay.test/custom/inference", "openai", "gpt-5.6"),
            "https://relay.test/custom/inference",
        )

    def test_provider_request_adapters(self) -> None:
        openai_headers, openai_payload = request_spec(
            TestConfig(
                "https://relay.test/v1",
                "openai",
                "secret",
                "gpt-5.6",
                1,
            ),
            7,
        )
        self.assertEqual(openai_headers["Authorization"], "Bearer secret")
        self.assertEqual(openai_payload["max_completion_tokens"], 64)
        self.assertTrue(openai_payload["stream"])

        anthropic_headers, anthropic_payload = request_spec(
            TestConfig(
                "https://relay.test/v1",
                "anthropic",
                "secret",
                "claude-sonnet-5",
                1,
            ),
            7,
        )
        self.assertEqual(anthropic_headers["anthropic-version"], "2023-06-01")
        self.assertEqual(anthropic_payload["max_tokens"], 64)

        gemini_headers, gemini_payload = request_spec(
            TestConfig(
                "https://relay.test/v1beta",
                "gemini",
                "secret",
                "gemini-3.6-flash",
                1,
            ),
            7,
        )
        self.assertEqual(gemini_headers["x-goog-api-key"], "secret")
        self.assertEqual(gemini_payload["generationConfig"]["maxOutputTokens"], 64)

    def test_localized_validation_and_public_target_guard(self) -> None:
        with self.assertRaisesRegex(ValueError, "between 1 and 10"):
            validate_config(
                TestConfig(
                    "https://relay.test/v1",
                    "openai",
                    "",
                    "gpt-5.6",
                    11,
                    locale="en",
                    max_concurrency_limit=10,
                )
            )
        with self.assertRaisesRegex(ValueError, "Public mode blocks"):
            validate_config(
                TestConfig(
                    "https://127.0.0.1:8000/v1",
                    "openai",
                    "",
                    "gpt-5.6",
                    1,
                    locale="en",
                    allow_private_targets=False,
                )
            )
        with self.assertRaisesRegex(ValueError, "only allows HTTPS"):
            validate_config(
                TestConfig(
                    "http://relay.test/v1",
                    "openai",
                    "",
                    "gpt-5.6",
                    1,
                    locale="en",
                    allow_private_targets=False,
                )
            )

    def test_protocol_text_extractors(self) -> None:
        self.assertEqual(
            extract_stream_text("openai", {"choices": [{"delta": {"content": "ok"}}]}),
            "ok",
        )

    def test_protocol_usage_extractors(self) -> None:
        self.assertEqual(
            extract_stream_usage(
                "openai",
                {
                    "usage": {
                        "prompt_tokens": 20,
                        "completion_tokens": 5,
                        "prompt_tokens_details": {"cached_tokens": 8},
                    }
                },
            ),
            {"input": 20, "output": 5, "cacheRead": 8, "cacheWrite": 0},
        )
        self.assertEqual(
            extract_stream_usage(
                "anthropic",
                {
                    "usage": {
                        "input_tokens": 12,
                        "output_tokens": 3,
                        "cache_creation_input_tokens": 4,
                        "cache_read_input_tokens": 6,
                    }
                },
            ),
            {"input": 12, "output": 3, "cacheRead": 6, "cacheWrite": 4},
        )
        self.assertEqual(
            extract_stream_text("anthropic", {"delta": {"text": "ok"}}),
            "ok",
        )
        self.assertEqual(
            extract_stream_text(
                "gemini", {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}
            ),
            "ok",
        )

    def test_recommendation_threshold_is_configurable(self) -> None:
        config = TestConfig(
            "https://relay.test/v1",
            "openai",
            "",
            "gpt-5.6",
            10,
            locale="en",
            success_threshold=99,
        )
        stages = [
            {"concurrency": 5, "successRate": 100, "throughput": 2},
            {"concurrency": 10, "successRate": 98, "throughput": 3},
        ]
        summary = build_final_summary(config, config.url, stages, [], 1)
        self.assertEqual(summary["recommendedConcurrency"], 5)
        self.assertIn("99%", summary["recommendationBasis"])


if __name__ == "__main__":
    unittest.main()
