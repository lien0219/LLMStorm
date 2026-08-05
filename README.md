# LLMStorm

[English](README.en.md) | 简体中文

LLMStorm 是一个本地优先、支持公开部署的大模型中转站并发测试工具。它通过逐档提升并发，实时展示成功率、吞吐量、TTFT/P95 延迟、HTTP 状态分布和失败详情，并给出建议稳定并发。

## 功能

- OpenAI Chat Completions、Anthropic Messages、Gemini 原生流式协议
- GPT、Claude / Claude Code、Gemini、DeepSeek、Qwen、GLM、Kimi、MiniMax、Grok、Mistral 精确模型 ID 预设
- 始终可用的自定义模型 ID
- `1 → 25% → 50% → 75% → 最大值` 阶梯压测
- SSE 实时进度、可中止测试、结果复制
- 中文 / English 实时切换，包括动态日志和校验信息
- API Key 仅保存在单次请求内存，不写入文件或浏览器存储
- 公网模式 SSRF 防护、TLS 限制、并发上限和全局任务数限制
- Docker、Compose、GitHub Actions CI 和自动化测试

## 架构

厂商协议使用独立适配器，模型目录由共享 JSON 配置驱动，压测策略由后端统一下发给前端。新增模型不需要修改主前端脚本，新增协议也不需要改动压测调度核心。模块职责和扩展流程见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 本地启动

需要 Python 3.11 或更高版本。

```powershell
python -m pip install -r requirements.txt
python web_app.py
```

浏览器打开 <http://127.0.0.1:8765>。

局域网访问：

```powershell
python web_app.py --host 0.0.0.0 --port 8765
```

## Docker

```bash
docker compose up -d --build
```

Compose 默认启用公网安全模式，并将单次最大并发限制为 500。详细说明见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 测试方式

设最大并发为 `N` 时，工具测试去重后的 `1、25% N、50% N、75% N、N`。每档同时发起与该档并发数相等的一轮请求。建议值是成功率不低于 95% 的最高已测档位。

滑杆用于 1–500 快选，刻度按真实线性位置显示；数值框可输入服务端允许范围内的任意整数。本地默认上限 5000，公开部署默认上限 500。

这是一轮快速容量探测，不等同于长时间稳定性压测。真实模型调用可能产生费用，请从小并发开始。

## 安全边界

- 本项目不持久化 Key、提示词或测试结果。
- 托管服务的运营者在网络边界上仍有能力观察流量。敏感 Key 应使用自托管实例。
- 任何互联网公开部署都必须启用 `LLMSTORM_PUBLIC_MODE=1`。
- 仅测试自己拥有或已获得明确授权的服务。

漏洞请通过 GitHub Security Advisory 私下报告，参见 [SECURITY.md](SECURITY.md)。

## 验证

```powershell
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

## 贡献与许可

贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。项目采用 [MIT License](LICENSE)。

原有命令行工具仍可通过 `python gpt_concurrency_test.py --help` 使用；其可选 Token 统计依赖保留在 `requirements-gpt-load-test.txt`。
