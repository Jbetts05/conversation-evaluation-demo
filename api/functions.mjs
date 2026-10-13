import { createRequire } from "node:module";
import { application, loadCorpus } from "./lib/application.mjs";
import { configuration } from "./lib/foundry.mjs";

const require = createRequire(import.meta.url);
const { app } = require("@azure/functions");
const dispatch = application({ corpus: await loadCorpus(), config: configuration() });

app.http("conversationLab", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "{*path}",
  handler: async (request) => {
    const path = new URL(request.url).pathname.replace(/^\/api/, "");
    let body;
    if (request.method === "POST") {
      const text = await request.text();
      if (Buffer.byteLength(text, "utf8") > 120_000) return { status: 413, jsonBody: { error: { message: "Request exceeds 120 KB." } } };
      try { body = JSON.parse(text); }
      catch { return { status: 400, jsonBody: { error: { message: "Request contains invalid JSON." } } }; }
    }
    const result = await dispatch({ method: request.method, path, body });
    return { status: result.status, jsonBody: result.body, headers: { "Cache-Control": "no-store" } };
  },
});
