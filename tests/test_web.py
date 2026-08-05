from __future__ import annotations

import asyncio
import json
import unittest

from aiohttp import ClientSession, web
from aiohttp.test_utils import TestServer

from llmstorm import __version__
from web_app import create_app


async def mock_upstream(request: web.Request) -> web.StreamResponse:
    payload = await request.json()
    assert payload["model"] == "gpt-5.6"
    response = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
    await response.prepare(request)
    await response.write(b'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n')
    await response.write(
        b'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,'
        b'"prompt_tokens_details":{"cached_tokens":3}}}\n\n'
    )
    await response.write(b"data: [DONE]\n\n")
    await response.write_eof()
    return response


async def mock_probe(_: web.Request) -> web.Response:
    return web.Response(
        status=204,
        headers={
            "X-Upstream-URL": "https://api.openai.com/v1/chat/completions",
            "X-OpenAI-Request-ID": "req_probe_test",
            "Via": "1.1 relay.test",
        },
    )


class WebTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        upstream_app = web.Application()
        upstream_app.router.add_post("/v1/chat/completions", mock_upstream)
        upstream_app.router.add_head("/v1/chat/completions", mock_probe)
        self.slow_started = asyncio.Event()
        self.slow_release = asyncio.Event()

        async def slow_upstream(request: web.Request) -> web.StreamResponse:
            await request.json()
            self.slow_started.set()
            await self.slow_release.wait()
            response = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
            await response.prepare(request)
            await response.write(b'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n')
            await response.write_eof()
            return response

        upstream_app.router.add_post("/slow/chat/completions", slow_upstream)
        self.upstream = TestServer(upstream_app)
        self.server = TestServer(
            create_app(
                public_mode=False,
                max_concurrency=50,
                max_active_tests=1,
            )
        )
        await self.upstream.start_server()
        await self.server.start_server()
        self.session = ClientSession()

    async def asyncTearDown(self) -> None:
        await self.session.close()
        await self.server.close()
        await self.upstream.close()

    def payload(self) -> dict[str, object]:
        return {
            "url": str(self.upstream.make_url("/v1")),
            "provider": "openai",
            "apiKey": "test-key",
            "model": "gpt-5.6",
            "maxConcurrency": 4,
            "timeout": 5,
            "maxTokens": 8,
            "locale": "en",
        }

    async def test_health_config_and_security_headers(self) -> None:
        health = await self.session.get(self.server.make_url("/api/health"))
        config = await self.session.get(self.server.make_url("/api/config"))
        catalog = await self.session.get(self.server.make_url("/api/catalog"))
        self.assertEqual(health.status, 200)
        self.assertEqual((await health.json())["version"], __version__)
        self.assertEqual((await config.json())["maxConcurrency"], 50)
        config_body = await config.json()
        self.assertEqual(config_body["successThreshold"], 95)
        self.assertEqual(config_body["quickConcurrencyMax"], 50)
        self.assertGreater(len((await catalog.json())["providers"]), 5)
        self.assertEqual(health.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(health.headers["Cache-Control"], "no-store")
        self.assertIn("frame-ancestors 'none'", health.headers["Content-Security-Policy"])

    async def test_navigation_pages_are_served(self) -> None:
        sites = await self.session.get(self.server.make_url("/sites"))
        ai_services = await self.session.get(self.server.make_url("/ai-services"))
        support = await self.session.get(self.server.make_url("/support"))
        self.assertEqual(sites.status, 200)
        self.assertEqual(ai_services.status, 200)
        self.assertEqual(support.status, 200)
        self.assertIn("站点推荐", await sites.text())
        self.assertIn("AI 服务", await ai_services.text())
        support_body = await support.text()
        self.assertIn("支持与联系", support_body)
        self.assertIn("1824851183@qq.com", support_body)

    async def test_site_quality_and_exposed_upstream_analysis(self) -> None:
        response = await self.session.post(
            self.server.make_url("/api/site-analysis"),
            json={
                "url": str(self.upstream.make_url("/v1")),
                "provider": "openai",
                "model": "gpt-5.6",
                "locale": "en",
            },
        )
        result = await response.json()
        self.assertEqual(response.status, 200)
        self.assertTrue(result["quality"]["reachable"])
        self.assertEqual(result["quality"]["httpStatus"], 204)
        self.assertEqual(result["quality"]["ipDetails"][0]["scope"], "loopback")
        self.assertIsNone(result["quality"]["ipDetails"][0]["source"])
        self.assertEqual(result["route"]["suspectedProvider"], "OpenAI")
        self.assertEqual(
            result["route"]["exposedUpstreamUrl"],
            "https://api.openai.com/v1/chat/completions",
        )
        self.assertEqual(result["route"]["proxySignals"], 1)

    async def test_streaming_end_to_end_and_english_validation(self) -> None:
        response = await self.session.post(
            self.server.make_url("/api/test"),
            json=self.payload(),
        )
        body = await response.text()
        block = next(part for part in body.split("\n\n") if part.startswith("event: complete"))
        result = json.loads(
            next(line[5:].strip() for line in block.splitlines() if line.startswith("data:"))
        )
        self.assertEqual(response.status, 200)
        self.assertEqual(result["requests"], 10)
        self.assertEqual(result["success"], 10)
        self.assertEqual(result["recommendedConcurrency"], 4)
        self.assertEqual(
            result["usage"],
            {"input": 100, "output": 20, "cacheRead": 30, "cacheWrite": 0},
        )
        self.assertIn("at least 95%", result["recommendationBasis"])

        invalid = await self.session.post(
            self.server.make_url("/api/test"),
            json={**self.payload(), "maxConcurrency": 51},
        )
        self.assertEqual(invalid.status, 400)
        self.assertIn("between 1 and 50", (await invalid.json())["error"])

    async def test_invalid_json_and_global_job_limit(self) -> None:
        invalid = await self.session.post(
            self.server.make_url("/api/test"),
            data="{",
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(invalid.status, 400)

        slow_payload = {
            **self.payload(),
            "url": str(self.upstream.make_url("/slow/chat/completions")),
            "maxConcurrency": 1,
        }
        first = await self.session.post(self.server.make_url("/api/test"), json=slow_payload)
        await asyncio.wait_for(self.slow_started.wait(), timeout=2)
        second = await self.session.post(self.server.make_url("/api/test"), json=slow_payload)
        self.assertEqual(second.status, 429)
        self.assertIn("maximum number", (await second.json())["error"])
        self.slow_release.set()
        self.assertIn("event: complete", await first.text())


if __name__ == "__main__":
    unittest.main()
