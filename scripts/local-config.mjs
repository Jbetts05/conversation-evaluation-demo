import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const required = ["FOUNDRY_PROJECT_ENDPOINT", "FOUNDRY_JUDGE_DEPLOYMENT", "FOUNDRY_CHAT_DEPLOYMENT"];
if (required.some((name) => !process.env[name])) throw new Error("Provide the confirmed Foundry project, judge and chat deployments.");
const settings = Object.fromEntries(required.map((name) => [name, process.env[name]]));
settings.JOB_SIGNING_KEY = randomBytes(48).toString("base64url");
settings.LIVE_CALLS_ENABLED = "true";
for (const name of ["FOUNDRY_TENANT_ID", "FOUNDRY_CLIENT_ID", "FOUNDRY_CLIENT_SECRET"]) {
  if (process.env[name]) settings[name] = process.env[name];
}
if (!settings.FOUNDRY_CLIENT_SECRET) settings.LOCAL_AZURE_CLI_CREDENTIAL = "true";
await writeFile(new URL("../.local.env", import.meta.url), Object.entries(settings).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
console.log("Created ignored local settings; no credential values were printed.");
