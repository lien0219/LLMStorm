"use strict";

const PAGE_SIZE = 9;

const sites = [
  { name: "CCTK.AI", url: "https://cctk.ai/register?aff=SUB2API", category: "relay", source: "sub2api", tags: ["Claude", "OpenAI", "Gemini"], zh: "面向多模型调用的 API 网关，支持常见 AI 编程工具。", en: "A multi-model API gateway compatible with common AI coding tools." },
  { name: "OpenModel", url: "https://www.openmodel.ai?ref=sub2api", category: "relay", source: "sub2api", tags: ["Routing", "Claude", "Codex"], zh: "提供多模型统一接口、路由与故障切换能力。", en: "A unified model API with routing and failover features." },
  { name: "ETok.ai", url: "https://etok.ai", category: "tool", source: "sub2api", tags: ["Claude Code", "Gemini", "Codex"], zh: "AI 编程工具套餐与技术社区服务平台。", en: "AI coding tool plans and technical community services." },
  { name: "APIKEY.FUN", url: "https://apikey.fun/register?aff=SUB2API", category: "relay", source: "sub2api", tags: ["Claude", "OpenAI", "Gemini"], zh: "兼容多个主流模型协议的 API 接入服务。", en: "API access compatible with several mainstream model protocols." },
  { name: "AIGoCode", url: "https://aigocode.com/invite/SUB2API", category: "tool", source: "sub2api", tags: ["Claude Code", "Codex", "Gemini"], zh: "聚合多种 AI 编程能力与订阅方案。", en: "Aggregates multiple AI coding tools and subscription options." },
  { name: "BmoPlus", url: "https://shop.bmoplus.com/?utm_source=github", category: "tool", source: "sub2api", tags: ["Accounts", "Top-up"], zh: "AI 产品账号与充值服务商；购买前需独立核验条款和风险。", en: "AI account and top-up services; independently verify terms and risks before purchase." },
  { name: "Bestproxy", url: "https://bestproxy.com/?keyword=a2e8iuol", category: "tool", source: "sub2api", tags: ["Residential IP", "Proxy"], zh: "住宅代理与网络环境隔离服务。", en: "Residential proxy and isolated network environment services." },
  { name: "PatewayAI", url: "https://pateway.ai/?ch=1tsfr51", category: "relay", source: "sub2api", tags: ["Claude", "Codex", "Enterprise"], zh: "面向开发者和企业的 Claude、Codex API 接入服务。", en: "Claude and Codex API access for developers and enterprises." },
  { name: "PPToken.cc", url: "https://api.pptoken.cc/register?promo=SUB2API", category: "relay", source: "sub2api", tags: ["GPT", "Claude Code", "Gemini CLI"], zh: "支持 OpenAI 兼容客户端及多种 AI 编程工具的 API 服务。", en: "API access for OpenAI-compatible clients and multiple AI coding tools." },
  { name: "Veilx", url: "https://veilx.io/#/hello/SJRBRVDV", category: "tool", source: "sub2api", tags: ["CDN", "SSE", "API Traffic"], zh: "针对 AI API、流式响应和跨境链路场景的 CDN 服务。", en: "A CDN service for AI APIs, streaming responses, and cross-region traffic." },
  { name: "RoxyBrowser", url: "https://roxybrowser.com/invite/bgGKG7", category: "tool", source: "sub2api", tags: ["Browser", "Automation", "Residential IP"], zh: "提供浏览器自动化、AI Agent 与住宅代理能力。", en: "Browser automation, AI agent, and residential proxy capabilities." },
  { name: "随想 AI Gateway", url: "https://sui-xiang.com/", category: "relay", source: "sub2api", tags: ["Claude", "Codex", "Gemini"], zh: "支持 Claude、Codex、Gemini 等模型的 API 中转服务。", en: "API relay access for Claude, Codex, Gemini, and other models." },
  { name: "Proxy4Free", url: "https://www.proxy4free.com/?keyword=4yjqecpc", category: "tool", source: "sub2api", tags: ["Proxy", "Scraping", "Automation"], zh: "面向数据采集、浏览器自动化和 AI Agent 的代理服务。", en: "Proxy services for data collection, browser automation, and AI agents." },
  { name: "FastAIToken", url: "http://www.fastaitoken.com/register", category: "relay", source: "sub2api", tags: ["OpenAI", "Claude", "Gemini"], zh: "聚合 OpenAI、Claude、Gemini 等模型的 API 服务。", en: "Aggregated API access for OpenAI, Claude, Gemini, and other models." },
  { name: "Aimzoon", url: "http://aimzoon.com", category: "relay", source: "sub2api", tags: ["Codex", "Claude Code", "Gemini CLI"], zh: "面向 AI 编程工具的多模型 API 接入服务。", en: "Multi-model API access for AI coding tools." },
  { name: "Claude API", url: "https://console.claudeapi.com/agent/register/drTKjyn6wGLK061Z", category: "relay", source: "sub2api", tags: ["Claude", "Bedrock", "Agent"], zh: "专注 Claude 模型及 Agent 场景的第三方 API 服务。", en: "A third-party API service focused on Claude models and agent use cases." },
  { name: "code0.ai", url: "https://code0.ai/agent/register/LgpIgl9JHtVG53V1?utm_source=zcf&utm_medium=partner&utm_campaign=zcf_2026&utm_content=default", category: "tool", source: "sub2api", tags: ["Claude Code", "Codex", "Workbench"], zh: "面向开发者和团队的 AI 编程工作台。", en: "An AI coding workbench for developers and engineering teams." },
  { name: "Nagora", url: "https://nagora.ai/", category: "relay", source: "sub2api", tags: ["OpenAI", "Anthropic", "Gemini"], zh: "提供多模型统一接口、路由、预算和并发管理。", en: "A unified multi-model API with routing, budgets, and concurrency controls." },
  { name: "Novada", url: "https://www.novada.com/?sub2api/", category: "tool", source: "sub2api", tags: ["Proxy", "Web Unlocker", "Scraping"], zh: "住宅、ISP、数据中心和移动代理及数据采集 API。", en: "Residential, ISP, datacenter, and mobile proxies plus data collection APIs." },
  { name: "七牛云 AI", url: "https://s.qiniu.com/u6rQrq", category: "platform", source: "sub2api", tags: ["MaaS", "Multimodal", "Enterprise"], zh: "七牛云旗下大模型 MaaS 平台，提供多模态模型 API。", en: "Qiniu Cloud's MaaS platform for multimodal model APIs." },
  { name: "FennoAI", url: "https://api.fenno.ai/s/dC4k", category: "relay", source: "sub2api", tags: ["OpenAI", "Anthropic", "Enterprise"], zh: "兼容 OpenAI、Anthropic 协议的企业 API 接入服务。", en: "Enterprise API access compatible with OpenAI and Anthropic protocols." },
  { name: "LanoX AI", url: "https://lanox.ai/?c=6", category: "relay", source: "sub2api", tags: ["GPT", "Claude", "Gemini", "Multimodal"], zh: "覆盖文本、图像与视频模型的多模型 API 平台。", en: "A multi-model API platform spanning text, image, and video models." },
  { name: "OpenRouter", url: "https://openrouter.ai/", category: "relay", source: "mainstream", tags: ["Unified API", "Routing", "OpenAI-compatible"], zh: "通过统一 API 访问多家模型与推理提供商，并支持路由选择。", en: "A unified API for models and inference providers with routing controls." },
  { name: "SiliconFlow", url: "https://cloud.siliconflow.cn/", category: "platform", source: "mainstream", tags: ["Model API", "Inference", "China"], zh: "提供大模型推理、部署和 API 调用的云平台。", en: "A cloud platform for model inference, deployment, and API access." },
  { name: "Together AI", url: "https://www.together.ai/", category: "platform", source: "mainstream", tags: ["Open Models", "Serverless", "Dedicated"], zh: "提供开源模型的 Serverless 推理 API 与专属端点。", en: "Serverless inference APIs and dedicated endpoints for open models." },
  { name: "Fireworks AI", url: "https://fireworks.ai/", category: "platform", source: "mainstream", tags: ["Inference", "Serverless", "OpenAI-compatible"], zh: "提供 Serverless 与专属部署的大模型推理平台。", en: "A model inference platform with serverless and dedicated deployments." },
  { name: "GroqCloud", url: "https://console.groq.com/", category: "platform", source: "mainstream", tags: ["Fast Inference", "Open Models", "OpenAI-compatible"], zh: "面向开放模型的高速推理 API 平台。", en: "A high-speed inference API platform for open models." },
  { name: "Hugging Face Inference Providers", url: "https://huggingface.co/inference-providers/", category: "platform", source: "mainstream", tags: ["Unified API", "Open Models", "Multi-provider"], zh: "以统一认证和接口连接多家推理提供商及开放模型。", en: "Unified authentication and APIs across inference providers and open models." },
  { name: "Cloudflare Workers AI", url: "https://developers.cloudflare.com/workers-ai/", category: "platform", source: "mainstream", tags: ["Serverless", "Edge", "Open Models"], zh: "在 Cloudflare 全球网络上运行开放模型的 Serverless AI 平台。", en: "A serverless platform for running open models on Cloudflare's global network." }
];

