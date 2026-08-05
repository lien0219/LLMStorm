# LLMStorm 生产部署指南

简体中文 | [English](DEPLOYMENT.md)

本文档适用于把 LLMStorm 部署到 Linux 服务器。推荐架构为：

```text
浏览器 --HTTPS--> Nginx / Caddy / Cloudflare Tunnel --HTTP--> 127.0.0.1:8765
                                                             |
                                                             +--> HTTPS 模型接口
                                                             +--> /data/site-stats.db
```

推荐直接运行 GHCR 中已发布的多架构镜像，并把版本固定为明确的发布版本。当前项目版本为
`1.3.2`，镜像支持 `linux/amd64` 和 `linux/arm64`。

> [!IMPORTANT]
> LLMStorm 不是静态网站，不能部署到 GitHub Pages 或 Cloudflare Pages。Python 服务需要
> 执行并发上游请求、输出 SSE 事件、统计在线连接并落实服务端安全限制。

## 1. 部署前准备

服务器需要：

- Linux x86_64 或 ARM64；
- Docker Engine 及 Docker Compose v2；
- 可访问 `ghcr.io` 和待测试模型接口的出站网络；
- 一个域名和 HTTPS 反向代理（公网部署时强烈建议）；
- 足够的文件描述符、出站连接数和带宽，实际消耗取决于测试并发数。

检查 Docker：

```bash
docker --version
docker compose version
```

应用不保存 API Key、提示词或测试结果。总浏览量和总点赞量使用内置 SQLite 保存到
`llmstorm-data` 数据卷；实时在线会话只保存在内存中，连接断开或服务重启后自动清理。

### 实时站点统计说明

压测工具、站点推荐、AI 服务和支持页面都会显示同一组站点统计：

- **实时在线**：浏览器通过 `/api/stats/events` 建立 SSE 长连接，同一浏览器的多个标签页
  使用持久访客 ID 去重。真实在线少于 10 时，页面显示 10–20 之间的平滑人数，每
  18–36 秒只变化 1；真实在线达到 10 后立即显示真实数量并停止模拟波动。
- **总浏览量**：每打开或刷新一个站内页面计为一次访问。
- **总点赞量**：只能增加，允许同一访客重复点赞；点赞事件会实时广播给当前在线页面。
- **数字显示**：最多显示七位数字，超过后显示 `9,999,999+`，悬浮可查看具体数量。

> [!NOTE]
> 当前在线会话保存在单个应用进程的内存中，因此生产环境应保持一个 LLMStorm 应用副本。
> 多副本部署不会自动汇总各实例的在线人数和点赞广播；如需横向扩容，应先接入外部共享
> 状态与消息系统。

## 2. 使用 GHCR 镜像部署（推荐）

### 2.1 创建部署目录

```bash
sudo install -d -m 0750 /opt/llmstorm
cd /opt/llmstorm
sudo curl -fsSLo compose.production.yaml \
  https://raw.githubusercontent.com/lien0219/LLMStorm/main/compose.production.yaml
sudo curl -fsSLo .env.production \
  https://raw.githubusercontent.com/lien0219/LLMStorm/main/.env.production.example
sudo chmod 0600 .env.production
```

编辑 `/opt/llmstorm/.env.production`：

```dotenv
LLMSTORM_IMAGE=ghcr.io/lien0219/llmstorm
LLMSTORM_VERSION=1.3.2

# 使用反向代理时仅监听本机，避免绕过 HTTPS 和访问控制。
LLMSTORM_BIND_ADDRESS=127.0.0.1
LLMSTORM_HOST_PORT=8765

# 互联网可访问的实例必须开启。
LLMSTORM_PUBLIC_MODE=1
LLMSTORM_MAX_CONCURRENCY=500
LLMSTORM_MAX_ACTIVE_TESTS=2

LLMSTORM_PRICING_CACHE_SECONDS=21600
LLMSTORM_PRICING_TIMEOUT_SECONDS=12

# 浏览量与点赞量持久化位置；应位于 llmstorm-data 数据卷中。
LLMSTORM_STATS_DB=/data/site-stats.db
```

生产环境应固定 `1.3.2` 这类明确版本，以便可靠回滚。`latest` 会随新版本移动，`main`
用于预发布，两者都不建议用于需要可重复部署的生产环境。

### 2.2 拉取并启动

```bash
cd /opt/llmstorm
sudo docker compose --env-file .env.production -f compose.production.yaml pull
sudo docker compose --env-file .env.production -f compose.production.yaml up -d
sudo docker compose --env-file .env.production -f compose.production.yaml ps
```

若 GHCR 包为私有状态，请先创建一个只有 `read:packages` 权限的 GitHub Token，再登录：

