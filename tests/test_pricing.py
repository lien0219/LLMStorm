from __future__ import annotations

import time
import unittest

from aiohttp import web
from aiohttp.test_utils import TestServer

from llmstorm.pricing import PricingService


class PricingTests(unittest.IsolatedAsyncioTestCase):
    def service_with(self, catalog: dict[str, object]) -> PricingService:
        service = PricingService(ttl_seconds=3600)
        service._catalog = catalog
        service._fetched_at = time.time()
        return service

    async def test_live_price_normalization_and_official_link(self) -> None:
        service = self.service_with(
            {
                "gpt-5.6": {
                    "litellm_provider": "openai",
                    "input_cost_per_token": 0.000005,
                    "output_cost_per_token": 0.00003,
                    "cache_read_input_token_cost": 0.0000005,
                    "cache_creation_input_token_cost": 0.00000625,
                    "input_cost_per_token_above_272k_tokens": 0.00001,
                    "output_cost_per_token_above_272k_tokens": 0.000045,
                }
            }
        )
        result = await service.lookup("openai", "gpt-5.6")
        self.assertEqual(result["status"], "live")
        self.assertEqual(result["cacheTtlSeconds"], 3600)
        self.assertEqual(result["prices"]["output"], 30)
        self.assertEqual(result["tiers"][0]["minTokens"], 272001)
        self.assertEqual(result["tiers"][0]["prices"]["output"], 45)
        self.assertTrue(result["officialUrl"].endswith("/gpt-5.6"))

    async def test_conflicting_online_value_falls_back_to_verified_snapshot(self) -> None:
        service = self.service_with(
            {
                "gpt-5.6-terra": {
                    "litellm_provider": "openai",
                    "input_cost_per_token": 0.000002,
                    "output_cost_per_token": 0.000012,
                }
            }
        )
        result = await service.lookup("openai", "gpt-5.6-terra")
        self.assertEqual(result["status"], "snapshot")
        self.assertEqual(result["prices"]["input"], 2.5)
        self.assertIn("differs", result["lastError"])

    async def test_unknown_model_is_explicitly_unavailable(self) -> None:
        service = self.service_with({})
        result = await service.lookup("openai", "unknown-model")
        self.assertFalse(result["found"])
        self.assertEqual(result["status"], "unavailable")

    async def test_refreshes_remote_catalog_and_reuses_fresh_cache(self) -> None:
        requests = 0

        async def catalog(_: web.Request) -> web.Response:
            nonlocal requests
            requests += 1
            return web.json_response(
                {
                    "deepseek/custom-model": {
                        "litellm_provider": "deepseek",
                        "input_cost_per_token": 0.000001,
                        "output_cost_per_token": 0.000004,
                    }
                }
            )

        app = web.Application()
        app.router.add_get("/prices.json", catalog)
        server = TestServer(app)
        await server.start_server()
        self.addAsyncCleanup(server.close)

        service = PricingService(catalog_url=str(server.make_url("/prices.json")))
        first = await service.lookup("deepseek", "custom-model")
        second = await service.lookup("deepseek", "custom-model")

        self.assertEqual(first["status"], "live")
        self.assertEqual(first["prices"]["input"], 1)
        self.assertEqual(first["prices"]["output"], 4)
        self.assertEqual(second["status"], "live")
        self.assertEqual(requests, 1)


if __name__ == "__main__":
    unittest.main()
