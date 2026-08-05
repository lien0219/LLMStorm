#!/usr/bin/env python3
"""LLMStorm concurrent load-test engine.

The engine deliberately keeps API keys in memory only.  It supports the two
dominant relay protocols (OpenAI Chat Completions and Anthropic Messages) plus
Gemini's native streaming endpoint.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import math
import socket
import ssl
import time
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import urlsplit

import aiohttp
from aiohttp.abc import AbstractResolver, ResolveResult

from llmstorm import __version__
from llmstorm.policy import (
    DEFAULT_LOCAL_MAX_CONCURRENCY,
    DEFAULT_RAMP_RATIOS,
    DEFAULT_SUCCESS_THRESHOLD,
    MAX_CAPTURED_OUTPUT_CHARS,
    MAX_OUTPUT_TOKENS,
    MAX_UPSTREAM_ERROR_BYTES,
)
from llmstorm.providers import SUPPORTED_PROVIDERS, RequestContext, get_adapter

ProgressCallback = Callable[["RequestResult"], Awaitable[None]]


@dataclass(slots=True)
class TestConfig:
    url: str
    provider: str
    api_key: str
    model: str
    max_concurrency: int
    timeout: float = 60.0
    max_tokens: int = 64
    prompt: str = "请用一句话说明并发测试的意义。"
    insecure: bool = False
    locale: str = "zh"
    max_concurrency_limit: int = DEFAULT_LOCAL_MAX_CONCURRENCY
    allow_private_targets: bool = True
    allow_insecure: bool = True
    success_threshold: float = DEFAULT_SUCCESS_THRESHOLD
    ramp_ratios: tuple[float, ...] = DEFAULT_RAMP_RATIOS


@dataclass(slots=True)
class RequestResult:
    index: int
    success: bool
    status: int | str
    latency: float
    ttft: float | None
    output_chars: int
    error: str | None = None
    preview: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0


MESSAGES = {
    "zh": {
        "invalid_url": "请输入有效的 HTTP/HTTPS 接口地址",
        "https_required": "公网模式仅允许访问 HTTPS 接口",
        "url_credentials": "接口地址不能包含用户名或密码",
        "unsupported_provider": "不支持的大模型协议",
        "select_model": "请选择模型",
        "concurrency_range": "最大并发数必须在 1 到 {maximum} 之间",
        "timeout_range": "超时时间必须在 5 到 300 秒之间",
        "token_range": "最大输出 Token 必须在 1 到 {maximum} 之间",
        "insecure_disabled": "公网模式不允许跳过 HTTPS 证书校验",
        "private_target": "公网模式禁止访问私有、回环、链路本地或保留地址",
        "request_suffix": "测试编号：{index}。请直接回答，不要复述编号。",
        "unknown_upstream": "上游返回未知错误",
        "empty_output": "响应成功，但没有解析到模型输出；请检查厂商协议和 URL 是否匹配",
        "timeout": "请求超过 {timeout} 秒未完成",
        "recommendation": "测试阶段成功率不低于 {threshold}% 的最高并发档位",
    },
    "en": {
        "invalid_url": "Enter a valid HTTP or HTTPS endpoint URL",
        "https_required": "Public mode only allows HTTPS upstream endpoints",
        "url_credentials": "The endpoint URL must not contain a username or password",
        "unsupported_provider": "Unsupported model provider or protocol",
        "select_model": "Select or enter a model ID",
        "concurrency_range": "Maximum concurrency must be between 1 and {maximum}",
        "timeout_range": "Timeout must be between 5 and 300 seconds",
        "token_range": "Maximum output tokens must be between 1 and {maximum}",
        "insecure_disabled": "HTTPS certificate verification cannot be disabled in public mode",
        "private_target": "Public mode blocks private, loopback, link-local, and reserved targets",
        "request_suffix": (
            "Test request {index}. Answer directly without repeating the request number."
        ),
        "unknown_upstream": "The upstream returned an unknown error",
        "empty_output": (
            "The request succeeded, but no model output was parsed. "
            "Check that the provider protocol matches the URL."
        ),
        "timeout": "The request did not complete within {timeout} seconds",
        "recommendation": (
            "Highest tested concurrency stage with a success rate of at least {threshold}%"
        ),
    },
}


def message(config: TestConfig, key: str, **values: Any) -> str:
    locale = config.locale if config.locale in MESSAGES else "zh"
    return MESSAGES[locale][key].format(**values)


class PublicTargetResolver(AbstractResolver):
    """Resolve hosts while rejecting private and special-purpose addresses."""

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
                raise OSError(
                    "Public mode blocks private, loopback, link-local, and reserved targets"
                )
        return results

    async def close(self) -> None:
        await self._resolver.close()


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * p
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def concurrency_levels(
    max_concurrency: int,
    ratios: tuple[float, ...] = DEFAULT_RAMP_RATIOS,
) -> list[int]:
    """Create a short, increasing ramp that always includes 1 and the maximum."""
    if max_concurrency == 1:
        return [1]
    candidates = {1, max_concurrency}
    candidates.update(max(1, math.ceil(max_concurrency * ratio)) for ratio in ratios)
    return sorted(candidates)


def resolve_endpoint(raw_url: str, provider: str, model: str) -> str:
    """Accept either a full endpoint or a conventional API/base URL."""
    return get_adapter(provider).resolve_endpoint(raw_url, model)


def validate_config(config: TestConfig) -> None:
    parsed = urlsplit(config.url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(message(config, "invalid_url"))
    if not config.allow_private_targets and parsed.scheme != "https":
        raise ValueError(message(config, "https_required"))
    if parsed.username or parsed.password:
        raise ValueError(message(config, "url_credentials"))
    if not config.allow_private_targets and parsed.hostname:
        try:
            literal_address = ipaddress.ip_address(parsed.hostname.split("%", 1)[0])
        except ValueError:
            literal_address = None
        if literal_address is not None and not literal_address.is_global:
            raise ValueError(message(config, "private_target"))
    if config.provider not in SUPPORTED_PROVIDERS:
        raise ValueError(message(config, "unsupported_provider"))
    if not config.model.strip():
        raise ValueError(message(config, "select_model"))
    if not 1 <= config.max_concurrency <= config.max_concurrency_limit:
        raise ValueError(message(config, "concurrency_range", maximum=config.max_concurrency_limit))
    if not 5 <= config.timeout <= 300:
        raise ValueError(message(config, "timeout_range"))
    if not 1 <= config.max_tokens <= MAX_OUTPUT_TOKENS:
        raise ValueError(message(config, "token_range", maximum=MAX_OUTPUT_TOKENS))
    if not 0 < config.success_threshold <= 100:
        raise ValueError("Success threshold must be between 0 and 100")
    if any(not 0 < ratio < 1 for ratio in config.ramp_ratios):
        raise ValueError("Ramp ratios must be between 0 and 1")
    if config.insecure and not config.allow_insecure:
        raise ValueError(message(config, "insecure_disabled"))


def request_spec(config: TestConfig, index: int) -> tuple[dict[str, str], dict[str, Any]]:
    prompt = f"{config.prompt}\n{message(config, 'request_suffix', index=index)}"
    return get_adapter(config.provider).build_request(
        RequestContext(
            api_key=config.api_key,
            model=config.model,
            prompt=prompt,
            max_tokens=config.max_tokens,
            user_agent=f"LLMStorm/{__version__}",
        )
    )


def extract_stream_text(provider: str, chunk: dict[str, Any]) -> str:
    return get_adapter(provider).extract_text(chunk)


def extract_stream_usage(provider: str, chunk: dict[str, Any]) -> dict[str, int]:
    return get_adapter(provider).extract_usage(chunk)


def extract_error(body: str, reason: str | None = None, fallback: str = "Upstream error") -> str:
    compact = body.strip()
    try:
        value = json.loads(compact)
        error = value.get("error") if isinstance(value, dict) else None
        if isinstance(error, dict):
            compact = str(error.get("message") or error.get("type") or compact)
        elif isinstance(error, str):
            compact = error
        elif isinstance(value, dict) and value.get("message"):
            compact = str(value["message"])
    except (json.JSONDecodeError, TypeError):
        pass
    return (compact or reason or fallback)[:500]


def redact_secret(value: str, secret: str) -> str:
    return value.replace(secret, "[REDACTED]") if secret else value


async def run_request(
    session: aiohttp.ClientSession,
    config: TestConfig,
    endpoint: str,
    index: int,
) -> RequestResult:
    headers, payload = request_spec(config, index)
    started = time.perf_counter()
    ttft: float | None = None
    parts: list[str] = []
    output_chars_seen = 0
    output_limit_reached = False
    status: int | str = "EXCEPTION"
    usage = {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}

    def update_usage(chunk: dict[str, Any]) -> None:
        for key, value in extract_stream_usage(config.provider, chunk).items():
            if key in usage and isinstance(value, int) and value >= 0:
                usage[key] = max(usage[key], value)

    try:
        async with session.post(endpoint, headers=headers, json=payload) as response:
            status = response.status
            if response.status < 200 or response.status >= 300:
                body = (await response.content.read(MAX_UPSTREAM_ERROR_BYTES)).decode(
                    "utf-8", errors="replace"
                )
                error = extract_error(
                    body,
                    response.reason,
                    message(config, "unknown_upstream"),
                )
                return RequestResult(
                    index,
                    False,
                    status,
                    time.perf_counter() - started,
                    None,
                    0,
                    redact_secret(error, config.api_key),
                )

            buffer = ""
            async for raw in response.content.iter_any():
                buffer += raw.decode("utf-8", errors="ignore")
                if len(buffer) > MAX_CAPTURED_OUTPUT_CHARS and "\n" not in buffer:
                    output_limit_reached = True
                    break
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line or line.startswith(":"):
                        continue
                    data = line[5:].strip() if line.startswith("data:") else line
                    if not data or data == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    update_usage(chunk)
                    text = extract_stream_text(config.provider, chunk)
                    if text:
                        if ttft is None:
                            ttft = time.perf_counter() - started
                        parts.append(text)
                        output_chars_seen += len(text)
                        if output_chars_seen >= MAX_CAPTURED_OUTPUT_CHARS:
                            output_limit_reached = True
                            break
                if output_limit_reached:
                    break

            # Handle a non-streaming JSON body without a trailing newline.
            tail = buffer.strip()
            if tail:
                data = tail[5:].strip() if tail.startswith("data:") else tail
                try:
                    chunk = json.loads(data)
                    update_usage(chunk)
                    text = extract_stream_text(config.provider, chunk)
                    if text:
                        if ttft is None:
                            ttft = time.perf_counter() - started
                        parts.append(text)
                except json.JSONDecodeError:
                    pass

            latency = time.perf_counter() - started
            output = "".join(parts)
            if not output:
                return RequestResult(
                    index,
                    False,
                    status,
                    latency,
                    ttft,
                    0,
                    message(config, "empty_output"),
                )
            return RequestResult(
                index,
                True,
                status,
                latency,
                ttft,
                len(output),
                preview=output[:160],
                input_tokens=usage["input"],
                output_tokens=usage["output"],
                cache_read_tokens=usage["cacheRead"],
                cache_write_tokens=usage["cacheWrite"],
            )
    except TimeoutError:
        return RequestResult(
            index,
            False,
            status,
            time.perf_counter() - started,
            ttft,
            0,
            message(config, "timeout", timeout=f"{config.timeout:.0f}"),
        )
    except aiohttp.ClientError as exc:
        error = redact_secret(f"{type(exc).__name__}: {exc}", config.api_key)
        return RequestResult(
            index,
            False,
            status,
            time.perf_counter() - started,
            ttft,
            0,
            error,
        )
    except Exception as exc:  # Keep one upstream failure from aborting the stage.
        error = redact_secret(f"{type(exc).__name__}: {exc}", config.api_key)
        return RequestResult(
            index,
            False,
            status,
            time.perf_counter() - started,
            ttft,
            0,
            error,
        )


def summarize_stage(
    concurrency: int, results: list[RequestResult], wall_time: float
) -> dict[str, Any]:
    successes = [item for item in results if item.success]
    latencies = [item.latency for item in successes]
    ttfts = [item.ttft for item in successes if item.ttft is not None]
    success_count = len(successes)
    total = len(results)
    usage = {
        "input": sum(item.input_tokens for item in successes),
        "output": sum(item.output_tokens for item in successes),
        "cacheRead": sum(item.cache_read_tokens for item in successes),
        "cacheWrite": sum(item.cache_write_tokens for item in successes),
    }
    return {
        "concurrency": concurrency,
        "requests": total,
        "success": success_count,
        "failure": total - success_count,
        "successRate": success_count / total * 100 if total else 0,
        "wallTime": wall_time,
        "throughput": success_count / wall_time if wall_time > 0 else 0,
        "avgLatency": sum(latencies) / len(latencies) if latencies else None,
        "p95Latency": percentile(latencies, 0.95),
        "avgTtft": sum(ttfts) / len(ttfts) if ttfts else None,
        "statusDistribution": dict(Counter(str(item.status) for item in results)),
        "failures": [
            {"index": item.index, "status": item.status, "error": item.error}
            for item in results
            if not item.success
        ][:10],
        "sampleOutput": next((item.preview for item in successes if item.preview), ""),
        "usage": usage,
    }


async def run_stage(
    session: aiohttp.ClientSession,
    config: TestConfig,
    endpoint: str,
    concurrency: int,
    start_index: int,
    on_progress: ProgressCallback,
) -> tuple[dict[str, Any], list[RequestResult]]:
    started = time.perf_counter()
    tasks = [
        asyncio.create_task(run_request(session, config, endpoint, start_index + offset))
        for offset in range(concurrency)
    ]
    results: list[RequestResult] = []
    try:
        for completed in asyncio.as_completed(tasks):
            result = await completed
            results.append(result)
            await on_progress(result)
    except BaseException:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise

    wall_time = time.perf_counter() - started
    return summarize_stage(concurrency, results, wall_time), results


def build_final_summary(
    config: TestConfig,
    endpoint: str,
    stages: list[dict[str, Any]],
    results: list[RequestResult],
    wall_time: float,
) -> dict[str, Any]:
    successful_stages = [
        stage for stage in stages if stage["successRate"] >= config.success_threshold
    ]
    recommended = max((stage["concurrency"] for stage in successful_stages), default=0)
    success_count = sum(1 for item in results if item.success)
    total = len(results)
    all_latencies = [item.latency for item in results if item.success]
    successful_results = [item for item in results if item.success]
    return {
        "provider": config.provider,
        "model": config.model,
        "endpoint": endpoint,
        "maxTestedConcurrency": config.max_concurrency,
        "recommendedConcurrency": recommended,
        "recommendationBasis": message(
            config,
            "recommendation",
            threshold=f"{config.success_threshold:g}",
        ),
        "requests": total,
        "success": success_count,
        "failure": total - success_count,
        "successRate": success_count / total * 100 if total else 0,
        "wallTime": wall_time,
        "peakThroughput": max((stage["throughput"] for stage in stages), default=0),
        "p95Latency": percentile(all_latencies, 0.95),
        "usage": {
            "input": sum(item.input_tokens for item in successful_results),
            "output": sum(item.output_tokens for item in successful_results),
            "cacheRead": sum(item.cache_read_tokens for item in successful_results),
            "cacheWrite": sum(item.cache_write_tokens for item in successful_results),
        },
        "stages": stages,
        "failures": [asdict(item) for item in results if not item.success][:30],
    }


def make_connector(config: TestConfig) -> aiohttp.TCPConnector:
    ssl_context: ssl.SSLContext | bool = False if config.insecure else True
    resolver = None if config.allow_private_targets else PublicTargetResolver()
    return aiohttp.TCPConnector(
        limit=max(config.max_concurrency, 10),
        limit_per_host=max(config.max_concurrency, 10),
        ttl_dns_cache=300,
        ssl=ssl_context,
        resolver=resolver,
    )
