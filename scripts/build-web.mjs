import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../web/", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const hashes = (tag) => [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))]
  .map((match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
const configuration = {
  platform: { apiRuntime: "node:22" },
  globalHeaders: {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'self'; script-src 'self' ${hashes("script").join(" ")}; style-src 'self' ${hashes("style").join(" ")}; object-src 'none'; base-uri 'self'`,
  },
};
await writeFile(new URL("staticwebapp.config.json", root), JSON.stringify(configuration, null, 2) + "\n");
console.log("Generated Static Web Apps runtime and content-security policy.");
