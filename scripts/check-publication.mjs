import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (args, input) => execFileSync("git", args, { cwd: root, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const protectedNames = /^(\.local\.env$|\.local\/|\.venv\/|\.foundry\/results\/|api\/local\.settings\.json$)/;
const tracked = git(["ls-files"]).trim().split("\n");
if (tracked.some((name) => protectedNames.test(name))) throw new Error("Protected local artifacts are tracked.");

try { process.loadEnvFile(new URL("../.local.env", import.meta.url)); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const knownSecrets = ["FOUNDRY_CLIENT_SECRET", "JOB_SIGNING_KEY"].map((name) => process.env[name]).filter((value) => value?.length >= 20);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  /DefaultEndpointsProtocol=https?;AccountName=[\w-]+;AccountKey=[A-Za-z0-9+/=]{40,}/,
  /[?&]sig=[A-Za-z0-9%+/=]{30,}/,
];
const objects = git(["rev-list", "--objects", "--all"]).trim().split("\n");
const types = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], objects.map((line) => line.split(" ")[0]).join("\n") + "\n").trim().split("\n");
let checked = 0;
for (const [index, descriptor] of types.entries()) {
  const [id, type] = descriptor.split(" ");
  if (type !== "blob") continue;
  const content = git(["cat-file", "blob", id]);
  checked++;
  if (knownSecrets.some((secret) => content.includes(secret)) || patterns.some((pattern) => pattern.test(content))) {
    throw new Error(`Potential credential in history: ${id.slice(0, 12)} (${objects[index].slice(id.length + 1)}). Values are intentionally not printed.`);
  }
}
const reference = JSON.parse(await readFile(new URL("../web/reference-runs.json", import.meta.url), "utf8"));
if (reference.runs.some((run) => Object.hasOwn(run, "handle") || Object.hasOwn(run, "prepared"))) {
  throw new Error("Recorded public results contain a run-control capability.");
}
console.log(`Checked ${tracked.length} tracked files and ${checked} historical blobs; protected local artifacts are excluded and no targeted credential patterns or known runtime secrets were found. This is a targeted publication check, not a complete security audit.`);
