import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:8787";
await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator("#scenario:not([disabled])").waitFor();
  assert.equal(await page.locator("#scenario option").count(), 9);
  assert.equal(await page.locator("#variant").inputValue(), "faulty");
  assert.match(await page.locator("#messages").innerText(), /You are welcome/);
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.screenshot({ path: fileURLToPath(new URL("../.local/desktop.png", import.meta.url)), fullPage: true });
  await page.locator("#chat-mode").click();
  await page.locator("#chat-input").fill("Is France roaming included? Answer in one short sentence.");
  await page.locator("#send-chat").click();
  await page.locator("#status").filter({ hasText: "Live answer captured" }).waitFor({ timeout: 45_000 });
  assert.match(await page.locator("#messages").innerText(), /France/i);
  assert.match(await page.locator("#chat-metrics").innerText(), /tokens/);
  await page.locator("#evaluate").click();
  await page.locator("#results .result-card").filter({ hasText: "completed" }).first().waitFor({ timeout: 300_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("#results .result-status")].length === 2
    && [...document.querySelectorAll("#results .result-status")].every((node) => node.textContent === "completed"), null, { timeout: 300_000 });
  assert.ok(await page.locator("#results .metric").count() >= 6);
  const conversationMetrics = page.locator("#results .result-card").nth(1).locator(":scope > .metric");
  assert.equal(await conversationMetrics.count(), 8);
  assert.deepEqual(await conversationMetrics.locator(":scope > .metric-heading > span:first-child").allTextContents(), [
    "Output quality", "Tool-use quality", "Deflection rate", "Customer satisfaction",
    "Task completion", "Coherence", "Groundedness", "Multi-topic rubric",
  ]);
  assert.equal(await conversationMetrics.nth(1).locator(":scope > .metric-heading > .score").innerText(), "Not applicable");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-report").click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "conversation-evaluation-report.json");
  const report = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.ok(report.runs.every((run) => !Object.hasOwn(run, "handle") && !Object.hasOwn(run, "prepared")));
  if (process.env.EXPECTED_JUDGE) assert.ok(report.runs.every((run) => run.result.provenance.judge === process.env.EXPECTED_JUDGE));
  if (process.env.EXPECTED_MODEL) {
    const models = report.runs.flatMap((run) => run.result.items.flatMap((item) => item.results.map((metric) => metric.sample?.model))).filter(Boolean);
    assert.ok(models.length > 0);
    assert.ok(models.every((model) => model.startsWith(process.env.EXPECTED_MODEL)));
  }
  await page.reload();
  await page.locator("#results .metric").first().waitFor();
  assert.equal(await page.locator("#results .result-card").count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL("../.local/mobile.png", import.meta.url)), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Anonymous UI, real live chat, both evaluation levels, export, reload, and mobile layout succeeded.");
} finally {
  await browser.close();
}
