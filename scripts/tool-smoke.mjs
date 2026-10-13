import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

const base = process.env.TEST_BASE_URL;
if (!base) throw new Error("Set TEST_BASE_URL to the deployed demo.");
async function request(path, body) {
  const response = await fetch(`${base}/api${path}`, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? `HTTP ${response.status}`);
  return data;
}
const corpus = await request("/catalog");
const entry = corpus.catalog.find((item) => item.scenario_id === "tool-grounded-billing" && item.variant === "well-handled");
const conversation = corpus.rows.find((item) => item.id === entry.conversation_id);
const prepared = await request("/evaluations/prepare", { conversation, level: "conversation" });
const submitted = await request("/evaluations/submit", { handle: prepared.handle, conversation });
const deadline = Date.now() + 10 * 60_000;
let result;
do {
  if (Date.now() > deadline) throw new Error(`Tool evaluation still pending: ${submitted.evaluation_id}/${submitted.run_id}`);
  await sleep(5000);
  result = await request("/evaluations/status", { handle: submitted.handle });
} while (!result.terminal);
assert.equal(result.status, "completed");
assert.equal(result.item_errors, 0);
assert.deepEqual(result.warnings, []);
const metrics = result.items.flatMap((item) => item.results ?? []);
for (const name of ["groundedness", "multi_topic_rubric"]) {
  const metric = metrics.find((item) => item.name === name);
  assert.ok(metric);
  assert.equal(metric.status, "completed");
}
console.log(JSON.stringify({ scenario: entry.scenario_id, run_id: submitted.run_id, scores: metrics.map((item) => ({ name: item.name, score: item.score, passed: item.passed })) }));
