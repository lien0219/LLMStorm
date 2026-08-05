import { expect, test } from "@playwright/test";

const readFontSizes = async (page, selectors) => page.evaluate((items) => (
  Object.fromEntries(items.map((selector) => {
    const element = document.querySelector(selector);
    return [selector, element ? Number.parseFloat(getComputedStyle(element).fontSize) : null];
  }))
), selectors);

test("loads the shared catalog and preserves state across locale changes", async ({ page }) => {
  await page.goto("/?lang=zh");
  const provider = page.locator("#provider");
  const model = page.locator("#model");
  await expect(provider).toBeEnabled();
  await expect(provider.locator("option")).toHaveCount(11);
  await expect(model).toHaveValue("gpt-5.6");

  await page.locator("#concurrency").fill("319");
  await expect(page.locator("#concurrency-range")).toHaveValue("319");
  const percentage = await page.locator("#concurrency-range").evaluate(
    (element) => Number.parseFloat(element.style.getPropertyValue("--range-value"))
  );
  expect(percentage).toBeCloseTo(63.727, 2);

  await model.selectOption("__custom__");
  await page.locator("#custom-model").fill("relay-custom-model");
  const header = page.locator(".site-header");
  const navOrb = page.locator(".nav-orb-toggle");
  if (await navOrb.isVisible()) {
    await navOrb.click();
    await expect(header).toHaveClass(/is-expanded/);
    await expect(navOrb).toBeHidden();
  }
  await page.locator('[data-locale="en"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#custom-model")).toHaveValue("relay-custom-model");
  await expect(page.locator("#concurrency")).toHaveValue("319");
  await expect(page.locator('label[for="concurrency"]')).toHaveText("Maximum concurrency");
});

test("shows live site counters and keeps likes additive", async ({ page }) => {
  await page.goto("/?lang=zh");
  await expect(page.locator("#online-count")).toHaveText(/^\d/);
  await expect(page.locator("#view-count")).toHaveText(/^\d/);
  await expect(page.locator("#like-count")).toHaveText(/^\d/);

  const online = Number((await page.locator("#online-count").textContent()).replace(/\D/g, ""));
  expect(online).toBeGreaterThanOrEqual(10);
  expect(online).toBeLessThanOrEqual(20);
  await expect(page.locator('[data-stat="online"]')).toHaveAttribute(
    "data-tooltip",
    `具体数量：${online}`
  );

  const before = Number((await page.locator("#like-count").textContent()).replace(/\D/g, ""));
  await page.locator("#site-like-button").click();
  await expect.poll(async () => (
    Number((await page.locator("#like-count").textContent()).replace(/\D/g, ""))
  )).toBeGreaterThan(before);
  await expect(page.locator(".floating-like-notice").first()).toContainText("匿名用户");
  await expect(page.locator("#site-like-button")).toHaveAttribute("data-tooltip", /具体数量/);
});

test("reuses the complete statistics dashboard on every secondary page", async ({ page }) => {
  for (const path of ["/sites?lang=zh", "/ai-services?lang=zh", "/support?lang=zh"]) {
    await page.goto(path);
    await expect(page.locator(".shared-stats-console")).toBeVisible();
    await expect(page.locator(".shared-stats-console .console-top")).toContainText("CAPACITY SCANNER");
    await expect(page.locator("#online-count")).toHaveText(/^\d/);
    await expect(page.locator("#view-count")).toHaveText(/^\d/);
    await expect(page.locator("#like-count")).toHaveText(/^\d/);
  }
});

test("fits a mobile viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=en");
  await expect(page.locator("#provider")).toBeEnabled();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.locator("#page-title")).toContainText("concurrency limit");
});

