#!/usr/bin/env python3
"""Local web UI and streaming API for LLMStorm."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import aiohttp
from aiohttp import web

from llmstorm import __version__
from llmstorm.catalog import load_catalog
from llmstorm.policy import (
    DEFAULT_LOCAL_MAX_CONCURRENCY,
    DEFAULT_PUBLIC_MAX_CONCURRENCY,
    DEFAULT_QUICK_SLIDER_MAX,
    DEFAULT_RAMP_RATIOS,
    DEFAULT_SUCCESS_THRESHOLD,
    MAX_OUTPUT_TOKENS,
)
from llmstorm.pricing import DEFAULT_CATALOG_URL, PricingService
from llmstorm.site_probe import probe_site
from llmstorm.site_stats import SiteStats
from load_test_engine import (
    TestConfig,
    build_final_summary,
    concurrency_levels,
    make_connector,
    resolve_endpoint,
    run_stage,
    validate_config,
)

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
VERSION = __version__

SETTINGS_KEY = web.AppKey("settings", dict)
TEST_SEMAPHORE_KEY = web.AppKey("test_semaphore", asyncio.Semaphore)
PRICING_SERVICE_KEY = web.AppKey("pricing_service", PricingService)
ANALYSIS_SEMAPHORE_KEY = web.AppKey("analysis_semaphore", asyncio.Semaphore)
SITE_STATS_KEY = web.AppKey("site_stats", SiteStats)
CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,80}$")

WEB_MESSAGES = {
    "zh": {
        "invalid_parameters": "测试参数格式不正确",
        "json_object": "请求体必须是 JSON 对象",
        "busy": "服务器正在执行其他测试，请稍后重试",
        "failed": "测试执行失败：{error}",
        "default_prompt": "请用一句话说明并发测试的意义。",
        "plan": "将执行 {levels} 个并发档位，共 {requests} 个请求",
        "stage": "正在测试并发 {concurrency}",
    },
    "en": {
        "invalid_parameters": "Invalid test parameters",
        "json_object": "The request body must be a JSON object",
        "busy": "The server is already running the maximum number of tests. Try again later.",
        "failed": "The test failed: {error}",
        "default_prompt": "Explain the value of concurrency testing in one sentence.",
        "plan": "Running {levels} concurrency stages with {requests} total requests",
        "stage": "Testing concurrency {concurrency}",
    },
}


def normalize_locale(value: Any) -> str:
    return "en" if str(value).lower().startswith("en") else "zh"


def web_message(locale: str, key: str, **values: Any) -> str:
    return WEB_MESSAGES[locale][key].format(**values)


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def security_headers() -> dict[str, str]:
    return {
        "Content-Security-Policy": (
            "default-src 'self'; base-uri 'self'; connect-src 'self'; "
            "font-src 'self'; form-action 'self'; frame-ancestors 'none'; "
            "img-src 'self' data:; object-src 'none'; script-src 'self'; "
            "style-src 'self' 'unsafe-inline'"
        ),
        "Cross-Origin-Resource-Policy": "same-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
    }


@web.middleware
async def response_headers_middleware(
    request: web.Request,
    handler,
) -> web.StreamResponse:
    response = await handler(request)
    for name, value in security_headers().items():
        response.headers.setdefault(name, value)
    if request.path.startswith("/static/"):
        response.headers.setdefault("Cache-Control", "public, max-age=0, must-revalidate")
    elif request.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


async def index(_: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


async def site_recommendations(_: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "sites.html")


async def ai_services(_: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "ai-services.html")


async def support(_: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "support.html")


async def health(_: web.Request) -> web.Response:
    return web.json_response({"ok": True, "service": "LLMStorm", "version": VERSION})


async def public_config(request: web.Request) -> web.Response:
    settings = request.app[SETTINGS_KEY]
    return web.json_response(
        {
            "version": VERSION,
            "maxConcurrency": settings["max_concurrency"],
            "quickConcurrencyMax": min(settings["max_concurrency"], DEFAULT_QUICK_SLIDER_MAX),
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
            "successThreshold": DEFAULT_SUCCESS_THRESHOLD,
            "rampPercentages": [round(ratio * 100) for ratio in DEFAULT_RAMP_RATIOS],
            "publicMode": settings["public_mode"],
        }
    )


async def model_catalog(_: web.Request) -> web.Response:
    return web.json_response(load_catalog())


async def model_pricing(request: web.Request) -> web.Response:
    provider = request.query.get("provider", "")
    model = request.query.get("model", "")
    if not provider.strip() or not model.strip():
        return web.json_response(
            {"error": "provider and model are required"},
            status=400,
        )
    result = await request.app[PRICING_SERVICE_KEY].lookup(provider, model)
    return web.json_response(result)


def valid_client_id(value: str) -> bool:
    return bool(CLIENT_ID_PATTERN.fullmatch(value))


async def stats_snapshot(request: web.Request) -> web.Response:
    return web.json_response(await request.app[SITE_STATS_KEY].snapshot())


async def record_page_view(request: web.Request) -> web.Response:
    return web.json_response(await request.app[SITE_STATS_KEY].record_view())


async def add_site_like(request: web.Request) -> web.Response:
    return web.json_response(await request.app[SITE_STATS_KEY].add_like())


async def stats_events(request: web.Request) -> web.StreamResponse:
    visitor_id = request.query.get("visitorId", "")
    session_id = request.query.get("sessionId", "")
    if not valid_client_id(visitor_id) or not valid_client_id(session_id):
        return web.json_response({"error": "Invalid visitor or session ID"}, status=400)

    stats = request.app[SITE_STATS_KEY]
    response = web.StreamResponse(
        headers={
            **security_headers(),
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        }
    )
    await response.prepare(request)
    queue = await stats.connect(visitor_id, session_id)
    try:
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=15)
            except TimeoutError:
                await response.write(b": keepalive\n\n")
                continue
            await send_event(response, message["event"], message["data"])
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        await stats.disconnect(session_id, queue)
    return response


async def site_analysis(request: web.Request) -> web.Response:
    acquired_slot = False
    try:
        data = await request.json(loads=json.loads)
        if not isinstance(data, dict):
            raise ValueError("Request body must be a JSON object")
        config = parse_config(
            {
                **data,
                "apiKey": "",
                "maxConcurrency": 1,
                "timeout": 10,
                "maxTokens": 1,
            },
            request.app[SETTINGS_KEY],
        )
        endpoint = resolve_endpoint(config.url, config.provider, config.model)
        try:
            await asyncio.wait_for(
                request.app[ANALYSIS_SEMAPHORE_KEY].acquire(),
                timeout=0.05,
            )
            acquired_slot = True
        except TimeoutError:
            return web.json_response({"error": "Too many site analyses are running"}, status=429)
        result = await probe_site(
            endpoint,
            allow_private_targets=config.allow_private_targets,
            insecure=config.insecure,
            locale=config.locale,
        )
        return web.json_response(result)
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        return web.json_response({"error": str(error)}, status=400)
    except Exception as error:
        return web.json_response({"error": f"Site analysis failed: {error}"}, status=502)
    finally:
        if acquired_slot:
            request.app[ANALYSIS_SEMAPHORE_KEY].release()


def parse_config(data: dict[str, Any], settings: dict[str, Any]) -> TestConfig:
    locale = normalize_locale(data.get("locale"))
    try:
        config = TestConfig(
            url=str(data.get("url", "")).strip(),
            provider=str(data.get("provider", "")).strip(),
            api_key=str(data.get("apiKey", "")),
            model=str(data.get("model", "")).strip(),
            max_concurrency=int(data.get("maxConcurrency", 0)),
            timeout=float(data.get("timeout", 60)),
            max_tokens=int(data.get("maxTokens", 64)),
            prompt=str(data.get("prompt") or web_message(locale, "default_prompt"))[:2000],
            insecure=bool(data.get("insecure", False)),
            locale=locale,
            max_concurrency_limit=settings["max_concurrency"],
            allow_private_targets=not settings["public_mode"],
            allow_insecure=not settings["public_mode"],
            success_threshold=DEFAULT_SUCCESS_THRESHOLD,
            ramp_ratios=DEFAULT_RAMP_RATIOS,
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(web_message(locale, "invalid_parameters")) from exc
    validate_config(config)
    return config


async def send_event(response: web.StreamResponse, event: str, payload: Any) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    await response.write(f"event: {event}\ndata: {body}\n\n".encode())


async def run_test(request: web.Request) -> web.StreamResponse:
    response: web.StreamResponse | None = None
    locale = "zh"
    acquired_slot = False
    try:
        data = await request.json(loads=json.loads)
        if not isinstance(data, dict):
            raise ValueError(web_message(locale, "json_object"))
        locale = normalize_locale(data.get("locale"))
        config = parse_config(data, request.app[SETTINGS_KEY])
        endpoint = resolve_endpoint(config.url, config.provider, config.model)
        levels = concurrency_levels(config.max_concurrency, config.ramp_ratios)

        try:
            await asyncio.wait_for(
                request.app[TEST_SEMAPHORE_KEY].acquire(),
                timeout=0.05,
            )
            acquired_slot = True
        except TimeoutError:
            return web.json_response({"error": web_message(locale, "busy")}, status=429)

        response = web.StreamResponse(
            status=200,
            headers={
                **security_headers(),
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            },
        )
        await response.prepare(request)

        total_requests = sum(levels)
        completed_requests = 0
        passed_requests = 0
        stages: list[dict[str, Any]] = []
        all_results = []
        started = time.perf_counter()

        await send_event(
            response,
            "start",
            {
                "endpoint": endpoint,
                "levels": levels,
                "totalRequests": total_requests,
                "message": web_message(locale, "plan", levels=len(levels), requests=total_requests),
            },
        )

        timeout = aiohttp.ClientTimeout(
            total=config.timeout,
            connect=min(15.0, config.timeout),
            sock_connect=min(15.0, config.timeout),
            sock_read=config.timeout,
        )
        connector = make_connector(config)
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            next_index = 1
            for level_number, concurrency in enumerate(levels, start=1):
                await send_event(
                    response,
                    "stage_start",
                    {
                        "level": level_number,
                        "levelCount": len(levels),
                        "concurrency": concurrency,
                        "message": web_message(locale, "stage", concurrency=concurrency),
                    },
                )

                async def on_progress(result, current_concurrency=concurrency):
                    nonlocal completed_requests, passed_requests
                    completed_requests += 1
                    if result.success:
                        passed_requests += 1
                    await send_event(
                        response,
                        "progress",
                        {
                            "completed": completed_requests,
                            "total": total_requests,
                            "percent": round(completed_requests / total_requests * 100, 1),
                            "success": passed_requests,
                            "currentConcurrency": current_concurrency,
                            "lastStatus": result.status,
                        },
                    )

                stage, stage_results = await run_stage(
                    session, config, endpoint, concurrency, next_index, on_progress
                )
                next_index += concurrency
                stages.append(stage)
                all_results.extend(stage_results)
                await send_event(response, "stage_complete", stage)

        summary = build_final_summary(
            config, endpoint, stages, all_results, time.perf_counter() - started
        )
        await send_event(response, "complete", summary)
    except (ValueError, json.JSONDecodeError) as exc:
        if response is None:
            return web.json_response({"error": str(exc)}, status=400)
        await send_event(response, "error", {"message": str(exc)})
    except (ConnectionResetError, asyncio.CancelledError):
        # The browser stopped the test or closed the page.
        if isinstance(response, web.StreamResponse):
            try:
                await response.write_eof()
            except ConnectionError:
                pass
        return response if response is not None else web.Response(status=499)
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        message = web_message(locale, "failed", error=error)
        if response is None:
            return web.json_response({"error": message}, status=500)
        try:
            await send_event(response, "error", {"message": message})
        except ConnectionError:
            pass

    finally:
        if acquired_slot:
            request.app[TEST_SEMAPHORE_KEY].release()

    if response is None:
        return web.Response(status=500)
    try:
        await response.write_eof()
    except ConnectionError:
        pass
    return response


def create_app(
    *,
    public_mode: bool | None = None,
    max_concurrency: int | None = None,
    max_active_tests: int | None = None,
    pricing_service: PricingService | None = None,
    stats_service: SiteStats | None = None,
) -> web.Application:
    resolved_public_mode = (
        env_bool("LLMSTORM_PUBLIC_MODE", False) if public_mode is None else public_mode
    )
    default_concurrency = (
        DEFAULT_PUBLIC_MAX_CONCURRENCY if resolved_public_mode else DEFAULT_LOCAL_MAX_CONCURRENCY
    )
    settings = {
        "public_mode": resolved_public_mode,
        "max_concurrency": max_concurrency
        or env_int(
            "LLMSTORM_MAX_CONCURRENCY",
            default_concurrency,
            1,
            DEFAULT_LOCAL_MAX_CONCURRENCY,
        ),
        "max_active_tests": max_active_tests or env_int("LLMSTORM_MAX_ACTIVE_TESTS", 2, 1, 20),
    }
    app = web.Application(
        client_max_size=64 * 1024,
        middlewares=[response_headers_middleware],
    )
    app[SETTINGS_KEY] = settings
    app[TEST_SEMAPHORE_KEY] = asyncio.Semaphore(settings["max_active_tests"])
    app[ANALYSIS_SEMAPHORE_KEY] = asyncio.Semaphore(4)
    app[PRICING_SERVICE_KEY] = pricing_service or PricingService(
        catalog_url=os.getenv("LLMSTORM_PRICING_CATALOG_URL", "").strip()
        or DEFAULT_CATALOG_URL,
        ttl_seconds=env_int("LLMSTORM_PRICING_CACHE_SECONDS", 21600, 60, 604800),
        timeout_seconds=env_int("LLMSTORM_PRICING_TIMEOUT_SECONDS", 12, 1, 60),
    )
    app[SITE_STATS_KEY] = stats_service or SiteStats(
        os.getenv("LLMSTORM_STATS_DB", "").strip() or ROOT / "data" / "site-stats.db"
    )

    async def start_services(application: web.Application) -> None:
        await application[SITE_STATS_KEY].start()

    async def stop_services(application: web.Application) -> None:
        await application[SITE_STATS_KEY].close()

    app.on_startup.append(start_services)
    app.on_cleanup.append(stop_services)
    app.router.add_get("/", index)
    app.router.add_get("/sites", site_recommendations)
    app.router.add_get("/ai-services", ai_services)
    app.router.add_get("/support", support)
    app.router.add_get("/api/health", health)
    app.router.add_get("/api/config", public_config)
    app.router.add_get("/api/catalog", model_catalog)
    app.router.add_get("/api/pricing", model_pricing)
    app.router.add_get("/api/stats", stats_snapshot)
    app.router.add_get("/api/stats/events", stats_events)
    app.router.add_post("/api/stats/view", record_page_view)
    app.router.add_post("/api/stats/like", add_site_like)
    app.router.add_post("/api/site-analysis", site_analysis)
    app.router.add_post("/api/test", run_test)
    app.router.add_static("/static/", STATIC_DIR, show_index=False)
    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="LLMStorm 大模型并发测试网页")
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"), help="监听地址")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8765")), help="监听端口")
    args = parser.parse_args()
    print(f"LLMStorm 已启动：http://{args.host}:{args.port}")
    web.run_app(create_app(), host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
