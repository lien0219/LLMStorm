#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
OpenAI 兼容 Chat Completions 流式并发压测脚本。

功能：
- 固定并发压测
- 流式响应解析
- TTFT（首 Token 延迟）
- 完整响应耗时
- P50 / P95 / P99
- 请求吞吐量
- 输出 Token 统计
- 输出速度统计
- HTTP 状态码与失败明细
- 可选 JSON 报告导出
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import ssl
import sys
import time
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

import aiohttp

try:
    import tiktoken
except ImportError:
    tiktoken = None


@dataclass(slots=True)
class RequestResult:
    index: int
    success: bool
    status: str
    ttft: float | None
    total_time: float
    output_tokens: int
    output_speed: float | None
    error: str | None = None
    token_source: str = "local"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="OpenAI 兼容大模型流式并发压测工具",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--url",
        required=True,
        help="完整接口地址，例如 https://example.com/v1/chat/completions",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("OPENAI_API_KEY", ""),
        help="API Key；默认读取环境变量 OPENAI_API_KEY",
    )
    parser.add_argument("--model", required=True, help="模型名称")
    parser.add_argument("--concurrency", type=int, default=50, help="并发数")
    parser.add_argument("--requests", type=int, default=500, help="总请求数")
    parser.add_argument("--warmup", type=int, default=0, help="预热请求数，不计入统计")
    parser.add_argument(
        "--prompt",
        default="请用不超过80个字说明人工智能如何提升软件开发效率。",
        help="测试提示词",
    )
    parser.add_argument(
        "--system-prompt",
        default="你是一个回答简洁、准确的助手。",
        help="系统提示词；传空字符串可关闭",
    )
    parser.add_argument("--max-tokens", type=int, default=128, help="最大输出 Token")
    parser.add_argument(
        "--max-tokens-field",
        choices=("max_tokens", "max_completion_tokens"),
        default="max_tokens",
        help="上游接口使用的输出 Token 参数名",
    )
    parser.add_argument("--temperature", type=float, default=0.7, help="temperature")
    parser.add_argument("--timeout", type=float, default=120.0, help="单请求总超时，秒")
    parser.add_argument("--connect-timeout", type=float, default=15.0, help="连接超时，秒")
    parser.add_argument(
        "--same-prompt",
        action="store_true",
        help="所有请求使用完全相同提示词；默认追加请求编号以降低缓存影响",
    )
    parser.add_argument(
        "--stream-usage",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="发送 stream_options.include_usage；不兼容时使用 --no-stream-usage",
    )
    parser.add_argument("--proxy", default=None, help="HTTP/HTTPS 代理，例如 http://127.0.0.1:7890")
    parser.add_argument("--insecure", action="store_true", help="跳过 HTTPS 证书校验")
    parser.add_argument(
        "--header",
        action="append",
        default=[],
        metavar="KEY:VALUE",
        help="附加请求头，可重复传入",
    )
    parser.add_argument(
        "--json-output",
        default=None,
        help="将完整结果保存为 JSON 文件，例如 result.json",
    )
    parser.add_argument(
        "--show-failures",
        type=int,
        default=10,
        help="终端最多显示多少条失败记录",
    )
    args = parser.parse_args()

    if args.concurrency <= 0:
        parser.error("--concurrency 必须大于 0")
    if args.requests <= 0:
        parser.error("--requests 必须大于 0")
    if args.warmup < 0:
        parser.error("--warmup 不能小于 0")
    if args.max_tokens <= 0:
        parser.error("--max-tokens 必须大于 0")
    if args.timeout <= 0 or args.connect_timeout <= 0:
        parser.error("超时时间必须大于 0")

    return args


