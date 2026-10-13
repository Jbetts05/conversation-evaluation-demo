import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

test("deployed UI and its module dependency are content-versioned and HTML revalidates", async () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-web.mjs", import.meta.url))]);
  const root = new URL("../web/", import.meta.url);
  const html = await readFile(new URL("index.html", root), "utf8");
  const appName = html.match(/src="\/assets\/(app\.([a-f0-9]{12})\.js)"/);
  assert.ok(appName);
  const app = await readFile(new URL(`assets/${appName[1]}`, root), "utf8");
  assert.equal(createHash("sha256").update(app).digest("hex").slice(0, 12), appName[2]);
  const metricsName = app.match(/from "\.\/(metrics\.([a-f0-9]{12})\.js)"/);
  assert.ok(metricsName);
  const metrics = await readFile(new URL(`assets/${metricsName[1]}`, root), "utf8");
  assert.equal(createHash("sha256").update(metrics).digest("hex").slice(0, 12), metricsName[2]);
  assert.match(html, /href="\/assets\/styles\.[a-f0-9]{12}\.css"/);
  const config = JSON.parse(await readFile(new URL("staticwebapp.config.json", root), "utf8"));
  assert.equal(config.globalHeaders["Cache-Control"], "no-cache");
  assert.match(config.routes.find((route) => route.route === "/assets/*").headers["Cache-Control"], /immutable/);
  assert.equal(config.routes.find((route) => route.route === "/reference-runs.json").headers["Cache-Control"], "no-store");
});