test("keeps the shared typography readable across every platform section", async ({ page }) => {
  await page.goto("/?lang=zh");
  const homeSizes = await readFontSizes(page, [
    "body",
    ".primary-nav a",
    ".panel-heading p",
    ".field label",
    ".field small",
    ".status-badge",
    ".quality-metrics span",
    ".pricing-model-row span",
    ".pricing-disclaimer p",
    "footer"
  ]);
  for (const [selector, size] of Object.entries(homeSizes)) {
    expect(size, `${selector} should use the shared readable scale`).toBeGreaterThanOrEqual(13);
  }
  expect(homeSizes.body).toBeGreaterThanOrEqual(16);
  expect(homeSizes[".panel-heading p"]).toBeGreaterThanOrEqual(15);
  expect(homeSizes[".field label"]).toBeGreaterThanOrEqual(15);
  expect(homeSizes[".field small"]).toBeGreaterThanOrEqual(15);
  expect(homeSizes[".quality-metrics span"]).toBeGreaterThanOrEqual(14);
  expect(homeSizes[".pricing-disclaimer p"]).toBeGreaterThanOrEqual(14);

  await page.goto("/sites?lang=zh");
  const directorySizes = await readFontSizes(page, [
    ".directory-eyebrow",
    ".recommendation-search input",
    ".recommendation-filters button",
    ".recommendation-meta span",
    ".recommendation-card > code",
    ".recommendation-tags span",
    ".recommendation-card > a",
    "footer"
  ]);
  for (const [selector, size] of Object.entries(directorySizes)) {
    expect(size, `${selector} should use the shared readable scale`).toBeGreaterThanOrEqual(13);
  }

  await page.goto("/support?lang=zh");
  const supportSizes = await readFontSizes(page, [
    ".support-panel-heading > span",
    ".support-panel-heading p",
    ".support-option h3",
    ".support-option p",
    ".support-button",
    ".support-note",
    ".contact-copy span",
    ".contact-note",
    "footer"
  ]);
  for (const [selector, size] of Object.entries(supportSizes)) {
    expect(size, `${selector} should use the shared readable scale`).toBeGreaterThanOrEqual(13);
  }
  expect(supportSizes[".support-panel-heading > span"]).toBeGreaterThanOrEqual(14);
  expect(supportSizes[".support-panel-heading p"]).toBeGreaterThanOrEqual(17);
  expect(supportSizes[".support-option h3"]).toBeGreaterThanOrEqual(20);
  expect(supportSizes[".support-option p"]).toBeGreaterThanOrEqual(16);
  expect(supportSizes[".support-button"]).toBeGreaterThanOrEqual(16);
  expect(supportSizes[".support-note"]).toBeGreaterThanOrEqual(14);
  expect(supportSizes[".contact-note"]).toBeGreaterThanOrEqual(16);
});

test("morphs the header into a draggable navigation orb", async ({ page }) => {
  await page.goto("/sites?lang=zh");
  await expect(page.locator(".recommendation-card")).toHaveCount(9);
  const header = page.locator(".site-header");
  const orb = page.locator(".nav-orb-toggle");

  await page.evaluate(() => window.scrollTo(0, 520));
  await expect(header).toHaveClass(/is-collapsed/);
  await expect(orb).toBeVisible();
  const original = await orb.boundingBox();
  expect(original).not.toBeNull();

  await page.mouse.move(original.x + original.width / 2, original.y + original.height / 2);
  await page.mouse.down();
  await page.mouse.move(150, 280, { steps: 8 });
  await page.mouse.up();
  const moved = await orb.boundingBox();
  expect(moved.x).toBeLessThan(original.x - 100);

  await orb.click();
  await expect(header).toHaveClass(/is-expanded/);
  await expect(page.locator(".primary-nav")).toBeVisible();

  await page.mouse.click(300, 420);
  await expect(header).toHaveClass(/is-collapsed/);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(
    async () => (await header.boundingBox()).x,
    { timeout: 1_000, intervals: [40, 80, 120] }
  ).toBeLessThan(moved.x - 5);
  await expect(header).not.toHaveClass(/is-floating/, { timeout: 2_000 });
  await expect(page.locator(".primary-nav")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 520));
  await expect(header).toHaveClass(/is-collapsed/);
  await expect.poll(async () => (await orb.boundingBox()).width).toBeLessThanOrEqual(52.5);
  const mobileOrb = await orb.boundingBox();
  expect(mobileOrb.x + mobileOrb.width).toBeLessThanOrEqual(390);
  await orb.click();
  await expect(header).toHaveClass(/is-expanded/);
  await expect.poll(async () => (await header.boundingBox()).width).toBeGreaterThan(370);
  const mobilePanel = await header.boundingBox();
  expect(mobilePanel.x).toBeGreaterThanOrEqual(0);
  expect(mobilePanel.x + mobilePanel.width).toBeLessThanOrEqual(390);
});

