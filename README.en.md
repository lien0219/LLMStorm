# LLMStorm

English | [简体中文](README.md)

LLMStorm is a local-first, deployable concurrency tester for LLM relay services. It progressively increases load, streams live progress, reports success rate, throughput, TTFT/P95 latency, status codes, and failures, then recommends a stable tested concurrency.

## Features

- OpenAI Chat Completions, Anthropic Messages, and native Gemini streaming
- Exact model ID presets for GPT, Claude / Claude Code, Gemini, DeepSeek, Qwen, GLM, Kimi, MiniMax, Grok, and Mistral
- A custom model ID option for every provider
- `1 → 25% → 50% → 75% → maximum` concurrency ramp
- Live SSE progress, cancellation, and result copying
- Live Chinese / English switching, including logs and validation messages
- API keys stay in request memory and are never persisted by the application
- Public-mode SSRF controls, TLS enforcement, per-test limits, and global job limits
- Docker, Compose, GitHub Actions CI, and automated tests

## Architecture

Provider protocols use independent adapters, the provider/model catalog is shared JSON, and the backend publishes benchmark policy to the browser. Updating model presets does not require editing the main UI script, and adding a protocol does not change the load orchestration core. See [ARCHITECTURE.md](ARCHITECTURE.md) for module ownership and extension steps.

## Run locally

Python 3.11 or newer is required.

```bash
python -m pip install -r requirements.txt
python web_app.py
```

Open <http://127.0.0.1:8765>.

## Docker

```bash
docker compose up -d --build
```

Compose enables public safety mode and caps each test at 500 concurrent requests by default. See [DEPLOYMENT.md](DEPLOYMENT.md) for production settings and reverse-proxy requirements.

## Test methodology

For a configured maximum `N`, LLMStorm tests the unique stages `1, 25% N, 50% N, 75% N, N`. Each stage sends one simultaneous wave containing as many requests as its concurrency. The recommendation is the highest tested stage with at least a 95% success rate.

The slider provides a precisely aligned 1–500 quick range. The number field accepts any integer within the server's configured limit: 5000 locally and 500 in public mode by default.

This is a fast capacity probe, not a soak test. Real model calls may incur charges; start small.

## Security boundary

- The application does not persist keys, prompts, or test results.
- A hosted service operator can still observe traffic at the server boundary. Self-host when credentials are sensitive.
- Set `LLMSTORM_PUBLIC_MODE=1` for every internet-facing deployment.
- Test only services you own or are explicitly authorized to test.

Report vulnerabilities privately through GitHub Security Advisories. See [SECURITY.md](SECURITY.md).

## Validate

```bash
python -m pip install -r requirements-dev.txt
python -m ruff check .
python -m mypy
python -m coverage run -m unittest discover -s tests -v
python -m coverage report
npm install
npx playwright install chromium
npm run check
npm run test:e2e
```

See [CONTRIBUTING.md](CONTRIBUTING.md). LLMStorm is released under the [MIT License](LICENSE).
