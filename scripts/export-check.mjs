import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.TEST_BASE_URL ?? "http://127.0.0.1:8787");
  await page.locator("#scenario:not([disabled])").waitFor();
  await page.evaluate(async () => {
    const reference = await (await fetch("/reference-runs.json")).json();
    const runs = reference.runs.map((run) => ({ ...run, handle: "test-capability", prepared: "test-prepared-capability" }));
    sessionStorage.setItem("conversation-lab-runs-v1", JSON.stringify(runs));
  });
  await page.reload();
  await page.locator("#export-report:not([disabled])").waitFor();
  const pending = page.waitForEvent("download");
  await page.locator("#export-report").click();
  const download = await pending;
  const report = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(report.runs.length, 4);
  assert.ok(report.runs.every((run) => !Object.hasOwn(run, "handle") && !Object.hasOwn(run, "prepared")));
  assert.ok(report.runs.every((run) => run.result.provenance.run_id));
  console.log("Report export preserves real results/provenance and omits run-control capabilities.");
} finally {
  await browser.close();
}
