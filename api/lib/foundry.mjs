import { createRequire } from "node:module";
import { HttpError } from "./core.mjs";

const require = createRequire(import.meta.url);

export function createFoundry(config) {
  if (!config.endpoint || !config.judge) throw new HttpError(503, "Foundry project and judge deployment are not configured.");
  const { AIProjectClient } = require("@azure/ai-projects");
  const { AzureCliCredential, ClientSecretCredential } = require("@azure/identity");
  let credential;
  if (config.localCredential) credential = new AzureCliCredential();
  else {
    if (!config.tenantId || !config.clientId || !config.clientSecret) throw new HttpError(503, "The server-side Foundry identity is not configured.");
    credential = new ClientSecretCredential(config.tenantId, config.clientId, config.clientSecret);
  }
  const project = new AIProjectClient(config.endpoint, credential);
  const openai = project.getOpenAIClient();
  openai.timeout = 35_000;
  openai.maxRetries = 0;
  return {
    project,
    createEvaluation: (body, signal) => openai.evals.create(body, { signal }),
    createRun: (evalId, body, signal) => openai.evals.runs.create(evalId, body, { signal }),
    getRun: (evalId, runId, signal) => openai.evals.runs.retrieve(runId, { eval_id: evalId }, { signal }),
    cancelRun: (evalId, runId, signal) => openai.evals.runs.cancel(runId, { eval_id: evalId }, { signal }),
    async outputItems(evalId, runId, signal) {
      const items = [];
      for await (const item of openai.evals.runs.outputItems.list(runId, { eval_id: evalId, limit: 50 }, { signal })) {
        items.push(item);
        if (items.length > 100) throw new HttpError(502, "The evaluation returned more items than this demo supports.");
      }
      if (items.every((item) => typeof item.datasource_item_id === "number")) items.sort((left, right) => left.datasource_item_id - right.datasource_item_id);
      return items;
    },
    chat: (messages, deployment, signal) => openai.chat.completions.create({
      model: deployment,
      messages,
      max_completion_tokens: 800,
    }, { signal }),
  };
}

export function configuration(env = process.env) {
  return {
    endpoint: env.FOUNDRY_PROJECT_ENDPOINT,
    judge: env.FOUNDRY_JUDGE_DEPLOYMENT,
    chat: env.FOUNDRY_CHAT_DEPLOYMENT,
    rubricName: env.FOUNDRY_RUBRIC_NAME,
    rubricVersion: env.FOUNDRY_RUBRIC_VERSION,
    signingKey: env.JOB_SIGNING_KEY,
    tenantId: env.FOUNDRY_TENANT_ID,
    clientId: env.FOUNDRY_CLIENT_ID,
    clientSecret: env.FOUNDRY_CLIENT_SECRET,
    localCredential: env.LOCAL_AZURE_CLI_CREDENTIAL === "true",
    liveEnabled: env.LIVE_CALLS_ENABLED === "true",
  };
}
