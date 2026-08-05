# 生产部署指南

简体中文 | [English](DEPLOYMENT.md)

LLMStorm 会自动把多架构镜像发布到 GitHub Container Registry（GHCR）。生产
Compose 文件只拉取已构建镜像，运行配置独立保存，并可固定明确版本以支持可靠回滚。

## 自动生成的镜像标签

`Publish container` 工作流会在推送 `main`、推送语义化版本标签或手动触发时运行。

| Git 事件 | 镜像标签示例 | 用途 |
| --- | --- | --- |
| 推送 `main` | `main`、`main-v1.1.0`、`sha-bba5b7d` | 预发布和按提交排查问题 |
| 推送 `v1.1.0` | `v1.1.0`、`1.1.0`、`1.1`、`1`、`latest`、`sha-bba5b7d` | 正式生产版本 |

工作流同时构建 `linux/amd64` 与 `linux/arm64`，写入 OCI 元数据，并生成 SBOM
和构建来源证明。版本标签必须和 `llmstorm/__init__.py` 一致，否则停止发布。

## 发布新版本

1. 按语义化版本规则更新 `llmstorm/__init__.py` 中的 `__version__`。
2. 完成测试，把版本变更推送到 `main`。
3. 创建并推送完全一致的版本标签：

```bash
git tag -a v1.1.0 -m "LLMStorm v1.1.0"
git push origin v1.1.0
```

GitHub Actions 会自动完成打包与发布。GHCR 包首次创建后可能是私有状态；如需服务器
匿名拉取，请进入 GitHub 包设置，将可见性修改为 **Public**。

网页页脚会通过 `/api/health` 读取 `llmstorm/__init__.py` 中的版本号，因此发布并部署
新版本后会自动同步显示，无需修改任何前端页面。

## 部署到 Linux 服务器

服务器需要安装 Docker Engine 和 Compose v2，并建议使用 Nginx、Caddy 或
Cloudflare Tunnel 提供 HTTPS 与访问认证。

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
```

生产环境应将 `LLMSTORM_VERSION` 固定为 `1.1.0` 这类明确版本；`main` 仅用于预发布。

若镜像包保持私有，可创建一个仅有 `read:packages` 权限的 GitHub Token，并避免把
Token 直接写进命令历史：

```bash
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

## 升级与回滚

修改 `/opt/llmstorm/.env.production` 中的 `LLMSTORM_VERSION`，然后执行：

```bash
cd /opt/llmstorm
sudo docker compose --env-file .env.production -f compose.production.yaml pull
sudo docker compose --env-file .env.production -f compose.production.yaml up -d
sudo docker compose --env-file .env.production -f compose.production.yaml ps
```

回滚时把版本号改回上一版本，再运行相同命令。环境配置位于镜像外，不会随升级丢失。

## 生产配置

| 变量 | 默认值 | 说明 |
| --- | ---: | --- |
| `LLMSTORM_IMAGE` | `ghcr.io/lien0219/llmstorm` | GHCR 镜像地址 |
| `LLMSTORM_VERSION` | `1.1.0` | 要部署的镜像版本 |
| `LLMSTORM_BIND_ADDRESS` | `127.0.0.1` | 暴露给反向代理的宿主机地址 |
| `LLMSTORM_HOST_PORT` | `8765` | 宿主机端口 |
| `LLMSTORM_PUBLIC_MODE` | `1` | 开启 HTTPS 限制和 SSRF 防护 |
| `LLMSTORM_MAX_CONCURRENCY` | `500` | 单次测试最大并发 |
| `LLMSTORM_MAX_ACTIVE_TESTS` | `2` | 全局同时测试任务数 |
| `LLMSTORM_PRICING_CACHE_SECONDS` | `21600` | 在线模型价格缓存时间 |
| `LLMSTORM_PRICING_TIMEOUT_SECONDS` | `12` | 在线价格刷新超时时间 |

## 反向代理要求

- 在代理或负载均衡层终止 HTTPS。
- 对 `/api/test` 关闭响应缓冲，保证 SSE 实时输出。
- 请求和上游超时必须大于测试配置的超时时间。
- 浏览器断开时应继续向后端传递取消信号。
- 使用 Cloudflare Access、HTTP 认证或 IP 白名单保护服务。
- 除非确实需要直接访问，否则保持 `8765` 仅绑定回环地址。

不要把项目当作静态站点部署到 GitHub Pages 或 Cloudflare Pages。Python 服务负责
执行并发上游请求并落实服务端安全限制，是运行时必需组件。
