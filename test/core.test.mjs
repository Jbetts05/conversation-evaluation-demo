import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { snapshot, transcriptHash, createHandles, criteria, evaluationRun, makeLimiter } from "../api/lib/core.mjs";
import { application, loadCorpus } from "../api/lib/application.mjs";

const corpus = await loadCorpus();
const row = corpus.rows[0];

test("deployment dependencies have no parent-package links or recursive symlinks", async () => {
  const manifest = JSON.parse(await readFile(new URL("../api/package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../api/package-lock.json", import.meta.url), "utf8"));
  assert.ok(Object.values(manifest.dependencies).every((version) => !/^(file:|link:)/.test(version)));
  assert.deepEqual(lock.packages[""].dependencies, manifest.dependencies);
  assert.ok(Object.values(lock.packages).every((entry) => !entry.link));
});

test("sanitizes inputs, rejects incomplete dialogues and preserves hashes", () => {
  const input = { ...row, authored_expectation: "do not send this" };
  assert.deepEqual(Object.keys(snapshot(input)), ["messages", "tool_definitions"]);
  assert.equal(transcriptHash(snapshot(input)), corpus.catalog[0].transcript_sha256);
  assert.throws(() => snapshot({ messages: row.messages.slice(0, -1) }), /completed assistant/);
  assert.throws(() => snapshot({ messages: [{ role: "user", content: "hello" }, ...row.messages.slice(1)] }), /system message/);
  assert.throws(() => snapshot({ messages: row.messages, tool_definitions: [null] }), /tool name/);
  assert.throws(() => snapshot({ messages: row.messages, junk: "a".repeat(100_001) }), /100 KB/);
});

test("run handles reject tampering, expiry and cross-purpose use", () => {
  let now = 0;
  const handles = createHandles("k".repeat(48), () => now);
  const handle = handles.issue({ purpose: "run", evalId: "eval1", runId: "run1" });
  assert.equal(handles.read(handle, "run").runId, "run1");
  assert.throws(() => handles.read(`${handle}x`, "run"), /not valid/);
  assert.throws(() => handles.read(handle, "prepared"), /wrong purpose/);
  now = 86_400_001;
  assert.throws(() => handles.read(handle, "run"), /expired/);
});

test("uses explicit metric levels and requires a registered conversation rubric", () => {
  assert.deepEqual(criteria("turn", "judge", "rubric").map((item) => item.name), ["relevance", "intent_resolution"]);
  assert.ok(criteria("conversation", "judge", "rubric").some((item) => item.name === "multi_topic_rubric"));
  for (const level of ["turn", "conversation"]) {
    for (const criterion of criteria(level, "judge", "rubric")) {
      if (["intent_resolution", "task_completion", "multi_topic_rubric"].includes(criterion.name)) {
        assert.equal(criterion.data_mapping.tool_definitions, "{{item.tool_definitions}}");
      }
    }
  }
  assert.throws(() => criteria("conversation", "judge", null), /registered/);
  assert.throws(() => criteria("wrong", "judge", "rubric"), /Unknown/);
});

test("turn evaluation explicitly scores each completed exchange with no future leakage", () => {
  const input = snapshot(row);
  const turnRun = evaluationRun(input, "turn");
  const records = turnRun.data_source.source.content;
  assert.equal(records.length, input.messages.filter((message) => message.role === "user").length);
  for (const [index, record] of records.entries()) {
    assert.equal(record.item.messages.filter((message) => message.role === "user").length, index + 1);
    assert.equal(record.item.messages.at(-1).role, "assistant");
    assert.deepEqual(record.item.messages, input.messages.slice(0, record.item.messages.length));
  }
  assert.equal(evaluationRun(input, "conversation").data_source.source.content.length, 1);
});

test("concurrency limits release slots after errors and enforce start limits", async () => {
  let now = 0;
  const limit = makeLimiter({ maxActive: 1, startsPerMinute: 2, now: () => now });
  await assert.rejects(limit(async () => { throw new Error("failed"); }), /failed/);
  assert.equal(await limit(async () => "ok"), "ok");
  await assert.rejects(limit(async () => "blocked"), /busy/);
  now = 60_001;
  assert.equal(await limit(async () => "new minute"), "new minute");
});

test("API submits and reads the same frozen transcript without leaking gold metadata", async () => {
  let submitted;
  let creates = 0;
  const provider = {
    createEvaluation: async () => ({ id: "eval1" }),
    createRun: async (id, body) => { creates++; submitted = body; return { id: "run1", status: "queued" }; },
    getRun: async () => ({ status: "completed", result_counts: { errored: 0 } }),
    outputItems: async () => [{ results: [{ name: "relevance", score: 5, passed: true }] }],
    cancelRun: async () => ({ status: "canceled" }),
  };
  const dispatch = application({
    corpus, config: { liveEnabled: true, judge: "judge", rubricName: "rubric", signingKey: "k".repeat(48) },
    providerFactory: () => provider, log: () => {},
  });
  const prepared = await dispatch({ method: "POST", path: "/evaluations/prepare", body: { conversation: row, level: "turn" } });
  assert.equal(prepared.status, 200);
  const changed = structuredClone(row);
  changed.messages.at(-1).content += " changed";
  const conflict = await dispatch({ method: "POST", path: "/evaluations/submit", body: { handle: prepared.body.handle, conversation: changed } });
  assert.equal(conflict.status, 409);
  assert.equal(creates, 0);
  const submittedResponse = await dispatch({ method: "POST", path: "/evaluations/submit", body: { handle: prepared.body.handle, conversation: row } });
  assert.equal(submittedResponse.status, 200);
  assert.equal(submitted.evaluation_level, "turn");
  assert.deepEqual(Object.keys(submitted.data_source.source.content[0].item), ["messages", "tool_definitions"]);
  const result = await dispatch({ method: "POST", path: "/evaluations/status", body: { handle: submittedResponse.body.handle } });
  assert.equal(result.status, 200);
  assert.equal(result.body.provenance.transcript_sha256, transcriptHash(snapshot(row)));
  assert.equal(creates, 1);
});

test("anonymous catalog works without credentials, but missing signing key prevents an orphan evaluation", async () => {
  let invoked = false;
  const dispatch = application({
    corpus, config: { liveEnabled: true, judge: "judge", rubricName: "rubric" },
    providerFactory: () => { invoked = true; throw new Error("should not be reached"); }, log: () => {},
  });
  const catalog = await dispatch({ method: "GET", path: "/catalog" });
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.configuration.visitorAuthentication, false);
  const prepare = await dispatch({ method: "POST", path: "/evaluations/prepare", body: { conversation: row, level: "turn" } });
  assert.equal(prepare.status, 503);
  assert.equal(invoked, false);
});
