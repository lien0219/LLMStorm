# Production deployment

[简体中文](DEPLOYMENT.zh-CN.md) | English

LLMStorm publishes multi-platform images to GitHub Container Registry (GHCR).
The production Compose file pulls an existing image, keeps runtime configuration
outside the image, and can pin an exact release tag for predictable rollbacks.

The load-test, site-directory, AI-service, and support pages share live site
statistics. Browser SSE connections provide presence, while page views and likes
are stored in SQLite.

## Published image tags

The `Publish container` workflow runs on every push to `main`, every semantic
version tag, and manual dispatch.

| Git event | Example image tags | Intended use |
| --- | --- | --- |
| Push to `main` | `main`, `main-v1.3.2`, `sha-4e1577b` | Staging and commit-level diagnosis |
| Push tag `v1.3.2` | `v1.3.2`, `1.3.2`, `1.3`, `1`, `latest`, `sha-4e1577b` | Production releases |

The workflow builds `linux/amd64` and `linux/arm64`, attaches OCI metadata,
generates an SBOM and provenance attestation, and uses GitHub Actions cache.
A release tag must match `llmstorm/__init__.py`; a mismatch stops publication.

## Create a release

1. Update `__version__` in `llmstorm/__init__.py` using semantic versioning.
2. Run the project checks and push the version change to `main`.
3. Create and push the matching annotated tag:

```bash
git tag -a v1.3.2 -m "LLMStorm v1.3.2"
git push origin v1.3.2
```

The workflow publishes the versioned images automatically. The GHCR package may
initially be private; open the package settings on GitHub and change its
visibility to **Public** if anonymous server pulls are required.

The website footer reads the version from `/api/health`, whose source of truth is
`llmstorm/__init__.py`. After a new release is published and deployed, every page
shows the new version automatically without requiring frontend edits.

## Deploy on a Linux server

Requirements: Docker Engine with Compose v2 and a reverse proxy or Cloudflare
Tunnel providing HTTPS and authentication.

```bash
sudo install -d -m 0750 /opt/llmstorm
cd /opt/llmstorm
sudo curl -fsSLo compose.production.yaml \
  https://raw.githubusercontent.com/lien0219/LLMStorm/main/compose.production.yaml
sudo curl -fsSLo .env.production \
  https://raw.githubusercontent.com/lien0219/LLMStorm/main/.env.production.example
sudo chmod 0600 .env.production
sudo editor .env.production
sudo docker compose --env-file .env.production -f compose.production.yaml pull
sudo docker compose --env-file .env.production -f compose.production.yaml up -d
sudo docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail http://127.0.0.1:8765/api/health
curl --fail http://127.0.0.1:8765/api/stats
```

Keep `LLMSTORM_VERSION` pinned to an exact version such as `1.3.2` in
production. Use `main` only for staging.

If the package remains private, create a GitHub token with only `read:packages`
and log in without placing the token in shell history:

```bash
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

## Upgrade and rollback

Before upgrading from a release without site statistics, update the production
Compose file so it mounts `llmstorm-data:/data` and passes `LLMSTORM_STATS_DB`.
The root filesystem is read-only, so deploying only a new image with an old
Compose file cannot create the SQLite database.

Edit `LLMSTORM_VERSION` in `/opt/llmstorm/.env.production`, then run:

```bash
cd /opt/llmstorm
sudo docker compose --env-file .env.production -f compose.production.yaml pull
sudo docker compose --env-file .env.production -f compose.production.yaml up -d
sudo docker compose --env-file .env.production -f compose.production.yaml ps
```

Rollback uses the same commands after restoring the previous exact version.
Configuration is retained because it lives in `.env.production`, not the image.
The `llmstorm-data` volume is also retained unless `docker compose down -v` is
used.

## Environment variables

| Variable | Production default | Purpose |
| --- | ---: | --- |
| `LLMSTORM_IMAGE` | `ghcr.io/lien0219/llmstorm` | Registry image name |
| `LLMSTORM_VERSION` | `1.3.2` | Image tag to deploy |
| `LLMSTORM_BIND_ADDRESS` | `127.0.0.1` | Host interface exposed to the proxy |
| `LLMSTORM_HOST_PORT` | `8765` | Host-side port |
| `LLMSTORM_PUBLIC_MODE` | `1` | HTTPS enforcement and SSRF protection |
| `LLMSTORM_MAX_CONCURRENCY` | `500` | Per-test concurrency ceiling |
| `LLMSTORM_MAX_ACTIVE_TESTS` | `2` | Global simultaneous test jobs |
| `LLMSTORM_PRICING_CACHE_SECONDS` | `21600` | Online model-price cache lifetime |
| `LLMSTORM_PRICING_TIMEOUT_SECONDS` | `12` | Online price refresh timeout |
| `LLMSTORM_STATS_DB` | `/data/site-stats.db` | SQLite file for page-view and like counters |

## Reverse proxy requirements

- Terminate HTTPS at the proxy or load balancer.
- Disable proxy buffering for `/api/test` and `/api/stats/events`; both are SSE streams.
- Set request and upstream timeouts above the configured test timeout.
- Preserve cancellation when the client disconnects.
- Add Cloudflare Access, HTTP authentication, or an IP allowlist.
- Keep port `8765` bound to loopback unless direct access is intentional.

## Live statistics behavior

- `/api/stats/events` keeps one SSE presence connection per browser tab and
  deduplicates tabs with a persistent browser visitor ID.
- When real online presence is below 10, the displayed value moves by one every
  18–36 seconds within 10–20. At 10 or more real visitors, it immediately shows
  the real count and disables the simulated movement.
- Every site-page load or refresh increments total views.
- Likes are additive, repeatable, persisted, and broadcast to connected pages.
- Counters show at most seven digits; larger values render as `9,999,999+` with
  the exact count available on hover.

Live presence is process-local. Run one LLMStorm application replica unless an
external shared presence and messaging layer has been added; multiple replicas
do not automatically aggregate online presence or like events.

Do not deploy LLMStorm as a static GitHub Pages or Cloudflare Pages site. The
Python service is required to enforce server-side limits and execute concurrent
upstream requests.

The production Compose file stores page-view and like counters in the
`llmstorm-data` named volume. Live presence remains memory-only. Back up that
volume with the Compose and proxy configuration, and do not run
`docker compose down -v` unless deleting the counters is intentional.

If counters do not update, verify `/api/stats`, confirm that
`/api/stats/events` is not buffered or terminated by the reverse proxy, and
check that `LLMSTORM_STATS_DB=/data/site-stats.db` points into the mounted data
volume.
