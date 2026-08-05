import { expect, test } from "@playwright/test";

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
  await page.locator('[data-locale="en"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#custom-model")).toHaveValue("relay-custom-model");
  await expect(page.locator("#concurrency")).toHaveValue("319");
  await expect(page.locator('label[for="concurrency"]')).toHaveText("Maximum concurrency");
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

