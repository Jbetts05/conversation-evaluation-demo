import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { scenarios } from "../data/scenarios.mjs";
import { buildCorpus, evaluationItem, turnContexts } from "../api/lib/dataset.mjs";

const rubric = JSON.parse(await readFile(new URL("../data/rubric.json", import.meta.url), "utf8"));
const corpus = buildCorpus(scenarios, rubric);

test("builds 12 controlled pairs with 18 calibration and 6 holdout conversations", () => {
  assert.equal(scenarios.length, 12);
  assert.equal(corpus.rows.length, 24);
  assert.equal(corpus.catalog.filter((entry) => entry.split === "calibration").length, 18);
  assert.equal(corpus.catalog.filter((entry) => entry.split === "holdout").length, 6);
  for (const scenario of scenarios) {
    const entries = corpus.catalog.filter((entry) => entry.scenario_id === scenario.id);
    assert.deepEqual(entries.map((entry) => entry.variant), ["well-handled", "faulty"]);
    assert.equal(new Set(entries.map((entry) => entry.split)).size, 1);
  }
});

test("has resolved switches, returns, interruptions, withdrawal, correction, ambiguity, recovery and tool evidence", () => {
  const ids = new Set(scenarios.map((scenario) => scenario.id));
  for (const id of [
    "resolved-topic-switch", "return-to-billing", "resume-unfinished-request",
    "withdrawn-request", "corrected-trip", "ambiguous-reference",
    "recover-from-failure", "tool-grounded-billing", "wrong-tool-account",
  ]) assert.ok(ids.has(id));
  assert.equal(scenarios.filter((scenario) => scenario.toolDefinitions).length, 2);
});

test("keeps authored labels, expectations and topics out of evaluator inputs", () => {
  for (const row of corpus.rows) {
    const item = evaluationItem(row);
    assert.deepEqual(Object.keys(item), ["messages", "tool_definitions"]);
    assert.equal(typeof row.id, "string");
    assert.ok(!row.id.includes("faulty") && !row.id.includes("well-handled"));
    item.messages[0].content = "changed";
    assert.notEqual(row.messages[0].content, "changed");
  }
});

test("the unresolved-request contrast has a correct latest-topic answer and identical polite ending", () => {
  const entries = corpus.catalog.filter((entry) => entry.scenario_id === "resume-unfinished-request");
  const [good, faulty] = entries.map((entry) => corpus.rows.find((row) => row.id === entry.conversation_id));
  assert.deepEqual(good.messages.slice(-2), faulty.messages.slice(-2));
  assert.equal(faulty.messages.at(-1).content, "You are welcome.");
  assert.match(faulty.messages.at(-3).content, /Settings > Mobile > Data roaming/);
  assert.doesNotMatch(faulty.messages.at(-3).content, /Support > Billing > Dispute/);
  assert.match(good.messages.at(-3).content, /Support > Billing > Dispute/);
});

test("turn contexts include prior evidence but never future messages", () => {
  for (const entry of corpus.catalog) {
    const row = corpus.rows.find((candidate) => candidate.id === entry.conversation_id);
    const prefixes = turnContexts(row, entry);
    for (const [index, prefix] of prefixes.entries()) {
      assert.deepEqual(prefix.messages, row.messages.slice(0, entry.turns[index].end));
      assert.equal(prefix.messages.filter((message) => message.role === "user").length, index + 1);
      assert.equal(prefix.messages.at(-1).role, "assistant");
    }
  }
});

test("rejects duplicate scenario IDs and unknown rubric dimensions", () => {
  assert.throws(() => buildCorpus([scenarios[0], scenarios[0]], rubric), /Duplicate scenario ID/);
  const changed = structuredClone(scenarios[0]);
  changed.focus = "unknown";
  assert.throws(() => buildCorpus([changed], rubric), /unknown focus dimension/);
});

test("rejects a fault outside the declared outcome evidence", () => {
  const changed = structuredClone(scenarios[0]);
  changed.outcomes[1].evidenceTurns = ["bill-reason"];
  assert.throws(() => buildCorpus([changed], rubric), /fault outside outcome evidence/);
});

test("rejects identical paired variants", () => {
  const changed = structuredClone(scenarios[0]);
  changed.fault.assistant = changed.turns.find((turn) => turn.id === changed.fault.turnId).assistant;
  assert.throws(() => buildCorpus([changed], rubric), /fault is not isolated/);
});

test("rejects missing, orphaned and mismatched tool responses", () => {
  const toolScenario = scenarios.find((scenario) => scenario.id === "tool-grounded-billing");
  const missing = structuredClone(toolScenario);
  missing.turns[0].assistant.splice(1, 1);
  assert.throws(() => buildCorpus([missing], rubric), /misplaced assistant/);
  const orphan = structuredClone(toolScenario);
  orphan.turns[0].assistant[1].tool_call_id = "missing-call";
  assert.throws(() => buildCorpus([orphan], rubric), /orphan tool response/);
  const mismatch = structuredClone(toolScenario);
  const result = JSON.parse(mismatch.turns[0].assistant[1].content);
  result.account_id = "DEMO-002";
  mismatch.turns[0].assistant[1].content = JSON.stringify(result);
  assert.throws(() => buildCorpus([mismatch], rubric), /does not match called account/);
});

test("the wrong-account negative remains structurally valid and internally grounded", () => {
  const entry = corpus.catalog.find((item) => item.scenario_id === "wrong-tool-account" && item.variant === "faulty");
  const row = corpus.rows.find((item) => item.id === entry.conversation_id);
  const call = row.messages.find((message) => message.tool_calls);
  const result = row.messages.find((message) => message.role === "tool");
  assert.equal(JSON.parse(call.tool_calls[0].function.arguments).account_id, "DEMO-001");
  assert.equal(JSON.parse(result.content).account_id, "DEMO-001");
  assert.match(row.messages.at(-2).content, /DEMO-001/);
  assert.match(row.messages.findLast((message) => message.role === "user").content, /DEMO-002, not DEMO-001/);
});

test("generated artifacts exactly match the source without leaking pair labels into JSONL", async () => {
  const text = await readFile(new URL("../data/generated/conversations.jsonl", import.meta.url), "utf8");
  assert.ok(text.endsWith("\n"));
  assert.deepEqual(text.trim().split("\n").map((line) => JSON.parse(line)), corpus.rows);
  const catalog = JSON.parse(await readFile(new URL("../data/generated/catalog.json", import.meta.url), "utf8"));
  assert.deepEqual(catalog.conversations, corpus.catalog);
  const observedIds = new Set();
  for (const split of ["calibration", "holdout"]) {
    const contents = await readFile(new URL(`../data/generated/${split}.jsonl`, import.meta.url), "utf8");
    const rows = contents.trim().split("\n").map((line) => JSON.parse(line));
    const expectedIds = corpus.catalog.filter((entry) => entry.split === split).map((entry) => entry.conversation_id);
    assert.deepEqual(rows.map((row) => row.id), expectedIds);
    for (const row of rows) {
      assert.ok(!observedIds.has(row.id));
      observedIds.add(row.id);
      assert.deepEqual(Object.keys(row), ["id", "messages", "tool_definitions"]);
    }
  }
  assert.equal(observedIds.size, corpus.rows.length);
  assert.ok(corpus.catalog.every((entry) => entry.authored_expectation.measured === false));
});