def parse_extra_headers(items: Iterable[str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for item in items:
        if ":" not in item:
            raise ValueError(f"请求头格式错误：{item!r}，正确格式为 KEY:VALUE")
        key, value = item.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            raise ValueError(f"请求头名称不能为空：{item!r}")
        headers[key] = value
    return headers


def make_token_encoder(model: str):
    if tiktoken is None:
        return None
    try:
        return tiktoken.encoding_for_model(model)
    except Exception:
        for name in ("o200k_base", "cl100k_base"):
            try:
                return tiktoken.get_encoding(name)
            except Exception:
                continue
    return None


def count_tokens(text: str, encoder: Any) -> int:
    if not text:
        return 0
    if encoder is not None:
        try:
            return len(encoder.encode(text, disallowed_special=()))
        except Exception:
            pass
    # tiktoken 不可用时的保守估算：中文约 1.5 字符/Token，英文约 4 字符/Token。
    ascii_count = sum(1 for char in text if ord(char) < 128)
    non_ascii_count = len(text) - ascii_count
    return max(1, math.ceil(ascii_count / 4 + non_ascii_count / 1.5))


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * p
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def extract_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                candidate = item.get("text") or item.get("content")
                if isinstance(candidate, str):
                    parts.append(candidate)
        return "".join(parts)
    return ""


def extract_delta_text(chunk: dict[str, Any]) -> str:
    choices = chunk.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    choice = choices[0]
    if not isinstance(choice, dict):
        return ""

    delta = choice.get("delta")
    if isinstance(delta, dict):
        for key in ("content", "reasoning_content", "reasoning", "text"):
            text = extract_text(delta.get(key))
            if text:
                return text

    # 兼容少数非标准流式实现。
    return extract_text(choice.get("text"))


def build_payload(args: argparse.Namespace, index: int) -> dict[str, Any]:
    prompt = args.prompt
    if not args.same_prompt:
        prompt = f"{prompt}\n\n压测请求编号：{index}。请直接作答，不要复述编号。"

    messages: list[dict[str, str]] = []
    if args.system_prompt:
        messages.append({"role": "system", "content": args.system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload: dict[str, Any] = {
        "model": args.model,
        "messages": messages,
        "stream": True,
        "temperature": args.temperature,
        args.max_tokens_field: args.max_tokens,
    }
    if args.stream_usage:
        payload["stream_options"] = {"include_usage": True}
    return payload


async def run_one_request(
    index: int,
    args: argparse.Namespace,
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    headers: dict[str, str],
    encoder: Any,
) -> RequestResult:
    async with semaphore:
        started = time.perf_counter()
        ttft: float | None = None
        output_parts: list[str] = []
        reported_tokens: int | None = None
        status = "EXCEPTION"

        try:
            payload = build_payload(args, index)
            async with session.post(
                args.url,
                headers=headers,
                json=payload,
                proxy=args.proxy,
            ) as response:
                status = str(response.status)

                if response.status != 200:
                    body = await response.text(errors="replace")
                    total_time = time.perf_counter() - started
                    return RequestResult(
                        index=index,
                        success=False,
                        status=status,
                        ttft=None,
                        total_time=total_time,
                        output_tokens=0,
                        output_speed=None,
                        error=body.strip()[:4000] or response.reason,
                    )

                async for raw_line in response.content:
                    line = raw_line.decode("utf-8", errors="ignore").strip()
                    if not line or line.startswith(":"):
                        continue

                    if line.startswith("data:"):
                        data = line[5:].strip()
                    else:
                        # 兼容直接逐行返回 JSON 的非标准实现。
                        data = line

                    if not data:
                        continue
                    if data == "[DONE]":
                        break

                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    usage = chunk.get("usage")
                    if isinstance(usage, dict):
                        completion_tokens = usage.get("completion_tokens")
                        if isinstance(completion_tokens, int):
                            reported_tokens = completion_tokens

                    text = extract_delta_text(chunk)
                    if text:
                        if ttft is None:
                            ttft = time.perf_counter() - started
                        output_parts.append(text)

                total_time = time.perf_counter() - started
                output_text = "".join(output_parts)
                if reported_tokens is not None:
                    output_tokens = reported_tokens
                    token_source = "upstream_usage"
                else:
                    output_tokens = count_tokens(output_text, encoder)
                    token_source = "local"

                generation_time = None
                output_speed = None
                if ttft is not None and output_tokens > 0:
                    generation_time = max(total_time - ttft, 0.001)
                    output_speed = output_tokens / generation_time

                return RequestResult(
                    index=index,
                    success=True,
                    status=status,
                    ttft=ttft,
                    total_time=total_time,
                    output_tokens=output_tokens,
                    output_speed=output_speed,
                    token_source=token_source,
                )

        except asyncio.TimeoutError:
            total_time = time.perf_counter() - started
            return RequestResult(
                index=index,
                success=False,
                status=status,
                ttft=ttft,
                total_time=total_time,
                output_tokens=0,
                output_speed=None,
                error=f"请求超时，超过 {args.timeout:.1f}s",
            )
        except aiohttp.ClientError as exc:
            total_time = time.perf_counter() - started
            return RequestResult(
                index=index,
                success=False,
                status=status,
                ttft=ttft,
                total_time=total_time,
                output_tokens=0,
                output_speed=None,
                error=f"{type(exc).__name__}: {exc}",
            )
        except Exception as exc:
            total_time = time.perf_counter() - started
            return RequestResult(
                index=index,
                success=False,
                status=status,
                ttft=ttft,
                total_time=total_time,
                output_tokens=0,
                output_speed=None,
                error=f"{type(exc).__name__}: {exc}",
            )


async def run_batch(
    count: int,
    args: argparse.Namespace,
    session: aiohttp.ClientSession,
    headers: dict[str, str],
    encoder: Any,
    start_index: int = 1,
) -> list[RequestResult]:
    semaphore = asyncio.Semaphore(args.concurrency)
    tasks = [
        asyncio.create_task(
            run_one_request(
                index=start_index + offset,
                args=args,
                session=session,
                semaphore=semaphore,
                headers=headers,
                encoder=encoder,
            )
        )
        for offset in range(count)
    ]
    return await asyncio.gather(*tasks)


def fmt_seconds(value: float | None) -> str:
    return "N/A" if value is None else f"{value:.3f}s"


def fmt_rate(value: float | None) -> str:
    return "N/A" if value is None else f"{value:.2f} tokens/s"


def build_summary(
    args: argparse.Namespace,
    results: list[RequestResult],
    wall_time: float,
) -> dict[str, Any]:
    successes = [item for item in results if item.success]
    failures = [item for item in results if not item.success]
    ttfts = [item.ttft for item in successes if item.ttft is not None]
    total_times = [item.total_time for item in successes]
    speeds = [item.output_speed for item in successes if item.output_speed is not None]

    total_tokens = sum(item.output_tokens for item in successes)
    success_count = len(successes)
    request_count = len(results)
    throughput = success_count / wall_time if wall_time > 0 else 0.0
    success_rate = success_count / request_count * 100 if request_count else 0.0

    return {
        "endpoint": args.url,
        "model": args.model,
        "concurrency": args.concurrency,
        "requests": request_count,
        "success": success_count,
        "failure": len(failures),
        "success_rate": success_rate,
        "wall_time_seconds": wall_time,
        "throughput_req_per_second": throughput,
        "throughput_req_per_minute": throughput * 60,
        "status_distribution": dict(sorted(Counter(item.status for item in results).items())),
        "total_output_tokens": total_tokens,
        "ttft": {
            "average": sum(ttfts) / len(ttfts) if ttfts else None,
            "p50": percentile(ttfts, 0.50),
            "p95": percentile(ttfts, 0.95),
            "p99": percentile(ttfts, 0.99),
        },
        "total_latency": {
            "average": sum(total_times) / len(total_times) if total_times else None,
            "p50": percentile(total_times, 0.50),
            "p95": percentile(total_times, 0.95),
            "p99": percentile(total_times, 0.99),
        },
        "output_speed": {
            "average": sum(speeds) / len(speeds) if speeds else None,
            "p50": percentile(speeds, 0.50),
        },
    }


def print_report(
    args: argparse.Namespace,
    results: list[RequestResult],
    summary: dict[str, Any],
) -> None:
    print("\n========== GPT 流式压测结果 ==========")
    print(f"接口地址:          {summary['endpoint']}")
    print(f"模型:              {summary['model']}")
    print(f"并发数:            {summary['concurrency']}")
    print(f"总请求数:          {summary['requests']}")
    print(f"成功:              {summary['success']}")
    print(f"失败:              {summary['failure']}")
    print(f"成功率:            {summary['success_rate']:.2f}%")
    print(f"压测总耗时:        {summary['wall_time_seconds']:.2f}s")
    print(f"吞吐量:            {summary['throughput_req_per_second']:.2f} req/s")
    print(f"每分钟吞吐:        {summary['throughput_req_per_minute']:.2f} req/min")
    print(f"状态分布:          {summary['status_distribution']}")
    print(f"总输出 Tokens:     {summary['total_output_tokens']}")

    print("\n首 Token 延迟 TTFT")
    print(f"  平均:             {fmt_seconds(summary['ttft']['average'])}")
    print(f"  P50:              {fmt_seconds(summary['ttft']['p50'])}")
    print(f"  P95:              {fmt_seconds(summary['ttft']['p95'])}")
    print(f"  P99:              {fmt_seconds(summary['ttft']['p99'])}")

    print("\n完整响应耗时")
    print(f"  平均:             {fmt_seconds(summary['total_latency']['average'])}")
    print(f"  P50:              {fmt_seconds(summary['total_latency']['p50'])}")
    print(f"  P95:              {fmt_seconds(summary['total_latency']['p95'])}")
    print(f"  P99:              {fmt_seconds(summary['total_latency']['p99'])}")

    print(f"\n平均输出速度:      {fmt_rate(summary['output_speed']['average'])}")
    print(f"P50 输出速度:       {fmt_rate(summary['output_speed']['p50'])}")

    failures = [item for item in results if not item.success]
    if failures:
        limit = max(0, args.show_failures)
        print(f"\n前 {min(limit, len(failures))} 条失败记录：")
        for item in failures[:limit]:
            error = (item.error or "未知错误").strip()
            print(f"  #{item.index} status={item.status} error={error}")

    if tiktoken is None:
        print("\n提示：未安装 tiktoken，若上游未返回 usage，输出 Token 将使用字符数估算。")


async def async_main(args: argparse.Namespace) -> int:
    try:
        extra_headers = parse_extra_headers(args.header)
    except ValueError as exc:
        print(f"参数错误：{exc}", file=sys.stderr)
        return 2

    headers = {
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
        "User-Agent": "gpt-stream-load-test/1.0",
        **extra_headers,
    }
    if args.api_key:
        headers.setdefault("Authorization", f"Bearer {args.api_key}")

    timeout = aiohttp.ClientTimeout(
        total=args.timeout,
        connect=args.connect_timeout,
        sock_connect=args.connect_timeout,
        sock_read=args.timeout,
    )

    ssl_context: ssl.SSLContext | bool | None = None
    if args.insecure:
        ssl_context = False

    connector = aiohttp.TCPConnector(
        limit=max(args.concurrency, 1),
        limit_per_host=max(args.concurrency, 1),
        ttl_dns_cache=300,
        enable_cleanup_closed=True,
        ssl=ssl_context,
    )
    encoder = make_token_encoder(args.model)

    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        if args.warmup:
            print(f"正在预热 {args.warmup} 个请求……")
            await run_batch(
                count=args.warmup,
                args=args,
                session=session,
                headers=headers,
                encoder=encoder,
                start_index=1_000_001,
            )

        print(
            f"开始压测：model={args.model} concurrency={args.concurrency} "
            f"requests={args.requests}"
        )
        wall_started = time.perf_counter()
        results = await run_batch(
            count=args.requests,
            args=args,
            session=session,
            headers=headers,
            encoder=encoder,
            start_index=1,
        )
        wall_time = time.perf_counter() - wall_started

    summary = build_summary(args, results, wall_time)
    print_report(args, results, summary)

    if args.json_output:
        output_path = Path(args.json_output).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        report = {
            "summary": summary,
            "config": {
                "url": args.url,
                "model": args.model,
                "concurrency": args.concurrency,
                "requests": args.requests,
                "warmup": args.warmup,
                "max_tokens": args.max_tokens,
                "max_tokens_field": args.max_tokens_field,
                "temperature": args.temperature,
                "timeout": args.timeout,
                "same_prompt": args.same_prompt,
                "stream_usage": args.stream_usage,
            },
            "results": [asdict(item) for item in results],
        }
        output_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"\nJSON 报告已保存：{output_path}")

    # 有失败请求时返回非 0，方便 CI/CD 判断。
    return 0 if summary["failure"] == 0 else 1


def main() -> None:
    args = parse_args()
    try:
        exit_code = asyncio.run(async_main(args))
    except KeyboardInterrupt:
        print("\n压测已手动终止。", file=sys.stderr)
        exit_code = 130
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
