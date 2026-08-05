"use strict";

const PAGE_SIZE = 9;

const services = [
  { name: "ChatGPT", url: "https://chatgpt.com/", category: "assistant", source: "official", tags: ["对话", "写作", "搜索", "编程"], zh: "面向问答、写作、研究、图像与编程等场景的通用 AI 助手。", en: "A general AI assistant for questions, writing, research, images, and coding." },
  { name: "Claude", url: "https://claude.ai/", category: "assistant", source: "official", tags: ["对话", "文档", "分析", "编程"], zh: "适用于长文档阅读、内容创作、分析和编程协作的 AI 助手。", en: "An AI assistant for long documents, writing, analysis, and coding." },
  { name: "Gemini", url: "https://gemini.google.com/", category: "assistant", source: "official", tags: ["对话", "多模态", "Google"], zh: "Google 提供的多模态 AI 助手，可处理文本、图像和文件等内容。", en: "Google's multimodal AI assistant for text, images, files, and more." },
  { name: "Perplexity", url: "https://www.perplexity.ai/", category: "assistant", source: "official", tags: ["AI 搜索", "引用", "研究"], zh: "以联网检索和来源引用为重点的 AI 搜索与研究工具。", en: "An AI search and research tool focused on web retrieval and citations." },
  { name: "Poe", url: "https://poe.com/", category: "assistant", source: "official", tags: ["多模型", "Bot", "对话"], zh: "集中使用多种 AI 模型和用户创建机器人的对话平台。", en: "A conversational platform for multiple AI models and user-created bots." },
  { name: "Microsoft Copilot", url: "https://copilot.microsoft.com/", category: "assistant", source: "official", tags: ["对话", "搜索", "Microsoft"], zh: "微软的通用 AI 助手，覆盖问答、搜索、写作和图像等场景。", en: "Microsoft's general AI assistant for search, writing, images, and everyday tasks." },

  { name: "GitHub Copilot", url: "https://github.com/features/copilot", category: "coding", source: "official", tags: ["代码补全", "Agent", "GitHub"], zh: "集成于编辑器和 GitHub 工作流的 AI 编程助手。", en: "An AI coding assistant integrated with editors and GitHub workflows." },
  { name: "Cursor", url: "https://cursor.com/", category: "coding", source: "official", tags: ["AI 编辑器", "Agent", "代码库"], zh: "围绕代码库问答、编辑和智能体任务构建的 AI 代码编辑器。", en: "An AI code editor for repository questions, edits, and agent tasks." },
  { name: "Windsurf", url: "https://windsurf.com/", category: "coding", source: "official", tags: ["AI 编辑器", "Agent", "代码生成"], zh: "提供代码生成、上下文理解与智能体工作流的 AI 开发环境。", en: "An AI development environment for code generation, context, and agent workflows." },
  { name: "Replit Agent", url: "https://replit.com/ai", category: "coding", source: "official", tags: ["应用构建", "部署", "Agent"], zh: "通过自然语言创建、迭代并部署应用的在线开发服务。", en: "An online service for building, iterating, and deploying apps with natural language." },
  { name: "Lovable", url: "https://lovable.dev/", category: "coding", source: "official", tags: ["Web 应用", "原型", "全栈"], zh: "面向网站与 Web 应用原型的自然语言构建平台。", en: "A natural-language platform for website and web application prototypes." },
  { name: "Bolt.new", url: "https://bolt.new/", category: "coding", source: "official", tags: ["浏览器 IDE", "Web 应用", "部署"], zh: "在浏览器中生成、运行和迭代全栈 Web 应用的 AI 开发工具。", en: "An AI development tool for generating and running full-stack web apps in the browser." },

  { name: "Midjourney", url: "https://www.midjourney.com/", category: "creative", source: "official", tags: ["图像生成", "视频", "创意"], zh: "面向视觉创作的图像与视频生成服务。", en: "An image and video generation service for visual creation." },
  { name: "Runway", url: "https://runway.com/", category: "creative", source: "official", tags: ["视频生成", "图像", "音频"], zh: "提供视频、图像与音频生成和编辑能力的云端创作平台。", en: "A cloud creative platform for generating and editing video, images, and audio." },
  { name: "Adobe Firefly", url: "https://firefly.adobe.com/", category: "creative", source: "official", tags: ["图像生成", "设计", "Adobe"], zh: "Adobe 的生成式创意工具，覆盖图像、设计和媒体工作流。", en: "Adobe's generative creative tools for image, design, and media workflows." },
  { name: "Canva Magic Studio", url: "https://www.canva.com/magic/", category: "creative", source: "official", tags: ["设计", "演示文稿", "图像"], zh: "集成在 Canva 中的 AI 设计、文案、图像和演示文稿工具。", en: "AI tools in Canva for design, writing, images, and presentations." },
  { name: "ElevenLabs", url: "https://elevenlabs.io/", category: "creative", source: "official", tags: ["语音合成", "配音", "音频"], zh: "提供语音合成、配音与音频生成能力的 AI 音频平台。", en: "An AI audio platform for speech synthesis, dubbing, and voice generation." },
  { name: "Suno", url: "https://suno.com/", category: "creative", source: "official", tags: ["音乐生成", "歌曲", "音频"], zh: "通过文本提示创作歌曲与音乐的 AI 音频服务。", en: "An AI audio service for creating songs and music from text prompts." },

  { name: "Notion AI", url: "https://www.notion.com/product/ai", category: "productivity", source: "official", tags: ["知识库", "写作", "会议", "Agent"], zh: "集成于文档和知识库的写作、搜索、会议记录与自动化工具。", en: "Writing, search, meeting notes, and automation inside documents and knowledge bases." },
  { name: "Gamma", url: "https://gamma.app/", category: "productivity", source: "official", tags: ["演示文稿", "文档", "网页"], zh: "用于快速生成演示文稿、文档和网页的 AI 内容工具。", en: "An AI content tool for quickly creating presentations, documents, and web pages." },
  { name: "Dify", url: "https://dify.ai/", category: "productivity", source: "official", tags: ["Agent", "工作流", "知识库"], zh: "面向智能体、RAG 应用与生产工作流的应用开发平台。", en: "A platform for building agents, RAG applications, and production workflows." },
  { name: "Coze", url: "https://www.coze.com/", category: "productivity", source: "official", tags: ["Bot", "工作流", "插件"], zh: "用于创建 AI 机器人、工作流与应用的开发平台。", en: "A development platform for AI bots, workflows, and applications." },
  { name: "n8n AI", url: "https://n8n.io/ai/", category: "productivity", source: "official", tags: ["工作流", "集成", "Agent"], zh: "将 AI 节点、智能体与业务系统连接起来的工作流自动化平台。", en: "A workflow automation platform connecting AI nodes, agents, and business systems." },
  { name: "Zapier AI", url: "https://zapier.com/ai", category: "productivity", source: "official", tags: ["自动化", "应用集成", "Agent"], zh: "连接常用应用并构建 AI 自动化和智能体流程的服务。", en: "A service for connecting apps and building AI automations and agent workflows." },

  { name: "链动小铺 · 壹码工坊", mark: "1AI", url: "https://pay.ldxp.cn/shop/1aicode", category: "shop", source: "ldxp", tags: ["AI 产品", "订阅服务", "API"], zh: "提供 AI 订阅、账号和接口相关商品的链动小铺店铺。", en: "A Liandong shop offering AI subscriptions, accounts, and API-related products." },
  { name: "ETok.ai", url: "https://etok.ai/", category: "shop", source: "thirdParty", tags: ["AI 编程", "订阅", "技术社区"], zh: "提供 AI 编程相关套餐和技术社区服务的第三方平台。", en: "A third-party platform offering AI coding plans and technical community services." },
  { name: "AIGoCode", url: "https://aigocode.com/", category: "shop", source: "thirdParty", tags: ["AI 编程", "订阅", "服务"], zh: "聚合 AI 编程能力与订阅方案的第三方服务平台。", en: "A third-party service platform aggregating AI coding tools and subscription options." },
  { name: "BmoPlus", url: "https://shop.bmoplus.com/", category: "shop", source: "thirdParty", tags: ["AI 产品", "账号", "充值"], zh: "提供 AI 产品账号与充值类商品的第三方店铺。", en: "A third-party shop for AI accounts and top-ups." },
  { name: "AI2You 智友社", mark: "A2Y", url: "https://ai2youhub.com/", category: "shop", source: "thirdParty", tags: ["GPT", "Gemini", "Claude", "Grok"], zh: "提供多种主流 AI 产品相关服务的第三方店铺。", en: "A third-party shop offering services for several mainstream AI products." },
  { name: "链动小铺 · 牟利ai", mark: "MLA", url: "https://pay.ldxp.cn/item/21t9bw", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "订阅", "AI 产品"], listingTitle: "plus半成品" },
  { name: "链动小铺 · 奥特曼严选", mark: "ATM", url: "https://pay.ldxp.cn/item/q5tg0k", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "订阅", "账号"], listingTitle: "手搓 PLUS 成品，iCloud 邮箱，新渠道，家宽住宅手搓，未绑定手机号码，稳定性自测" },
  { name: "链动小铺 · 听白AI", mark: "TBA", url: "https://pay.ldxp.cn/item/7ah9k6", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "AI 产品", "账号"], listingTitle: "Gpt Free【未接码】已开通2FA-AT-微软邮箱-百分百0元优惠，开plus专用-稳定" },
  { name: "链动小铺 · cao", mark: "CAO", url: "https://pay.ldxp.cn/item/o64qfo", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "订阅服务", "AI 产品"], listingTitle: "Plus 提链服务｜支付通道10次｜商品详情为准 41010510" },
  { name: "链动小铺 · 冷热lab", mark: "LAB", url: "https://pay.ldxp.cn/item/uxlh27", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "订阅服务", "AI 产品"], listingTitle: "韩国PLUS的Kakao自助通道代付【单次】无提链" },
  { name: "链动小铺 · 唐伯猫小铺", mark: "TBM", url: "https://pay.ldxp.cn/item/8fkfld", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "订阅服务", "AI 产品"], listingTitle: "G·P·T Plus会员提取支付链接——KAKAO（韩国）提链助手——含10个CDK" },
  { name: "链动小铺 · AI零度", mark: "AI0", url: "https://pay.ldxp.cn/item/mmidy5", category: "shop", source: "ldxp", linkType: "listing", tags: ["Codex", "验证服务", "AI 产品"], listingTitle: "codex一手接码" },
  { name: "链动小铺 · 幻境MirageAI", mark: "MIR", url: "https://pay.ldxp.cn/item/bju6nc", category: "shop", source: "ldxp", linkType: "listing", tags: ["Codex", "验证服务", "AI 产品"], listingTitle: "codex 接码 高质量 包接码成功100%【全自动自助系统】" },
  { name: "链动小铺 · 幽羊AI", mark: "YYA", url: "https://pay.ldxp.cn/item/k71oob", category: "shop", source: "ldxp", linkType: "listing", tags: ["邮箱", "账号服务", "AI 产品"], listingTitle: "outlook邮箱" },
  { name: "链动小铺 · 优质AI科技", mark: "YAI", url: "https://pay.ldxp.cn/item/ylif1f", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "Free", "账号"], listingTitle: "GPT Free-账密 AT-长效outlook-【未接码】部分有免费试用资格" },
  { name: "链动小铺 · 商家8719", mark: "871", url: "https://pay.ldxp.cn/item/5xvcsr", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "Free", "账号"], listingTitle: "Gpt Free-账密 AT-长效outlook-适合各类业务" },
  { name: "链动小铺 · 鹰鹰小铺", mark: "YYP", url: "https://pay.ldxp.cn/item/1cfdk6", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "Plus", "账号"], listingTitle: "【限时特价】Gcash精品渠道【好好看说明求求了】G P T PLUS 未接码 Icloud邮箱 可反代可网页" },
  { name: "链动小铺 · 李页的小店", mark: "LYD", url: "https://pay.ldxp.cn/item/16ef4g", category: "shop", source: "ldxp", linkType: "listing", tags: ["Codex", "验证服务", "CDK"], listingTitle: "codex一次性接码 每日福利50张" },
  { name: "链动小铺 · JieAiTop", mark: "JAT", url: "https://pay.ldxp.cn/item/wq6ml0", category: "shop", source: "ldxp", linkType: "listing", tags: ["邮箱", "OAuth2", "账号服务"], listingTitle: "Hotmail长效OAuth2令牌号【买前请看商品介绍】" },
  { name: "链动小铺 · chiyu", mark: "CHI", url: "https://pay.ldxp.cn/item/h7zz8l", category: "shop", source: "ldxp", linkType: "listing", tags: ["邮箱", "OAuth2", "账号服务"], listingTitle: "outlook邮箱 长效令牌" },
  { name: "链动小铺 · 清羽688", mark: "QY6", url: "https://pay.ldxp.cn/item/wx3dki", category: "shop", source: "ldxp", linkType: "listing", tags: ["Codex", "验证服务", "CDK"], listingTitle: "CDK 美国实卡单次接码codex绑定注册通用🔥1-30天【质保不来码】PLUS接码codex接码" },
  { name: "链动小铺 · 一梦AI", mark: "YMA", url: "https://pay.ldxp.cn/item/rqtevv", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "Plus", "反代"], listingTitle: "【自营】Plus 已接码 仅反代" },
  { name: "链动小铺 · ai教父", mark: "AIF", url: "https://pay.ldxp.cn/item/27p24b", category: "shop", source: "ldxp", linkType: "listing", tags: ["ChatGPT", "Plus", "账号"], listingTitle: "Plus 网页版｜质保30天" }
];

