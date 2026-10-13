import { readdir, readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { criteria } from "../api/lib/core.mjs";
import { inspectResults } from "../api/lib/evaluation-results.mjs";

process.loadEnvFile(new URL("../.local.env", import.meta.url));
const judge = process.env.FOUNDRY_JUDGE_DEPLOYMENT;
if (!judge) throw new Error("Configure the judge deployment before exporting reference runs.");
const folder = new URL("../.foundry/results/", import.meta.url);
const names = (await readdir(folder)).filter((name) => /^conversation-v1-00[78]-(turn|conversation)-.*\.json$/.test(name)).sort().reverse();
const selected = new Map();
for (const name of names) {
  const job = JSON.parse(await readFile(new URL(name, folder), "utf8"));
  const key = `${job.entry.conversation_id}-${job.level}`;
  if (selected.has(key)) continue;
  if (!isDeepStrictEqual(job.definition.testing_criteria, criteria(job.level, judge, process.env.FOUNDRY_RUBRIC_NAME))) continue;
  if (job.status !== "completed" || job.run.result_counts?.errored) continue;
  const inspection = inspectResults(job.items, job.definition.testing_criteria.map((criterion) => criterion.name), { noToolDefinitions: job.item.tool_definitions.length === 0 });
  if (inspection.errors || inspection.warnings.length) continue;
  if (job.level === "turn" && job.items.length !== job.item.messages.filter((message) => message.role === "user").length) continue;
  selected.set(key, job);
}
if (selected.size !== 4) throw new Error(`Four completed per-turn/conversation reference runs using ${judge} are required.`);
const runs = [...selected.values()].map((job) => ({
  title: `${job.entry.variant === "faulty" ? "Faulty" : "Well handled"} · recorded`,
  source: "recorded-foundry-run",
  level: job.level,
  status: "completed",
  snapshot: job.item,
  hash: job.run.metadata.transcript_sha256,
  definition: job.definition,
  evaluation_id: job.evaluation_id,
  run_id: job.run_id,
  result: {
    status: "completed",
    terminal: true,
    result_counts: job.run.result_counts,
    item_errors: 0,
    warnings: [],
    items: job.items,
    provenance: {
      evaluation_id: job.evaluation_id,
      run_id: job.run_id,
      level: job.level,
      transcript_sha256: job.run.metadata.transcript_sha256,
      judge: job.definition.testing_criteria[0].initialization_parameters.deployment_name,
      rubric_name: job.definition.testing_criteria.find((criterion) => criterion.name === "multi_topic_rubric")?.evaluator_name ?? null,
      recorded_at: new Date(job.run.created_at * 1000).toISOString(),
    },
  },
}));
runs.sort((left, right) => left.title.localeCompare(right.title) || right.level.localeCompare(left.level));
await writeFile(new URL("../web/reference-runs.json", import.meta.url), JSON.stringify({ description: "Genuine saved Foundry runs on fictional transcripts; not live results.", runs }) + "\n");
console.log("Exported four genuine recorded runs without credentials or signed run handles.");
