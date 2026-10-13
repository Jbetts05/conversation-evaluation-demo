import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { scenarios } from "../data/scenarios.mjs";
import { buildCorpus } from "../api/lib/dataset.mjs";

const root = new URL("../", import.meta.url);
const rubric = JSON.parse(await readFile(new URL("data/rubric.json", root), "utf8"));
const { rows, catalog } = buildCorpus(scenarios, rubric);
const byId = new Map(rows.map((row) => [row.id, row]));
const jsonl = (items) => `${items.map((item) => JSON.stringify(item)).join("\n")}\n`;
const outputs = new Map([
  ["data/generated/conversations.jsonl", jsonl(rows)],
  ["data/generated/catalog.json", `${JSON.stringify({ version: "1", source: "authored-synthetic", conversations: catalog }, null, 2)}\n`],
  ["api/data/corpus.json", `${JSON.stringify({ rows, catalog, rubric })}\n`],
]);
for (const split of ["calibration", "holdout"]) {
  outputs.set(`data/generated/${split}.jsonl`, jsonl(
    catalog.filter((entry) => entry.split === split).map((entry) => byId.get(entry.conversation_id)),
  ));
}

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--check")) throw new Error("Only --check is supported");
const checkOnly = args.includes("--check");
if (!checkOnly) {
  await mkdir(new URL("data/generated/", root), { recursive: true });
  await mkdir(new URL("api/data/", root), { recursive: true });
}
for (const [path, content] of outputs) {
  const url = new URL(path, root);
  if (checkOnly) {
    const actual = await readFile(url, "utf8");
    if (actual !== content) throw new Error(`Generated dataset is stale: ${fileURLToPath(url)}`);
  } else {
    await writeFile(url, content, "utf8");
  }
}
const counts = Object.fromEntries(["calibration", "holdout"].map((split) => [
  split, catalog.filter((entry) => entry.split === split).length,
]));
console.log(`${checkOnly ? "Checked" : "Built"} ${scenarios.length} paired scenarios, ${rows.length} conversations: ${JSON.stringify(counts)}. This command makes no cloud calls.`);