```bash
printf '%s' "$GHCR_TOKEN" | \
  sudo docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

不要把 Token 直接写入命令或 Compose 文件。

### 2.3 验证服务

在服务器本机执行：

```bash
curl --fail --silent --show-error http://127.0.0.1:8765/api/health
curl --fail --silent --show-error http://127.0.0.1:8765/api/config
curl --fail --silent --show-error http://127.0.0.1:8765/api/stats
```

健康接口应返回类似内容：

```json
{"ok": true, "service": "LLMStorm", "version": "1.3.2"}
```

统计接口应返回 `online`、`views` 和 `likes` 等字段。首次部署时浏览量和点赞量可以从 0
开始；浏览器打开页面后，浏览量应增加，并建立在线 SSE 连接。

继续检查容器状态和日志：

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml ps
sudo docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 llmstorm
```

## 3. 配置 HTTPS 反向代理

公网实例必须在代理或负载均衡层终止 HTTPS，并建议额外使用 HTTP 认证、IP 白名单或
Cloudflare Access。不要直接把 `8765` 端口暴露到公网。

### Nginx 示例

下面配置假设证书已经由 Certbot 或其他证书系统安装：

```nginx
server {
    listen 443 ssl http2;
    server_name llmstorm.example.com;

    ssl_certificate     /etc/letsencrypt/live/llmstorm.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/llmstorm.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 压测进度和在线统计通过 SSE 持续返回，不能缓冲。
    location ~ ^/api/(test|stats/events)$ {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

server {
    listen 80;
    server_name llmstorm.example.com;
    return 301 https://$host$request_uri;
}
```

校验并重载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://llmstorm.example.com/api/health
```

其他反向代理也必须满足以下要求：

- 对 `/api/test` 和 `/api/stats/events` 关闭响应缓冲，允许 SSE 实时刷新；
- 上游读取超时要覆盖一次完整压测，而不只是单个请求的超时；
- 客户端断开后正常向后端传递连接关闭；
- 保留 HTTPS，并在服务前增加访问认证或来源限制。

## 4. 生产环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LLMSTORM_IMAGE` | `ghcr.io/lien0219/llmstorm` | 容器镜像地址 |
| `LLMSTORM_VERSION` | `1.3.2` | 要部署的镜像标签；生产环境应固定版本 |
| `LLMSTORM_BIND_ADDRESS` | `127.0.0.1` | 映射到宿主机的监听地址 |
| `LLMSTORM_HOST_PORT` | `8765` | 映射到宿主机的端口 |
| `LLMSTORM_PUBLIC_MODE` | `1` | 开启公网安全限制 |
| `LLMSTORM_MAX_CONCURRENCY` | `500` | 单次测试允许的最大并发数 |
| `LLMSTORM_MAX_ACTIVE_TESTS` | `2` | 全局同时运行的测试任务数，范围为 1–20 |
| `LLMSTORM_PRICING_CACHE_SECONDS` | `21600` | 在线模型价格缓存时长，范围为 60–604800 秒 |
| `LLMSTORM_PRICING_TIMEOUT_SECONDS` | `12` | 在线价格刷新超时，范围为 1–60 秒 |
| `LLMSTORM_STATS_DB` | `/data/site-stats.db` | 浏览量与点赞量 SQLite 文件（容器内路径） |

`LLMSTORM_PUBLIC_MODE=1` 时，服务仅允许 HTTPS 上游，禁止跳过证书验证，并阻止访问
私有、回环、链路本地及保留地址，以降低 SSRF 风险。只有完全受信任的内网自托管实例
才应考虑设为 `0`。

并发限制会直接影响服务器和模型中转站的负载。公网实例建议先使用较小值，并结合 CPU、
内存、出口带宽、文件描述符上限以及上游配额逐步调整。

## 5. 升级与回滚

升级前记录当前版本，并确认服务器上的 `compose.production.yaml` 已包含
`llmstorm-data:/data` 数据卷和 `LLMSTORM_STATS_DB`。从不带站点统计的旧版本升级时，先
备份自定义 Compose 文件，再与仓库最新版本合并；否则只更新镜像会因只读根文件系统而
无法创建 SQLite 文件。

修改 `/opt/llmstorm/.env.production` 中的 `LLMSTORM_VERSION` 后执行：

```bash
cd /opt/llmstorm
sudo docker compose --env-file .env.production -f compose.production.yaml pull
sudo docker compose --env-file .env.production -f compose.production.yaml up -d
sudo docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail http://127.0.0.1:8765/api/health
```

如需回滚，把 `LLMSTORM_VERSION` 改回上一版本，再执行同一组命令。Compose 升级和
`down` 不会删除 `llmstorm-data` 命名卷，浏览量和点赞量会继续保留。备份范围包括
`.env.production`、`compose.production.yaml`、反向代理配置和该数据卷；不要使用
`docker compose down -v`，除非明确要删除统计数据。

### 备份统计数据

SQLite 支持在线一致性备份。以下命令先在容器的临时目录生成快照，再复制到部署目录：

