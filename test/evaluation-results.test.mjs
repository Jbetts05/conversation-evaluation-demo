import test from "node:test";
import assert from "node:assert/strict";
import { inspectResults } from "../api/lib/evaluation-results.mjs";

test("recognizes genuine no-tools applicability skips without accepting unsupported skips", () => {
  const result = { name: "tool_use_quality", metric: "tool_use_quality", status: "skipped", label: "not_applicable", score: null };
  const items = [{ id: "1", results: [result] }];
  assert.deepEqual(inspectResults(items, ["tool_use_quality"], { noToolDefinitions: true }), { errors: 0, unexpectedSkips: 0, warnings: [] });
  assert.equal(inspectResults(items, ["tool_use_quality"], { noToolDefinitions: false }).unexpectedSkips, 1);
  const unsupported = [{ id: "1", results: [{ ...result, name: "output_quality", metric: "output_quality", reason: "Unsupported level" }] }];
  assert.equal(inspectResults(unsupported, ["output_quality"], { noToolDefinitions: true }).unexpectedSkips, 1);
});

test("component scores cannot hide a missing composite gate", () => {
  const items = [{ id: "1", results: [{ name: "output_quality", metric: "coherence", status: "completed", score: 5 }] }];
  assert.match(inspectResults(items, ["output_quality"]).warnings[0], /missing primary/);
});

test("quality failures are not mistaken for execution errors", () => {
  const items = [{ id: "1", results: [{ name: "task_completion", metric: "task_completion", status: "completed", score: 0, label: "fail" }] }];
  assert.deepEqual(inspectResults(items, ["task_completion"]), { errors: 0, unexpectedSkips: 0, warnings: [] });
  items[0].results[0].status = "error";
  assert.equal(inspectResults(items, ["task_completion"]).errors, 1);
});
