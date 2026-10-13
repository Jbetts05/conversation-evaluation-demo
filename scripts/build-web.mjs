import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../web/", import.meta.url);
const assets = new URL("assets/", root);
await mkdir(assets, { recursive: true });
const contentHash = (content) => createHash("sha256").update(content).digest("hex").slice(0, 12);
const metrics = await readFile(new URL("metrics.js", root), "utf8");
const metricsName = `metrics.${contentHash(metrics)}.js`;
const app = (await readFile(new URL("app.js", root), "utf8")).replace('"./metrics.js"', `"./${metricsName}"`);
const appName = `app.${contentHash(app)}.js`;
const styles = await readFile(new URL("styles.css", root), "utf8");
const stylesName = `styles.${contentHash(styles)}.css`;
const html = (await readFile(new URL("index.template.html", root), "utf8"))
  .replace('href="/styles.css"', `href="/assets/${stylesName}"`)
  .replace('src="/app.js"', `src="/assets/${appName}"`);
await Promise.all([
  writeFile(new URL(metricsName, assets), metrics),
  writeFile(new URL(appName, assets), app),
  writeFile(new URL(stylesName, assets), styles),
  writeFile(new URL("index.html", root), html),
]);
const hashes = (tag) => [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))]
  .map((match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
const configuration = {
  platform: { apiRuntime: "node:22" },
  routes: [
    { route: "/assets/*", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
    { route: "/reference-runs.json", headers: { "Cache-Control": "no-store" } },
  ],
  globalHeaders: {
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'self'; script-src 'self' ${hashes("script").join(" ")}; style-src 'self' ${hashes("style").join(" ")}; object-src 'none'; base-uri 'self'`,
  },
};
await writeFile(new URL("staticwebapp.config.json", root), JSON.stringify(configuration, null, 2) + "\n");
console.log("Generated versioned UI assets, revalidated HTML and Static Web Apps security policy.");
