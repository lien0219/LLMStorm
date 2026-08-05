# Production deployment

## Docker

```bash
docker build -t llmstorm:latest .
docker run --rm -p 8765:8765 \
  -e LLMSTORM_PUBLIC_MODE=1 \
  -e LLMSTORM_MAX_CONCURRENCY=500 \
  -e LLMSTORM_MAX_ACTIVE_TESTS=2 \
  llmstorm:latest
```

Or use `docker compose up -d --build`.

## Environment variables

| Variable | Default | Purpose |
| --- | ---: | --- |
| `HOST` | `127.0.0.1` locally | Listen address |
| `PORT` | `8765` | Listen port |
| `LLMSTORM_PUBLIC_MODE` | `0` locally, `1` in Docker | Block private targets and insecure TLS |
| `LLMSTORM_MAX_CONCURRENCY` | `5000` locally, `500` in public mode | Per-test concurrency ceiling |
| `LLMSTORM_MAX_ACTIVE_TESTS` | `2` | Maximum simultaneous test jobs |

Public mode accepts HTTPS upstream targets only. Run the application in local
mode when an authorized private-network or plain-HTTP relay must be tested.

## Reverse proxy requirements

- Terminate HTTPS at the proxy or load balancer.
- Disable response buffering for `/api/test`; it is an SSE stream.
- Set request and upstream timeouts above the configured per-request timeout.
- Preserve cancellation when the client disconnects.
- Add authentication or an IP allowlist if the deployment is not intended for
  unrestricted public use.

Do not deploy this application as a static GitHub Pages site: the browser UI
requires the Python service to keep API keys out of frontend requests and to
execute concurrent upstream calls.
