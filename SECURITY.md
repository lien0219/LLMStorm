# Security policy

## Supported versions

Security fixes are applied to the latest version on the default branch.

## Reporting a vulnerability

Please do not disclose vulnerabilities in a public issue. Use the repository's
private GitHub Security Advisory reporting flow instead. Include reproduction
steps, affected configuration, impact, and any suggested mitigation.

## Deployment boundary

LLMStorm sends user-provided credentials and prompts to user-provided upstream
URLs. Operators of a hosted LLMStorm instance can technically observe traffic
at the server boundary even though this project does not persist keys or request
bodies. Self-host the service when credentials must not transit a third-party
deployment.

Always set `LLMSTORM_PUBLIC_MODE=1` on an internet-facing instance. Public mode
blocks private and special-purpose target addresses, disables insecure TLS, and
requires HTTPS upstream targets, and supports server-side concurrency caps. Keep the service behind TLS and apply
additional authentication or network access controls for private deployments.
