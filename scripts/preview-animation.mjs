import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const svgUrl = new URL("../docs/conversation-lab.svg", import.meta.url);
const reference = JSON.parse(await readFile(new URL("../web/reference-runs.json", import.meta.url), "utf8"));
const turn = reference.runs.find((run) => run.level === "turn" && run.title.startsWith("Faulty"));
const conversation = reference.runs.find((run) => run.level === "conversation" && run.title.startsWith("Faulty"));
assert.equal(turn.result.result_counts.passed, 2);
assert.equal(turn.result.result_counts.total, 4);
assert.equal(conversation.result.items.flatMap((item) => item.results).find((result) => result.name === "task_completion" && result.metric === "task_completion").score, 0);
await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 760 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(svgUrl.href);
  const outside = await page.evaluate(() => [...document.querySelectorAll("text")].filter((node) => {
    const box = node.getBBox();
    return box.x < 0 || box.y < 0 || box.x + box.width > 1120 || box.y + box.height > 760;
  }).map((node) => node.textContent));
  assert.deepEqual(outside, []);
  await page.screenshot({ path: fileURLToPath(new URL("../.local/animation-static.png", import.meta.url)) });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await page.waitForTimeout(9000);
  await page.screenshot({ path: fileURLToPath(new URL("../.local/animation-active.png", import.meta.url)) });
  assert.ok(await page.locator("svg").count());
  console.log("Animation and reduced-motion rendering succeeded; illustrated scores match the genuine reference run.");
} finally {
  await browser.close();
}
