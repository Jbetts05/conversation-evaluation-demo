import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:8792";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/catalog", async (route) => {
    const response = await route.fetch();
    const catalog = await response.json();
    catalog.configuration.judge = "receipt-gpt-54-mini";
    await route.fulfill({ response, json: catalog });
  });
  await page.goto(base);
  await page.locator("#scenario:not([disabled])").waitFor();
  assert.match(await page.locator("#judge-summary").innerText(), /receipt-gpt-54-mini/);
  await page.locator("#judge-details > summary").click();
  await page.waitForFunction(() => document.getElementById("configuration").textContent.includes("gpt-6-astra"));
  assert.match(await page.locator("#judge-summary").innerText(), /gpt-6-astra/);
  await page.locator("#recorded").click();
  const card = page.locator("#results .result-card")
    .filter({ hasText: "Well handled · recorded" })
    .filter({ has: page.locator(".eyebrow", { hasText: "Whole conversation" }) });
  await card.waitFor();
  const outputQuality = card.locator(":scope > .metric").first();
  assert.equal(await outputQuality.locator(":scope > .metric-heading > span:first-child").innerText(), "Output quality");
  assert.equal(await outputQuality.locator(":scope > .metric-heading > .score").innerText(), "1/1");
  assert.match(await outputQuality.innerText(), /Binary gate: 1 = pass/);
  await outputQuality.locator("summary").filter({ hasText: "Component scores" }).click();
  assert.match(await outputQuality.innerText(), /Output quality · Fluency/);
  assert.ok(await page.locator('script[type="module"]').getAttribute("src").then((source) => /^\/assets\/app\.[a-f0-9]{12}\.js$/.test(source)));
  assert.deepEqual(errors, []);
  console.log("Stale judge configuration refreshed to Astra; binary gate is 1/1 with correctly labelled components and versioned assets.");
} finally {
  await browser.close();
}