function initials(name) {
  return name.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, "").slice(0, 3).toUpperCase();
}

function start() {
  const { t, getLocale } = window.LLMStormI18n;
  const grid = document.querySelector("#recommendation-grid");
  const empty = document.querySelector("#recommendation-empty");
  const search = document.querySelector("#recommendation-search");
  const filters = document.querySelector("#recommendation-filters");
  const pages = document.querySelector("#recommendation-pages");
  const previous = document.querySelector("#recommendation-prev");
  const next = document.querySelector("#recommendation-next");
  let category = "all";
  let query = "";
  let page = 1;

  function filteredSites() {
    const needle = query.trim().toLocaleLowerCase();
    return sites.filter((site) => {
      if (category !== "all" && site.category !== category) return false;
      if (!needle) return true;
      const haystack = [site.name, site.zh, site.en, site.category, ...site.tags].join(" ").toLocaleLowerCase();
      return haystack.includes(needle);
    });
  }

  function createCard(site) {
    const locale = getLocale();
    const card = document.createElement("article");
    card.className = "recommendation-card";
    const top = document.createElement("div");
    top.className = "recommendation-card-top";
    const mark = document.createElement("span");
    mark.className = "recommendation-mark";
    mark.textContent = initials(site.name);
    const source = document.createElement("small");
    source.className = `recommendation-source ${site.source}`;
    source.textContent = t(site.source === "sub2api" ? "recommendationSourceSponsor" : "recommendationSourceMainstream");
    top.append(mark, source);

    const title = document.createElement("h3");
    title.textContent = site.name;
    const domain = document.createElement("code");
    domain.textContent = new URL(site.url).hostname;
    const description = document.createElement("p");
    description.textContent = locale === "zh" ? site.zh : site.en;
    const tagList = document.createElement("div");
    tagList.className = "recommendation-tags";
    site.tags.slice(0, 4).forEach((value) => {
      const tag = document.createElement("span");
      tag.textContent = value;
      tagList.appendChild(tag);
    });
    const link = document.createElement("a");
    link.href = site.url;
    link.target = "_blank";
    link.rel = site.source === "sub2api" ? "noopener noreferrer sponsored" : "noopener noreferrer";
    link.textContent = t("recommendationVisit");
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    link.appendChild(arrow);
    card.append(top, title, domain, description, tagList, link);
    return card;
  }

  function renderPagination(totalPages) {
    pages.replaceChildren();
    for (let value = 1; value <= totalPages; value += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(value);
      button.classList.toggle("active", value === page);
      button.setAttribute("aria-current", value === page ? "page" : "false");
      button.addEventListener("click", () => {
        page = value;
        render(true);
      });
      pages.appendChild(button);
    }
    previous.disabled = page <= 1;
    next.disabled = page >= totalPages;
  }

  function render(shouldScroll = false) {
    const result = filteredSites();
    const totalPages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    grid.replaceChildren(...result.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(createCard));
    grid.classList.toggle("is-hidden", result.length === 0);
    empty.classList.toggle("is-hidden", result.length !== 0);
    document.querySelector("#recommendation-result-count").textContent = t("recommendationResultCount", { count: result.length });
    renderPagination(totalPages);
    if (shouldScroll) document.querySelector(".recommendation-browser").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    category = button.dataset.category;
    page = 1;
    filters.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
  search.addEventListener("input", () => {
    query = search.value;
    page = 1;
    render();
  });
  previous.addEventListener("click", () => {
    if (page > 1) { page -= 1; render(true); }
  });
  next.addEventListener("click", () => {
    if (page * PAGE_SIZE < filteredSites().length) { page += 1; render(true); }
  });
  window.addEventListener("llmstorm:localechange", () => render());
  render();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
