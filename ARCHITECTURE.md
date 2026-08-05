# Architecture

LLMStorm keeps transport protocols, benchmark orchestration, HTTP delivery, and
browser rendering separate so each can evolve independently.

## Runtime flow

1. `web_app.py` validates the browser request and enforces deployment limits.
2. `load_test_engine.py` builds the concurrency ramp and coordinates requests.
3. `llmstorm/providers/` resolves endpoints, builds provider-specific requests,
   and extracts text from streaming chunks.
4. Progress and the final summary are emitted to the browser as SSE events.
5. `static/api.js` parses the event stream and `static/monitor.js` renders it.

## Module ownership

| Area | Source of truth |
| --- | --- |
| Version | `llmstorm/__init__.py` |
| Benchmark thresholds and limits | `llmstorm/policy.py` |
| Provider/model labels and presets | `static/model_catalog.json` |
| Provider protocol behavior | `llmstorm/providers/` |
| API, security controls, and SSE | `web_app.py` |
| Load orchestration and metrics | `load_test_engine.py` |
| Browser API transport | `static/api.js` |
| Browser catalog rendering | `static/catalog.js` |
| Browser result rendering | `static/monitor.js` |
| Translations | `static/i18n.js` |

The API validates the model catalog at startup/read time. Catalog provider IDs
must match the adapter registry, and duplicate provider or model IDs fail fast.

## Adding a provider

When the provider uses an existing OpenAI-compatible protocol:

1. Register its public provider ID in `llmstorm/providers/__init__.py`.
2. Add its label, placeholder, groups, and model IDs to
   `static/model_catalog.json`.
3. Add any new group-label translation key to `static/i18n.js`.
4. Add an adapter/catalog consistency test.

When the provider has a new protocol, also add one adapter implementing:

- `resolve_endpoint(raw_url, model)`
- `build_request(context)`
- `extract_text(chunk)`

The load engine and web route should not need provider-specific branches.

## Changing benchmark policy

Change policy constants in `llmstorm/policy.py`. The API publishes applicable
values through `/api/config`, so the browser labels, thresholds, slider range,
and ramp description stay synchronized with server behavior.

## Compatibility contracts

- Existing base URLs and full custom endpoints remain supported.
- `/api/test` is an SSE endpoint whose event names are `start`, `stage_start`,
  `progress`, `stage_complete`, `complete`, and `error`.
- API keys must never be placed in URLs, logs, result objects, or persistent
  browser storage.
- Public mode must keep private-address blocking and HTTPS enforcement enabled.

