"""Single-sample site quality probe and conservative relay-route fingerprinting."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
import ssl
import time
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

import aiohttp
from aiohttp.abc import AbstractResolver, ResolveResult
from multidict import CIMultiDictProxy

UPSTREAM_URL_HEADERS = ("x-upstream-url", "x-origin-url", "x-backend-url")
EVIDENCE_HEADERS = (
    "server",
    "via",
    "x-powered-by",
    "x-served-by",
    "x-cache",
    "cf-ray",
    "x-request-id",
    "x-openai-request-id",
    "openai-organization",
    "anthropic-request-id",
    "x-goog-request-id",
    "x-vercel-id",
    *UPSTREAM_URL_HEADERS,
)
IP_LOOKUP_URL = "https://ipwho.is/{address}"
IP_CACHE_TTL_SECONDS = 24 * 60 * 60
IP_LOOKUP_LIMIT = 4
_ip_cache: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}


class PublicProbeResolver(AbstractResolver):
    """Resolve every HTTP probe hop while rejecting non-public addresses."""

    def __init__(self) -> None:
        self._resolver = aiohttp.DefaultResolver()

    async def resolve(
        self,
        host: str,
        port: int = 0,
        family: socket.AddressFamily = socket.AF_INET,
    ) -> list[ResolveResult]:
        results = await self._resolver.resolve(host, port, family)
        for result in results:
            address = ipaddress.ip_address(str(result["host"]).split("%", 1)[0])
            if not address.is_global:
                raise OSError("Public mode blocks private and special-purpose probe targets")
        return results

    async def close(self) -> None:
        await self._resolver.close()


def _error_text(error: BaseException) -> str:
    detail = str(error).strip()
    return (detail or type(error).__name__)[:240]


def _address_scope(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str:
    if address.is_loopback:
        return "loopback"
    if address.is_private:
        return "private"
    if address.is_link_local:
        return "linkLocal"
    if address.is_multicast:
        return "multicast"
    if address.is_reserved:
        return "reserved"
    return "public" if address.is_global else "special"


async def _reverse_dns(address: str) -> str | None:
    try:
        async with asyncio.timeout(2):
            result = await asyncio.to_thread(socket.gethostbyaddr, address)
        return str(result[0])[:253]
    except (OSError, TimeoutError):
        return None


async def _lookup_ip_details(
    session: aiohttp.ClientSession,
    address: str,
    locale: str,
) -> dict[str, Any]:
    parsed_address = ipaddress.ip_address(address)
    base: dict[str, Any] = {
        "address": address,
        "version": f"IPv{parsed_address.version}",
        "scope": _address_scope(parsed_address),
        "reverseDns": await _reverse_dns(address),
        "country": None,
        "countryCode": None,
        "flagEmoji": None,
        "region": None,
        "city": None,
        "latitude": None,
        "longitude": None,
        "asn": None,
        "organization": None,
        "isp": None,
        "domain": None,
        "security": None,
        "source": None,
        "error": None,
    }
    if not parsed_address.is_global:
        return base

    cache_key = (address, locale)
    cached = _ip_cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < IP_CACHE_TTL_SECONDS:
        return {**cached[1], "reverseDns": base["reverseDns"]}

    params = {
        "lang": "zh-CN" if locale == "zh" else "en",
        "fields": (
            "ip,success,message,type,country,country_code,region,city,latitude,longitude,"
            "flag.emoji,connection,security"
        ),
    }
    try:
        async with session.get(IP_LOOKUP_URL.format(address=address), params=params) as response:
            response.raise_for_status()
            payload = await response.json(content_type=None)
        if not isinstance(payload, dict) or payload.get("success") is False:
            raise ValueError(str(payload.get("message") or "IP lookup failed"))
        connection = payload.get("connection")
        connection = connection if isinstance(connection, dict) else {}
        security = payload.get("security")
        security = security if isinstance(security, dict) else {}
        flag = payload.get("flag")
        flag = flag if isinstance(flag, dict) else {}
        asn = connection.get("asn")
        enriched = {
            **base,
            "country": payload.get("country"),
            "countryCode": payload.get("country_code"),
            "flagEmoji": flag.get("emoji"),
            "region": payload.get("region"),
            "city": payload.get("city"),
            "latitude": payload.get("latitude"),
            "longitude": payload.get("longitude"),
            "asn": f"AS{asn}" if asn not in {None, ""} else None,
            "organization": connection.get("org"),
            "isp": connection.get("isp"),
            "domain": connection.get("domain"),
            "security": {
                key: bool(security.get(key))
                for key in ("hosting", "proxy", "vpn", "tor")
                if key in security
            }
            or None,
            "source": "ipwho.is",
        }
        _ip_cache[cache_key] = (time.monotonic(), enriched)
        return enriched
    except (aiohttp.ClientError, TimeoutError, ValueError, TypeError) as error:
        return {**base, "error": _error_text(error)}


async def _enrich_addresses(addresses: list[str], locale: str) -> list[dict[str, Any]]:
    timeout = aiohttp.ClientTimeout(total=5)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        return await asyncio.gather(
            *(
                _lookup_ip_details(session, address, locale)
                for address in addresses[:IP_LOOKUP_LIMIT]
            )
        )


async def _resolve_addresses(
    host: str,
    port: int,
    allow_private_targets: bool,
    timeout_seconds: float,
) -> tuple[list[str], float]:
    started = time.perf_counter()
    async with asyncio.timeout(timeout_seconds):
        records = await asyncio.get_running_loop().getaddrinfo(
            host,
            port,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
        )
    addresses = list(dict.fromkeys(str(record[4][0]).split("%", 1)[0] for record in records))
    if not addresses:
        raise OSError("DNS returned no address")
    if not allow_private_targets:
        for value in addresses:
            if not ipaddress.ip_address(value).is_global:
                raise ValueError("Public mode blocks private and special-purpose probe targets")
    return addresses[:6], (time.perf_counter() - started) * 1000


def _ssl_context(insecure: bool) -> ssl.SSLContext:
    context = ssl.create_default_context()
    if insecure:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    return context


def _certificate_name(parts: Any) -> str | None:
    if not isinstance(parts, tuple):
        return None
    for group in parts:
        if not isinstance(group, tuple):
            continue
        for item in group:
            if isinstance(item, tuple) and len(item) == 2 and item[0] == "commonName":
                return str(item[1])[:180]
    return None


def _certificate_summary(certificate: dict[str, Any]) -> dict[str, Any]:
    expires_at: str | None = None
    days_remaining: int | None = None
    not_after = certificate.get("notAfter")
    if isinstance(not_after, str):
        expires = datetime.fromtimestamp(ssl.cert_time_to_seconds(not_after), UTC)
        expires_at = expires.isoformat()
        days_remaining = int((expires - datetime.now(UTC)).total_seconds() // 86400)
    alt_names = [
        str(value)
        for kind, value in certificate.get("subjectAltName", ())
        if kind == "DNS"
    ][:6]
    return {
        "subject": _certificate_name(certificate.get("subject")),
        "issuer": _certificate_name(certificate.get("issuer")),
        "expiresAt": expires_at,
        "daysRemaining": days_remaining,
        "altNames": alt_names,
    }


async def _connect(
    address: str,
    port: int,
    host: str,
    tls: bool,
    insecure: bool,
    timeout_seconds: float,
) -> tuple[float, dict[str, Any] | None]:
    started = time.perf_counter()
    kwargs: dict[str, Any] = {}
    if tls:
        kwargs.update(ssl=_ssl_context(insecure), server_hostname=host)
    async with asyncio.timeout(timeout_seconds):
        _, writer = await asyncio.open_connection(address, port, **kwargs)
    elapsed = (time.perf_counter() - started) * 1000
    certificate = None
    if tls:
        ssl_object = writer.get_extra_info("ssl_object")
        peer_certificate = ssl_object.getpeercert() if ssl_object else None
        if isinstance(peer_certificate, dict):
            certificate = _certificate_summary(peer_certificate)
    writer.close()
    try:
        await writer.wait_closed()
    except (ConnectionError, OSError, ssl.SSLError):
        pass
    return elapsed, certificate


def _safe_exposed_url(headers: CIMultiDictProxy[str]) -> str | None:
    for header in UPSTREAM_URL_HEADERS:
        value = str(headers.get(header, "")).strip()
        parsed = urlsplit(value)
        if parsed.scheme in {"http", "https"} and parsed.hostname and not (
            parsed.username or parsed.password
        ):
            return value[:500]
    return None


def _route_fingerprint(
    headers: CIMultiDictProxy[str],
    final_url: str,
    original_host: str,
    redirect_chain: list[str],
) -> dict[str, Any]:
    evidence = []
    for name in EVIDENCE_HEADERS:
        value = str(headers.get(name, "")).strip()
        if value:
            evidence.append({"name": name, "value": value[:180]})
    blob = "\n".join(f"{item['name']}:{item['value']}" for item in evidence).lower()
    provider: str | None = None
    confidence = "none"
    provider_rules = (
        ("OpenAI", ("x-openai-request-id", "openai-organization")),
        ("Anthropic", ("anthropic-request-id", "anthropic-ratelimit")),
        ("Google AI", ("x-goog-request-id", "generativelanguage.googleapis.com")),
    )
    for candidate, markers in provider_rules:
        if any(marker in blob for marker in markers):
            provider = candidate
            confidence = "high"
            break

    infrastructure_rules = (
        ("Cloudflare", ("cf-ray", "cloudflare")),
        ("Vercel", ("x-vercel-id", "vercel")),
        ("nginx", ("nginx",)),
        ("Caddy", ("caddy",)),
        ("Envoy", ("envoy",)),
    )
    infrastructure = [
        name
        for name, markers in infrastructure_rules
        if any(marker in blob for marker in markers)
    ]
    final_host = urlsplit(final_url).hostname
    redirect_target = final_url if final_host and final_host != original_host else None
    via = str(headers.get("via", ""))
    proxy_signals = len([part for part in via.split(",") if part.strip()])
    return {
        "exposedUpstreamUrl": _safe_exposed_url(headers),
        "redirectTarget": redirect_target,
        "redirectChain": redirect_chain,
        "suspectedProvider": provider,
        "confidence": confidence,
        "infrastructure": infrastructure,
        "proxySignals": proxy_signals,
        "evidence": evidence[:12],
    }


def _quality_score(quality: dict[str, Any]) -> int:
    if not quality.get("reachable"):
        return 0
    score = 100
    status = quality.get("httpStatus")
    if isinstance(status, int) and status >= 500:
        score -= 35
    elif isinstance(status, int) and status >= 400:
        score -= 8
    thresholds = (
        ("dnsMs", 200, 500, 7, 14),
        ("tcpMs", 300, 800, 8, 18),
        ("tlsMs", 600, 1400, 8, 16),
        ("ttfbMs", 700, 2000, 8, 20),
    )
    for key, warning, poor, warning_penalty, poor_penalty in thresholds:
        value = quality.get(key)
        if isinstance(value, (int, float)):
            score -= poor_penalty if value > poor else warning_penalty if value > warning else 0
    certificate = quality.get("certificate")
    if isinstance(certificate, dict):
        days = certificate.get("daysRemaining")
        if isinstance(days, int):
            score -= 45 if days < 0 else 20 if days < 7 else 8 if days < 30 else 0
    return max(0, score)


async def probe_site(
    endpoint: str,
    *,
    allow_private_targets: bool,
    insecure: bool,
    locale: str = "zh",
    timeout_seconds: float = 10,
) -> dict[str, Any]:
    """Probe one endpoint without sending the API key or an inference payload."""
    parsed = urlsplit(endpoint)
    if not parsed.hostname or parsed.scheme not in {"http", "https"}:
        raise ValueError("A valid HTTP or HTTPS endpoint is required")
    host = parsed.hostname
    tls = parsed.scheme == "https"
    port = parsed.port or (443 if tls else 80)
    quality: dict[str, Any] = {
        "reachable": False,
        "dnsMs": None,
        "tcpMs": None,
        "tlsMs": None,
        "ttfbMs": None,
        "httpStatus": None,
        "httpVersion": None,
        "addresses": [],
        "ipDetails": [],
        "certificate": None,
        "error": None,
    }
    route: dict[str, Any] = {
        "exposedUpstreamUrl": None,
        "redirectTarget": None,
        "redirectChain": [],
        "suspectedProvider": None,
        "confidence": "none",
        "infrastructure": [],
        "proxySignals": 0,
        "evidence": [],
    }

    try:
        addresses, dns_ms = await _resolve_addresses(
            host,
            port,
            allow_private_targets,
            timeout_seconds,
        )
        quality["addresses"] = addresses
        quality["dnsMs"] = round(dns_ms, 2)
    except ValueError:
        raise
    except (OSError, TimeoutError, socket.gaierror) as error:
        quality["error"] = _error_text(error)
        quality["score"] = 0
        return {
            "endpoint": endpoint,
            "host": host,
            "checkedAt": datetime.now(UTC).isoformat(),
            "quality": quality,
            "route": route,
        }

    address = quality["addresses"][0]
    ip_details_task = asyncio.create_task(_enrich_addresses(quality["addresses"], locale))
    try:
        tcp_ms, _ = await _connect(
            address,
            port,
            host,
            False,
            insecure,
            timeout_seconds,
        )
        quality["tcpMs"] = round(tcp_ms, 2)
    except (OSError, TimeoutError) as error:
        quality["error"] = _error_text(error)

    if tls:
        try:
            tls_ms, certificate = await _connect(
                address,
                port,
                host,
                True,
                insecure,
                timeout_seconds,
            )
            quality["tlsMs"] = round(tls_ms, 2)
            quality["certificate"] = certificate
        except (OSError, TimeoutError, ssl.SSLError) as error:
            quality["error"] = _error_text(error)

    resolver = None if allow_private_targets else PublicProbeResolver()
    connector = aiohttp.TCPConnector(
        limit=2,
        ssl=False if insecure else True,
        resolver=resolver,
    )
    timeout = aiohttp.ClientTimeout(total=timeout_seconds)
    try:
        started = time.perf_counter()
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            async with session.head(endpoint, allow_redirects=True, max_redirects=3) as response:
                quality["ttfbMs"] = round((time.perf_counter() - started) * 1000, 2)
                quality["httpStatus"] = response.status
                version = response.version
                quality["httpVersion"] = (
                    f"HTTP/{version.major}.{version.minor}" if version is not None else None
                )
                quality["reachable"] = True
                final_url = str(response.url)
                redirect_chain = [str(item.url) for item in response.history]
                if redirect_chain:
                    redirect_chain.append(final_url)
                route = _route_fingerprint(
                    response.headers,
                    final_url,
                    host,
                    redirect_chain,
                )
    except (aiohttp.ClientError, OSError, TimeoutError) as error:
        quality["error"] = _error_text(error)

    quality["ipDetails"] = await ip_details_task
    quality["score"] = _quality_score(quality)
    return {
        "endpoint": endpoint,
        "host": host,
        "checkedAt": datetime.now(UTC).isoformat(),
        "quality": quality,
        "route": route,
    }
