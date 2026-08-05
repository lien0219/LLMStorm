from __future__ import annotations

import ipaddress
import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

from multidict import CIMultiDict

from llmstorm import site_probe


class _ResolverStub:
    def __init__(self, results: list[dict[str, object]]) -> None:
        self.results = results
        self.closed = False

    async def resolve(self, *_: object) -> list[dict[str, object]]:
        return self.results

    async def close(self) -> None:
        self.closed = True


class SiteProbeTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_resolver_allows_public_and_rejects_private_addresses(self) -> None:
        resolver = site_probe.PublicProbeResolver()
        public_stub = _ResolverStub([{"host": "8.8.8.8"}])
        resolver._resolver = public_stub  # type: ignore[assignment]

        results = await resolver.resolve("dns.google", 443)
        self.assertEqual(results[0]["host"], "8.8.8.8")
        await resolver.close()
        self.assertTrue(public_stub.closed)

        resolver = site_probe.PublicProbeResolver()
        resolver._resolver = _ResolverStub([{"host": "127.0.0.1"}])  # type: ignore[assignment]
        with self.assertRaisesRegex(OSError, "blocks private"):
            await resolver.resolve("localhost", 80)

    def test_probe_helpers_sanitize_routes_and_score_quality(self) -> None:
        self.assertEqual(site_probe._error_text(RuntimeError()), "RuntimeError")
        self.assertEqual(site_probe._address_scope(ipaddress.ip_address("127.0.0.1")), "loopback")
        self.assertEqual(site_probe._address_scope(ipaddress.ip_address("169.254.1.1")), "private")
        self.assertEqual(site_probe._address_scope(ipaddress.ip_address("224.0.0.1")), "multicast")
        self.assertEqual(site_probe._address_scope(ipaddress.ip_address("8.8.8.8")), "public")

        headers = CIMultiDict(
            {
                "X-Upstream-URL": "https://user:secret@example.com/v1",
                "X-Origin-URL": "https://api.openai.com/v1/chat/completions",
                "X-OpenAI-Request-ID": "req_test",
                "Server": "cloudflare",
                "Via": "1.1 edge, 1.1 relay",
            }
        )
        route = site_probe._route_fingerprint(
            headers,
            "https://redirect.example/v1",
            "relay.example",
            ["https://relay.example/v1", "https://redirect.example/v1"],
        )
        self.assertEqual(route["suspectedProvider"], "OpenAI")
        self.assertEqual(route["confidence"], "high")
        self.assertEqual(route["infrastructure"], ["Cloudflare"])
        self.assertEqual(route["proxySignals"], 2)
        self.assertEqual(route["exposedUpstreamUrl"], "https://api.openai.com/v1/chat/completions")
        self.assertEqual(route["redirectTarget"], "https://redirect.example/v1")

        quality = {
            "reachable": True,
            "httpStatus": 503,
            "dnsMs": 600,
            "tcpMs": 900,
            "tlsMs": 1500,
            "ttfbMs": 2100,
            "certificate": {"daysRemaining": -1},
        }
        self.assertEqual(site_probe._quality_score(quality), 0)
        self.assertEqual(site_probe._quality_score({"reachable": False}), 0)

    def test_certificate_and_tls_helpers(self) -> None:
        future = datetime.now(UTC) + timedelta(days=60)
        certificate = site_probe._certificate_summary(
            {
                "subject": ((('commonName', "relay.example"),),),
                "issuer": ((('commonName', "Test CA"),),),
                "notAfter": future.strftime("%b %d %H:%M:%S %Y GMT"),
                "subjectAltName": (("DNS", "relay.example"), ("DNS", "api.relay.example")),
            }
        )
        self.assertEqual(certificate["subject"], "relay.example")
        self.assertEqual(certificate["issuer"], "Test CA")
        self.assertGreaterEqual(certificate["daysRemaining"], 59)
        self.assertEqual(certificate["altNames"], ["relay.example", "api.relay.example"])
        self.assertIsNone(site_probe._certificate_name("invalid"))

        secure = site_probe._ssl_context(False)
        insecure = site_probe._ssl_context(True)
        self.assertTrue(secure.check_hostname)
        self.assertFalse(insecure.check_hostname)

    async def test_probe_returns_a_safe_dns_failure_result(self) -> None:
        with self.assertRaisesRegex(ValueError, "valid HTTP"):
            await site_probe.probe_site(
                "ftp://relay.example",
                allow_private_targets=False,
                insecure=False,
            )

        with patch(
            "llmstorm.site_probe._resolve_addresses",
            new=AsyncMock(side_effect=OSError("DNS unavailable")),
        ):
            result = await site_probe.probe_site(
                "https://relay.example/v1",
                allow_private_targets=False,
                insecure=False,
            )
        self.assertFalse(result["quality"]["reachable"])
        self.assertEqual(result["quality"]["score"], 0)
        self.assertEqual(result["quality"]["error"], "DNS unavailable")
        self.assertEqual(result["host"], "relay.example")


if __name__ == "__main__":
    unittest.main()