test("navigates between the prepared directory pages", async ({ page }) => {
  await page.goto("/?lang=zh");
  await expect(page.locator(".local-badge")).toHaveCount(0);
  await page.locator('.primary-nav a[href="/sites"]').click();
  await expect(page).toHaveURL(/\/sites$/);
  await expect(page.locator(".primary-nav a.active")).toContainText("站点推荐");
  await expect(page.locator("#directory-title")).toHaveText("站点推荐");

  await page.locator('.primary-nav a[href="/ai-services"]').click();
  await expect(page).toHaveURL(/\/ai-services$/);
  await expect(page.locator(".primary-nav a.active")).toContainText("AI 服务");
  await expect(page.locator(".recommendation-card")).toHaveCount(9);

  await page.locator('.primary-nav a[href="/support"]').click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.locator(".primary-nav a.active")).toContainText("支持与联系");
  await expect(page.locator(".contact-item")).toHaveCount(2);
  await page.locator("#feedback-contact").click();
  await expect(page.locator("#feedback-dialog")).toBeVisible();
  await expect(page.locator("#feedback-dialog")).toContainText("1824851183");
  await page.locator("#feedback-dialog-close").click();
  await expect(page.locator("#feedback-dialog")).not.toBeVisible();
  await expect(page.locator("[data-app-version]")).toHaveText(/^v\d+\.\d+\.\d+/);

  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test("filters and paginates the site recommendation directory", async ({ page }) => {
  await page.goto("/sites?lang=zh");
  await expect(page.locator(".directory-hero-copy > p")).toHaveCount(0);
  await expect(page.locator(".directory-state")).toHaveCount(0);
  await expect(page.locator(".recommendation-heading > small")).toHaveCount(0);
  await expect(page.locator(".recommendation-disclaimer")).toHaveCount(0);
  await expect(page.locator(".recommendation-card")).toHaveCount(9);
  await expect(page.locator("#recommendation-pages button")).toHaveCount(4);
  await page.locator("#recommendation-next").click();
  await expect(page.locator("#recommendation-pages button.active")).toHaveText("2");
  await expect(page.locator(".recommendation-card").first()).toContainText("Veilx");

  await page.locator("#recommendation-search").fill("OpenRouter");
  await expect(page.locator(".recommendation-card")).toHaveCount(1);
  await expect(page.locator(".recommendation-card")).toContainText("OpenRouter");
  await expect(page.locator(".recommendation-source")).toContainText("主流平台");

  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test("filters and paginates the AI service directory", async ({ page }) => {
  await page.goto("/ai-services?lang=zh");
  await expect(page.locator(".directory-state")).toHaveCount(0);
  await expect(page.locator(".directory-hero-copy > p")).toHaveCount(0);
  await expect(page.locator(".recommendation-card")).toHaveCount(9);
  await expect(page.locator("#ai-service-result-count")).toHaveText("共 47 个结果");
  await expect(page.locator("#ai-service-pages button")).toHaveCount(6);
  const chromeCompatibility = await page.evaluate(() => ({
    search: Number.parseFloat(getComputedStyle(document.querySelector(".recommendation-search input")).fontSize),
    filter: Number.parseFloat(getComputedStyle(document.querySelector(".recommendation-filters button")).fontSize),
    title: Number.parseFloat(getComputedStyle(document.querySelector(".recommendation-card h3")).fontSize),
    domain: Number.parseFloat(getComputedStyle(document.querySelector(".recommendation-card > code")).fontSize),
    description: Number.parseFloat(getComputedStyle(document.querySelector(".recommendation-card > p")).fontSize),
    tag: Number.parseFloat(getComputedStyle(document.querySelector(".recommendation-tags span")).fontSize),
    source: Number.parseFloat(getComputedStyle(document.querySelector(".recommendation-source")).fontSize),
    action: Number.parseFloat(getComputedStyle(document.querySelector(".recommendation-card > a")).fontSize),
    scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
    webkitScrollbarDisplay: getComputedStyle(document.documentElement, "::-webkit-scrollbar").display
  }));
  expect(chromeCompatibility.search).toBeGreaterThanOrEqual(15);
  expect(chromeCompatibility.filter).toBeGreaterThanOrEqual(14);
  expect(chromeCompatibility.title).toBeGreaterThanOrEqual(20);
  expect(chromeCompatibility.domain).toBeGreaterThanOrEqual(14);
  expect(chromeCompatibility.description).toBeGreaterThanOrEqual(15);
  expect(chromeCompatibility.tag).toBeGreaterThanOrEqual(13);
  expect(chromeCompatibility.source).toBeGreaterThanOrEqual(13);
  expect(chromeCompatibility.action).toBeGreaterThanOrEqual(15);
  expect(
    chromeCompatibility.scrollbarWidth === "none"
      || chromeCompatibility.webkitScrollbarDisplay === "none"
  ).toBeTruthy();

  await page.locator('#ai-service-filters button[data-category="shop"]').click();
  await expect(page.locator(".recommendation-card")).toHaveCount(9);
  await expect(page.locator("#ai-service-result-count")).toHaveText("共 23 个结果");
  await expect(page.locator("#ai-service-pages button")).toHaveCount(3);
  const chainStore = page.locator(".recommendation-card").filter({ hasText: "链动小铺 · 壹码工坊" });
  await expect(chainStore).toHaveCount(1);
  await expect(chainStore.locator(".recommendation-mark")).toHaveText("1AI");
  await expect(chainStore.locator(".recommendation-source")).toHaveText("链动小铺");
  await expect(chainStore.locator("a")).toHaveAttribute("href", "https://pay.ldxp.cn/shop/1aicode");
  const caoStore = page.locator(".recommendation-card").filter({ hasText: "链动小铺 · cao" });
  await expect(caoStore.locator("p")).toHaveText("Plus 提链服务｜支付通道10次｜商品详情为准 41010510");
  await page.locator("#ai-service-next").click();
  await expect(page.locator("#ai-service-pages button.active")).toHaveText("2");
  await expect(page.locator(".recommendation-card").first()).toContainText("冷热lab");
  await page.locator("#ai-service-next").click();
  await expect(page.locator("#ai-service-pages button.active")).toHaveText("3");
  await expect(page.locator(".recommendation-card").first()).toContainText("JieAiTop");

  await page.locator('#ai-service-filters button[data-category="all"]').click();
  await page.locator("#ai-service-search").fill("Midjourney");
  await expect(page.locator(".recommendation-card")).toHaveCount(1);
  await expect(page.locator(".recommendation-source")).toHaveText("产品官网");

  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test("renders site quality and only explicitly exposed upstream URLs", async ({ page }) => {
  await page.route("**/api/site-analysis", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        endpoint: "https://relay.example.com/v1/chat/completions",
        host: "relay.example.com",
        checkedAt: "2026-08-05T00:00:00Z",
        quality: {
          reachable: true,
          score: 94,
          dnsMs: 18,
          tcpMs: 42,
          tlsMs: 96,
          ttfbMs: 210,
          httpStatus: 401,
          httpVersion: "HTTP/2.0",
          addresses: ["203.0.113.10"],
          ipDetails: [{
            address: "203.0.113.10",
            version: "IPv4",
            scope: "public",
            reverseDns: "edge.example.net",
            flagEmoji: "🇺🇸",
            country: "美国",
            region: "加利福尼亚州",
            city: "洛杉矶",
            latitude: 34.0522,
            longitude: -118.2437,
            asn: "AS13335",
            organization: "Cloudflare, Inc.",
            isp: "Cloudflare",
            domain: "cloudflare.com",
            security: { hosting: true },
            source: "ipwho.is",
            error: null
          }],
          certificate: { daysRemaining: 72 },
          error: null
        },
        route: {
          exposedUpstreamUrl: "https://api.openai.com/v1/chat/completions",
          redirectTarget: null,
          redirectChain: [],
          suspectedProvider: "OpenAI",
          confidence: "high",
          infrastructure: ["Cloudflare"],
          proxySignals: 2,
          evidence: [
            { name: "x-openai-request-id", value: "req_test" },
            { name: "via", value: "1.1 relay, 1.1 gateway" }
          ]
        }
      })
    });
  });
  await page.goto("/?lang=zh");
  await page.locator("#url").fill("https://relay.example.com/v1");
  await page.locator("#run-site-analysis").click();
  await expect(page.locator("#analysis-status")).toContainText("检测完成");
  await expect(page.locator("#quality-score")).toHaveText("94");
  await expect(page.locator("#quality-ttfb")).toHaveText("210 ms");
  await expect(page.locator("#ip-details-list")).toContainText("203.0.113.10");
  await expect(page.locator("#ip-details-list")).toContainText("美国 加利福尼亚州 洛杉矶");
  await expect(page.locator("#ip-details-list")).toContainText("AS13335 · Cloudflare");
  await expect(page.locator("#route-upstream-link")).toHaveAttribute(
    "href",
    "https://api.openai.com/v1/chat/completions"
  );
  await expect(page.locator("#route-evidence li")).toHaveCount(2);
  await expect(page.locator(".analysis-section-heading p")).toHaveCount(0);
  await expect(page.locator(".analysis-disclaimer")).toContainText("通常对客户端不可见");
});