```bash
cd /opt/llmstorm
sudo docker compose --env-file .env.production -f compose.production.yaml exec -T llmstorm \
  python -c "import sqlite3; s=sqlite3.connect('/data/site-stats.db'); b=sqlite3.connect('/tmp/site-stats.backup.db'); s.backup(b); b.close(); s.close()"
container_id="$(sudo docker compose --env-file .env.production -f compose.production.yaml ps -q llmstorm)"
sudo docker cp "$container_id:/tmp/site-stats.backup.db" "./site-stats-$(date +%F).db"
```

定期备份生成的数据库文件，并将其保存到服务器之外。恢复前应停止 LLMStorm，再把备份
文件恢复到 `llmstorm-data` 卷中的 `/data/site-stats.db`，同时保持文件归容器内
`llmstorm` 用户可写。

## 6. 从源码构建

需要验证未发布改动时，可以在服务器上从当前源码构建：

```bash
git clone https://github.com/lien0219/LLMStorm.git
cd LLMStorm
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:8765/api/health
```

仓库根目录的 `compose.yaml` 面向本地构建和测试，会把 `8765` 暴露到所有宿主机接口。
生产环境请优先使用 `compose.production.yaml`，并保持
`LLMSTORM_BIND_ADDRESS=127.0.0.1`。

不使用 Docker 时，也可以直接运行 Python 3.11 或更高版本：

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
HOST=127.0.0.1 PORT=8765 LLMSTORM_PUBLIC_MODE=1 \
  LLMSTORM_STATS_DB=./data/site-stats.db python web_app.py
```

生产环境裸机运行时，应另外创建专用低权限用户和 systemd 服务，并通过反向代理提供
HTTPS；Docker 方案已内置非 root 用户、只读根文件系统、健康检查、能力删除和日志轮转，
因此更推荐。

## 7. 运维命令

```bash
# 查看状态
sudo docker compose --env-file .env.production -f compose.production.yaml ps

# 持续查看日志
sudo docker compose --env-file .env.production -f compose.production.yaml logs -f llmstorm

# 重启
sudo docker compose --env-file .env.production -f compose.production.yaml restart llmstorm

# 停止并移除容器；配置文件仍保留在 /opt/llmstorm
sudo docker compose --env-file .env.production -f compose.production.yaml down
```

## 8. 常见问题

### 镜像拉取失败

- 确认服务器能访问 `ghcr.io`；
- 确认镜像标签存在；
- 私有包需要先执行 `docker login ghcr.io`，Token 需要 `read:packages` 权限。

### 页面可访问，但压测进度不实时更新

通常是反向代理缓冲了 SSE。确认 `/api/test` 和 `/api/stats/events` 已设置
`proxy_buffering off`，且代理读取超时时间足够长。

### 在线人数、浏览量或点赞量不更新

- 确认 `/api/stats` 可以返回 JSON；
- 确认 `/api/stats/events` 没有被代理缓冲或提前断开；
- 检查浏览器控制台和容器日志；
- 在线人数依赖持续的 SSE 连接，浏览器关闭页面后会从在线统计中移除；
- 真实在线少于 10 时看到 10–20 的缓慢波动属于预期行为。

### 升级后浏览量或点赞量归零

确认 Compose 仍挂载 `llmstorm-data:/data`，且 `LLMSTORM_STATS_DB` 为
`/data/site-stats.db`。检查是否误执行过 `docker compose down -v`、删除过命名卷，或
把多个部署放在不同的 Compose project name 下而创建了新的数据卷。

### 公网模式拒绝目标地址

公网模式只允许解析到全局公网 IP 的 HTTPS 上游。如果要测试内网、回环地址或自签名
证书，请只在受信任的内网实例中使用 `LLMSTORM_PUBLIC_MODE=0`，不要把该实例暴露到公网。

### 容器反复重启或健康检查失败

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml ps
sudo docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 llmstorm
sudo ss -lntp | grep 8765
```

检查宿主机端口冲突、环境变量格式以及容器到外部模型接口的网络连通性。

## 9. 镜像标签与发布

`Publish container` 工作流在推送 `main`、推送语义化版本标签或手动触发时运行。

| Git 事件 | 镜像标签示例 | 用途 |
| --- | --- | --- |
| 推送 `main` | `main`、`main-v1.3.2`、`sha-4e1577b` | 预发布和按提交排查问题 |
| 推送 `v1.3.2` | `v1.3.2`、`1.3.2`、`1.3`、`1`、`latest`、`sha-4e1577b` | 正式生产版本 |

发布新版本时，先按语义化版本规则更新 `llmstorm/__init__.py` 中的 `__version__` 并完成
测试，再创建完全一致的 Git 标签：

```bash
git tag -a v1.3.2 -m "LLMStorm v1.3.2"
git push origin v1.3.2
```

工作流会构建 `linux/amd64` 和 `linux/arm64` 镜像，附加 OCI 元数据、SBOM 和构建来源
证明。Git 标签与应用版本不一致时，发布会失败。
