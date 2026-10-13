import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { application, loadCorpus } from "../api/lib/application.mjs";
import { configuration } from "../api/lib/foundry.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
try { process.loadEnvFile(resolve(root, ".local.env")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const dispatch = application({ corpus: await loadCorpus(), config: configuration() });
const web = resolve(root, "web");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 120_000) {
          response.writeHead(413, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: { message: "Request exceeds 120 KB." } }));
          return;
        }
        chunks.push(chunk);
      }
      let body;
      if (length) {
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: { message: "Invalid JSON." } }));
          return;
        }
      }
      const result = await dispatch({ method: request.method, path: url.pathname.slice(4), body });
      response.writeHead(result.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(result.body));
      return;
    }
    const target = resolve(web, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
    if (!target.startsWith(`${web}${sep}`)) { response.writeHead(403); response.end(); return; }
    response.writeHead(200, { "Content-Type": types[extname(target)] ?? "application/octet-stream" });
    response.end(await readFile(target));
  } catch (error) {
    console.error(JSON.stringify({ name: error.name, code: error.code }));
    if (!response.headersSent) response.writeHead(error.code === "ENOENT" ? 404 : 500);
    response.end("Request failed.");
  }
});
const port = Number(process.env.PORT ?? 8787);
server.listen(port, "127.0.0.1", () => console.log(`Conversation Lab: http://127.0.0.1:${port}`));