function initials(name) {
  return name.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, "").slice(0, 3).toUpperCase();
}

function start() {
  const { t, getLocale } = window.LLMStormI18n;
  const grid = document.querySelector("#ai-service-grid");
  const empty = document.querySelector("#ai-service-empty");
  const search = document.querySelector("#ai-service-search");
  const filters = document.querySelector("#ai-service-filters");
  const pages = document.querySelector("#ai-service-pages");
  const previous = document.querySelector("#ai-service-prev");
  const next = document.querySelector("#ai-service-next");
  let category = "all";
  let query = "";
  let page = 1;

  function filteredServices() {
    const needle = query.trim().toLocaleLowerCase();
    return services.filter((service) => {
      if (category !== "all" && service.category !== category) return false;
      if (!needle) return true;
      const haystack = [service.name, service.zh, service.en, service.category, ...service.tags].join(" ").toLocaleLowerCase();
      return haystack.includes(needle);
    });
  }

  function createCard(service) {
    const card = document.createElement("article");
    card.className = "recommendation-card ai-service-card";

    const top = document.createElement("div");
    top.className = "recommendation-card-top";
    const mark = document.createElement("span");
    mark.className = "recommendation-mark";
    mark.textContent = service.mark || initials(service.name);
    const source = document.createElement("small");
    source.className = `recommendation-source ${service.source}`;
    source.textContent = t(service.source === "official"
      ? "aiServiceSourceOfficial"
      : service.source === "ldxp" ? "aiServiceSourceLdxp" : "aiServiceSourceThirdParty");
    top.append(mark, source);

    const title = document.createElement("h3");
    title.textContent = service.name;
    const domain = document.createElement("code");
    domain.textContent = new URL(service.url).hostname;
    const description = document.createElement("p");
    description.textContent = service.listingTitle || (getLocale() === "zh" ? service.zh : service.en);
    const tagList = document.createElement("div");
    tagList.className = "recommendation-tags";
    service.tags.forEach((value) => {
      const tag = document.createElement("span");
      tag.textContent = value;
      tagList.appendChild(tag);
    });
    const link = document.createElement("a");
    link.href = service.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = t(service.linkType === "listing"
      ? "aiServiceVisitListing"
      : service.source === "official" ? "aiServiceVisitProduct" : "aiServiceVisitShop");
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
    const result = filteredServices();
    const totalPages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    grid.replaceChildren(...result.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(createCard));
    grid.classList.toggle("is-hidden", result.length === 0);
    empty.classList.toggle("is-hidden", result.length !== 0);
    document.querySelector("#ai-service-result-count").textContent = t("aiServiceResultCount", { count: result.length });
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
    if (page * PAGE_SIZE < filteredServices().length) { page += 1; render(true); }
  });
  window.addEventListener("llmstorm:localechange", () => render());
  render();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
