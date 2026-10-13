import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { createFoundry, configuration } from "../api/lib/foundry.mjs";
import { evaluationDefinition, evaluationRun, snapshot, terminal } from "../api/lib/core.mjs";
import { loadCorpus } from "../api/lib/application.mjs";
import { inspectResults } from "../api/lib/evaluation-results.mjs";

const root = new URL("../", import.meta.url);
process.loadEnvFile(new URL(".local.env", root));
const config = configuration();
const corpus = await loadCorpus();
const definition = corpus.rubric.definition;
const hash = createHash("sha256").update(JSON.stringify(definition)).digest("hex").slice(0, 12);
const name = `conversation-lab-rubric-${hash}`;
const provider = createFoundry(config);
const folder = new URL(".foundry/results/", root);
await mkdir(folder, { recursive: true });

const existing = [];
for await (const evaluator of provider.project.evaluators.list()) {
  if (evaluator.name === name) existing.push(evaluator);
}
console.log(`Judge deployment: ${config.judge}`);
let rubric = existing[0];
if (!rubric) {
  rubric = await provider.project.evaluators.createVersion(name, {
    name,
    evaluator_type: "custom",
    categories: ["quality"],
    display_name: "Conversation Lab multi-topic rubric",
    description: "Authored rubric for fictional multi-topic telecom conversations.",
    supported_evaluation_levels: ["conversation"],
    definition,
  });
}
if (!rubric.version || !rubric.supported_evaluation_levels?.includes("conversation")) {
  throw new Error("The registered rubric does not confirm conversation-level support.");
}
config.rubricName = name;
config.rubricVersion = rubric.version;
await writeFile(new URL("rubric-registration.json", folder), JSON.stringify(rubric, null, 2) + "\n");
let envText = await readFile(new URL(".local.env", root), "utf8");
envText = envText.split("\n").filter((line) => !line.startsWith("FOUNDRY_RUBRIC_NAME=") && !line.startsWith("FOUNDRY_RUBRIC_VERSION=")).join("\n").trimEnd();
await writeFile(new URL(".local.env", root), `${envText}\nFOUNDRY_RUBRIC_NAME=${JSON.stringify(name)}\nFOUNDRY_RUBRIC_VERSION=${JSON.stringify(rubric.version)}\n`, { mode: 0o600 });
console.log(`Registered rubric ${name}, version ${rubric.version}, conversation support verified.`);

const selected = corpus.catalog.filter((entry) => entry.scenario_id === "resume-unfinished-request");
const started = new Date().toISOString().replaceAll(":", "-");
const journal = new URL(`smoke-${started}.jsonl`, folder);
const jobs = [];
for (const entry of selected) {
  const row = corpus.rows.find((item) => item.id === entry.conversation_id);
  const item = snapshot(row);
  for (const level of ["turn", "conversation"]) {
    const createBody = evaluationDefinition(level, config.judge, name, entry.transcript_sha256);
    const evaluation = await provider.createEvaluation(createBody);
    await appendFile(journal, JSON.stringify({ operation: "prepared", evaluation_id: evaluation.id, level, conversation_id: row.id }) + "\n");
    const run = await provider.createRun(evaluation.id, evaluationRun(item, level));
    const job = { entry, item, level, evaluation_id: evaluation.id, run_id: run.id, status: run.status, definition: createBody };
    jobs.push(job);
    await appendFile(journal, JSON.stringify({ operation: "submitted", ...job }) + "\n");
    console.log(`Submitted ${entry.variant} ${level}: ${run.id}`);
  }
}

const deadline = Date.now() + 15 * 60_000;
while (jobs.some((job) => !terminal(job.status))) {
  if (Date.now() > deadline) throw new Error(`Evaluation wait exceeded 15 minutes. Resume using IDs in ${journal.pathname}.`);
  await sleep(5000);
  for (const job of jobs.filter((candidate) => !terminal(candidate.status))) {
    const run = await provider.getRun(job.evaluation_id, job.run_id);
    job.status = run.status;
    job.run = run;
    if (terminal(job.status)) console.log(`${job.entry.variant} ${job.level}: ${job.status}`);
  }
}
let failed = false;
for (const job of jobs) {
  job.items = job.status === "completed" ? await provider.outputItems(job.evaluation_id, job.run_id) : [];
  await writeFile(new URL(`${job.entry.conversation_id}-${job.level}-${started}.json`, folder), JSON.stringify(job, null, 2) + "\n");
  if (job.status !== "completed" || job.run?.result_counts?.errored) failed = true;
  const inspection = inspectResults(job.items, job.definition.testing_criteria.map((criterion) => criterion.name), { noToolDefinitions: job.item.tool_definitions.length === 0 });
  if (inspection.errors || inspection.warnings.length) {
    failed = true;
    console.error(JSON.stringify({ run_id: job.run_id, inspection }));
  }
  const rubricResult = job.items.flatMap((item) => item.results ?? []).find((result) => result.name === "multi_topic_rubric");
  console.log(JSON.stringify({
    variant: job.entry.variant, level: job.level, status: job.status,
    result_counts: job.run?.result_counts,
    rubric: rubricResult ?? null,
  }));
}
if (failed) throw new Error("A cloud smoke evaluation failed or included evaluator errors; inspect persisted reports.");
console.log("Smoke evaluation artifacts persisted. These observations are not a representative benchmark.");
