(() => {
  "use strict";

  const messages = {
    zh: {
      metaTitle: "LLMStorm · 大模型并发测试",
      metaDescription: "LLMStorm 大模型中转站并发能力测试工具",
      homeAria: "LLMStorm 首页",
      localBadge: "本地运行 · Key 不落盘",
      heroTitle: "压测每一次请求<br><em>看清真实并发上限</em>",
      heroDescription: "从单请求到峰值并发逐档加压，把成功率、吞吐与响应延迟变成清晰结论。",
      heroCapabilities: "测试能力",
      multiProvider: "多厂商协议",
      rampLoad: "阶梯式加压",
      liveStream: "实时结果流",
      providerPresets: "厂商预设",
      customConcurrency: "自定义并发",
      liveProgress: "实时进度",
      productFeatures: "产品特点",
      configTitle: "测试配置",
      configSubtitle: "填写中转站连接信息",
      endpointLabel: "接口地址",
      endpointHelp: "可填写 API 基地址或完整的请求端点",
      providerLabel: "厂商 / 协议",
      modelLabel: "模型 / 精确 ID",
      modelHint: "官方预设 + 自定义",
      customModelPlaceholder: "手动输入中转站模型 ID",
      back: "返回",
      keyShow: "显示 Key",
      keyHide: "隐藏 Key",
      keyPrivacy: "仅用于本次请求，不写入日志或浏览器存储",
      concurrencyLabel: "最大并发数",
      concurrencyHelp: "滑杆快速选择，右侧可直接输入 1–{max}",
      concurrencyUnit: "并发",
      concurrencySliderAria: "最大并发数滑块",
      advanced: "高级设置",
      timeout: "单请求超时",
      secondsUnit: "秒",
      maxOutput: "最大输出",
      promptLabel: "测试提示词",
      defaultPrompt: "请用一句话说明并发测试的意义。",
      insecure: "跳过 HTTPS 证书校验（仅限可信内网）",
      costTitle: "注意调用费用",
      costBody: "系统会按 1 → 25% → 50% → 75% → 最大值逐级发起请求；自定义高并发请逐步提升。",
      costBodyDynamic: "系统会按 1 → {ramp} → 最大值逐级发起请求；自定义高并发请逐步提升。",
      startTest: "开始并发测试",
      stopTest: "停止测试",
      monitorTitle: "实时监测",
      statusWaiting: "等待配置",
      statusRunning: "测试进行中",
      statusComplete: "测试完成",
      statusStopped: "已停止",
      statusError: "测试失败",
      emptyTitle: "准备迎接风暴",
      emptyBody: "完成左侧配置并开始测试<br>数据将在这里实时呈现",
      connecting: "正在建立连接",
      requestsCount: "{completed} / {total} 请求",
      currentConcurrency: "当前并发",
      successfulRequests: "成功请求",
      currentStatus: "当前状态",
      recommendedConcurrency: "建议并发",
      successThreshold: "成功率 ≥ {threshold}%",
      overallSuccess: "整体成功率",
      successFailure: "{success} 成功 / {failure} 失败",
      peakThroughput: "峰值吞吐",
      p95Latency: "P95 延迟",
      allStages: "全阶段统计",
      stageResults: "分档结果",
      concurrency: "并发",
      successRate: "成功率",
      throughput: "吞吐",
      status: "状态",
      waitingStage: "等待第一档测试结果…",
      testOutput: "测试输出",
      copyResult: "复制结果",
      logPlaceholder: "// 测试日志将在此处输出",
      authorizedOnly: "请仅在授权范围内进行压力测试",
      noScript: "此页面需要启用 JavaScript 才能运行测试。",
      customProvider: "其他 OpenAI 兼容中转站",
      compatible: "OpenAI 兼容",
      customModelOption: "手动输入自定义模型 ID…",
      passed: "通过",
      limited: "受限",
      stageLog: "并发 {concurrency} 完成 · {success}/{requests} 成功 · {throughput} req/s · P95 {latency}",
      summaryLog: "测试完成 · 建议稳定并发 {recommended} · 总耗时 {time}",
      maxPassedLog: "已通过最大设定并发；实际上限可能更高，可提高最大并发后复测。",
      allFailedLog: "所有档位成功率均低于 {threshold}%，请检查 URL、Key、协议或上游配额。",
      reserveLog: "并发超过 {recommended} 后稳定性下降，建议预留 10%–20% 余量。",
      targetEndpointLog: "目标端点：{endpoint}",
      planLog: "将执行 {levels} 个并发档位，共 {requests} 个请求",
      stageStarting: "正在测试并发 {concurrency}",
      levelProgress: "第 {level} / {count} 档",
      allComplete: "全部测试完成",
      enterModel: "请输入模型 ID",
      serverHttpError: "服务器返回 HTTP {status}",
      incompleteStream: "连接提前结束，未收到完整测试结果",
      stoppedLog: "测试已由用户停止。",
      testStoppedToast: "测试已停止",
      copied: "测试结果已复制",
      copyFailed: "复制失败，请手动选择日志",
      serverUnavailable: "无法读取服务端配置，已使用本地默认值",
      catalogLoading: "正在加载厂商目录…",
      catalogUnavailable: "厂商目录加载失败：{error}",
      invalidServerConfig: "服务端返回了无效的测试策略配置",
      maxAdjusted: "服务端最大并发限制为 {max}",
      groupCurrentGpt: "当前 GPT-5.6 系列",
      groupOtherGpt: "其他可用 GPT 系列",
      groupClaudeCurrent: "当前 Claude API 精确 ID",
      groupClaudeLegacy: "Claude 4.x 兼容 ID",
      groupClaudeCode: "Claude Code 模型别名",
      groupGeminiStable: "Gemini 稳定文本模型",
      groupGeminiAlias: "Gemini 滚动别名",
      groupDeepseekCurrent: "DeepSeek 当前 API 模型",
      groupLegacyAlias: "旧别名（部分中转站仍使用）",
      groupQwenCurrent: "Qwen 当前模型",
      groupQwenAlias: "Qwen 稳定别名",
      groupGlm: "GLM 文本模型",
      groupKimi: "Kimi 当前模型",
      groupMinimax: "MiniMax 文本模型",
      groupGrok: "Grok 当前模型",
      groupMistral: "Mistral API 模型",
      groupRelayCommon: "常见中转模型 ID"
    },
    en: {
      metaTitle: "LLMStorm · LLM Concurrency Tester",
      metaDescription: "Measure the real concurrency capacity of LLM relay services.",
      homeAria: "LLMStorm home",
      localBadge: "Local runtime · Keys are never stored",
      heroTitle: "Stress every request<br><em>Find the real concurrency limit</em>",
      heroDescription: "Ramp from one request to peak concurrency and turn success rate, throughput, and latency into a clear capacity result.",
      heroCapabilities: "Test capabilities",
      multiProvider: "Multi-provider protocols",
      rampLoad: "Progressive load",
      liveStream: "Live result stream",
      providerPresets: "Provider presets",
      customConcurrency: "Custom concurrency",
      liveProgress: "Live progress",
      productFeatures: "Product features",
      configTitle: "Test configuration",
      configSubtitle: "Enter your relay connection details",
      endpointLabel: "Endpoint URL",
      endpointHelp: "Enter a conventional API base URL or a complete request endpoint",
      providerLabel: "Provider / protocol",
      modelLabel: "Model / exact ID",
      modelHint: "Official presets + custom",
      customModelPlaceholder: "Enter the relay model ID",
      back: "Back",
      keyShow: "Show API key",
      keyHide: "Hide API key",
      keyPrivacy: "Used only for this test; never written to logs or browser storage",
      concurrencyLabel: "Maximum concurrency",
      concurrencyHelp: "Use the slider for quick selection or enter 1–{max} directly",
      concurrencyUnit: "workers",
      concurrencySliderAria: "Maximum concurrency slider",
      advanced: "Advanced settings",
      timeout: "Request timeout",
      secondsUnit: "seconds",
      maxOutput: "Maximum output",
      promptLabel: "Test prompt",
      defaultPrompt: "Explain the value of concurrency testing in one sentence.",
      insecure: "Skip HTTPS certificate verification (trusted private networks only)",
      costTitle: "Usage costs apply",
      costBody: "Requests ramp through 1 → 25% → 50% → 75% → maximum. Increase custom high-concurrency values gradually.",
      costBodyDynamic: "Requests ramp through 1 → {ramp} → maximum. Increase custom high-concurrency values gradually.",
      startTest: "Start concurrency test",
      stopTest: "Stop test",
      monitorTitle: "Live monitor",
      statusWaiting: "Waiting for configuration",
      statusRunning: "Test running",
      statusComplete: "Test complete",
      statusStopped: "Stopped",
      statusError: "Test failed",
      emptyTitle: "Ready for the storm",
      emptyBody: "Complete the configuration and start a test.<br>Live data will appear here.",
      connecting: "Establishing connection",
      requestsCount: "{completed} / {total} requests",
      currentConcurrency: "Current concurrency",
      successfulRequests: "Successful requests",
      currentStatus: "Latest status",
      recommendedConcurrency: "Recommended",
      successThreshold: "Success rate ≥ {threshold}%",
      overallSuccess: "Overall success",
      successFailure: "{success} succeeded / {failure} failed",
      peakThroughput: "Peak throughput",
      p95Latency: "P95 latency",
      allStages: "Across all stages",
      stageResults: "Stage results",
      concurrency: "Concurrency",
      successRate: "Success rate",
      throughput: "Throughput",
      status: "Status",
      waitingStage: "Waiting for the first stage…",
      testOutput: "Test output",
      copyResult: "Copy result",
      logPlaceholder: "// Test logs will appear here",
      authorizedOnly: "Run load tests only against services you are authorized to test",
      noScript: "JavaScript is required to run this test console.",
      customProvider: "Other OpenAI-compatible relay",
      compatible: "OpenAI compatible",
      customModelOption: "Enter a custom model ID…",
      passed: "Passed",
      limited: "Limited",
      stageLog: "Concurrency {concurrency} complete · {success}/{requests} succeeded · {throughput} req/s · P95 {latency}",
      summaryLog: "Test complete · Recommended stable concurrency {recommended} · Total time {time}",
      maxPassedLog: "The configured maximum passed. The actual limit may be higher; increase the maximum and test again.",
      allFailedLog: "Every stage was below a {threshold}% success rate. Check the URL, key, protocol, or upstream quota.",
      reserveLog: "Stability declined above {recommended} concurrent requests. Keep 10%–20% headroom.",
      targetEndpointLog: "Target endpoint: {endpoint}",
      planLog: "Running {levels} concurrency stages with {requests} total requests",
      stageStarting: "Testing concurrency {concurrency}",
      levelProgress: "Stage {level} / {count}",
      allComplete: "All stages complete",
      enterModel: "Enter a model ID",
      serverHttpError: "Server returned HTTP {status}",
      incompleteStream: "The connection ended before a complete result was received",
      stoppedLog: "The test was stopped by the user.",
      testStoppedToast: "Test stopped",
      copied: "Test result copied",
      copyFailed: "Copy failed; select the log manually",
      serverUnavailable: "Could not load server configuration; using local defaults",
      catalogLoading: "Loading provider catalog…",
      catalogUnavailable: "Could not load the provider catalog: {error}",
      invalidServerConfig: "The server returned an invalid benchmark policy",
      maxAdjusted: "The server concurrency limit is {max}",
      groupCurrentGpt: "Current GPT-5.6 family",
      groupOtherGpt: "Other available GPT models",
      groupClaudeCurrent: "Current exact Claude API IDs",
      groupClaudeLegacy: "Claude 4.x compatibility IDs",
      groupClaudeCode: "Claude Code model aliases",
      groupGeminiStable: "Stable Gemini text models",
      groupGeminiAlias: "Rolling Gemini aliases",
      groupDeepseekCurrent: "Current DeepSeek API models",
      groupLegacyAlias: "Legacy aliases used by some relays",
      groupQwenCurrent: "Current Qwen models",
      groupQwenAlias: "Stable Qwen aliases",
      groupGlm: "GLM text models",
      groupKimi: "Current Kimi models",
      groupMinimax: "MiniMax text models",
      groupGrok: "Current Grok models",
      groupMistral: "Mistral API models",
      groupRelayCommon: "Common relay model IDs"
    }
  };

  const supported = new Set(Object.keys(messages));

  function readStoredLocale() {
    try {
      return window.localStorage.getItem("llmstorm.locale");
    } catch {
      return null;
    }
  }

  function storeLocale(value) {
    try {
      window.localStorage.setItem("llmstorm.locale", value);
    } catch {
      // Language switching still works when storage is disabled.
    }
  }

  const requested = new URLSearchParams(window.location.search).get("lang");
  const stored = readStoredLocale();
  let locale = supported.has(requested)
    ? requested
    : supported.has(stored)
      ? stored
    : (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";

  function t(key, values = {}) {
    const template = messages[locale][key] ?? messages.zh[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
  }

  function apply(root = document) {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = t("metaTitle");
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = t("metaDescription");
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-html]").forEach((element) => {
      element.innerHTML = t(element.dataset.i18nHtml);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    root.querySelectorAll("[data-i18n-aria]").forEach((element) => {
      element.setAttribute("aria-label", t(element.dataset.i18nAria));
    });
    root.querySelectorAll("[data-i18n-value]").forEach((element) => {
      if (!element.dataset.userEdited) element.value = t(element.dataset.i18nValue);
    });
    root.querySelectorAll("[data-locale]").forEach((button) => {
      const active = button.dataset.locale === locale;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setLocale(nextLocale) {
    if (!supported.has(nextLocale) || nextLocale === locale) return;
    locale = nextLocale;
    storeLocale(locale);
    apply();
    window.dispatchEvent(new CustomEvent("llmstorm:localechange", { detail: { locale } }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-locale]").forEach((button) => {
      button.addEventListener("click", () => setLocale(button.dataset.locale));
    });
    document.querySelectorAll("[data-i18n-value]").forEach((element) => {
      element.addEventListener("input", () => { element.dataset.userEdited = "true"; }, { once: true });
    });
    apply();
  });

  window.LLMStormI18n = { t, apply, setLocale, getLocale: () => locale };
})();