test("derives relay markup from refreshed model prices", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.route("**/api/pricing?**", async (route) => {
    const model = new URL(route.request().url()).searchParams.get("model");
    const prices = model === "gpt-5.5"
      ? { input: 5, output: 30, cacheWrite: null, cacheRead: 0.5 }
      : { input: 5, output: 30, cacheWrite: 6.25, cacheRead: 0.5 };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        found: true,
        provider: "openai",
        model,
        currency: "USD",
        unit: "MTok",
        status: "live",
        fetchedAt: "2026-08-05T00:00:00Z",
        cacheTtlSeconds: 21600,
        officialUrl: "https://developers.openai.com/api/docs/models/gpt-5.6",
        prices
      })
    });
  });
  await page.goto("/?lang=zh");
  await expect(page.locator("#pricing-status")).toContainText("价格已就绪");
  await expect(page.locator("#pricing-source-text")).toContainText("最长缓存 6 小时");
  await expect(page.locator(".pricing-source-disclosure")).toContainText("并非每次直接抓取厂商官网");
  await expect(page.locator(".pricing-disclaimer")).toContainText("仅供参考");
  await expect(page.locator(".pricing-note")).toHaveCount(0);
  await expect(page.locator(".relay-pricing-editor .pricing-section-heading p")).not.toContainText(/New API|One API/);

  const disclaimerAlignment = await page.evaluate(() => {
    const icon = document.querySelector(".pricing-disclaimer-title svg").getBoundingClientRect();
    const title = document.querySelector(".pricing-disclaimer-title strong").getBoundingClientRect();
    return Math.abs((icon.top + icon.height / 2) - (title.top + title.height / 2));
  });
  expect(disclaimerAlignment).toBeLessThanOrEqual(1);

  const alignment = await page.evaluate(() => {
    const source = document.querySelector("#official-price-link").getBoundingClientRect();
    const table = document.querySelector(".pricing-table-wrap").getBoundingClientRect();
    return { sourceLeft: source.left, sourceRight: source.right, tableLeft: table.left, tableRight: table.right };
  });
  expect(alignment.sourceLeft).toBeGreaterThanOrEqual(alignment.tableLeft);
  expect(Math.abs(alignment.sourceRight - alignment.tableRight)).toBeLessThanOrEqual(1);

  await page.locator("#relay-price-output").fill("60");
  const outputRow = page.locator("#pricing-compare-body tr").nth(1);
  await expect(outputRow.locator("td").nth(2)).toHaveText("$30");
  await expect(outputRow.locator("td").nth(3)).toHaveText("+$30");
  await expect(outputRow.locator("td").nth(4)).toHaveText("2.00×");

  await page.locator("#add-pricing-tier").click();
  await page.locator(".relay-tier-range input").first().fill("32769");
  await page.locator(".relay-tier-prices label").nth(1).locator("input").fill("90");
  await expect(page.locator("#pricing-tier-view")).toHaveValue("tier-0");
  await expect(outputRow.locator("td").nth(4)).toHaveText("3.00×");

  await page.locator("#pricing-tier-view").selectOption("base");
  await page.locator("#model").selectOption("gpt-5.5");
  await expect(page.locator("#pricing-model")).toHaveText("gpt-5.5");
  const cacheWriteRow = page.locator("#pricing-compare-body tr").nth(2);
  await expect(cacheWriteRow.locator("td").nth(2)).toHaveText("$5");
  await expect(page.locator("#pricing-derived-note")).toBeVisible();
  await page.locator("#use-official-prices").click();
  await expect(page.locator("#relay-price-cache-write")).toHaveValue("5");
});
