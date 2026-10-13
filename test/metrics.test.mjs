import test from "node:test";
import assert from "node:assert/strict";
import { metricTitle, scoreText, resultState, groupMetrics } from "../web/metrics.js";

test("composite gates and components retain their own native scales", () => {
  assert.equal(scoreText({ name: "output_quality", metric: "output_quality", score: 1 }), "1/1");
  assert.equal(scoreText({ name: "tool_use_quality", metric: "tool_use_quality", score: 0 }), "0/1");
  assert.equal(metricTitle({ name: "output_quality", metric: "coherence" }), "Output quality · Coherence");
  assert.equal(scoreText({ name: "output_quality", metric: "coherence", score: 4 }), "4/5");
  assert.equal(scoreText({ name: "output_quality", metric: "task_completion", score: 1 }), "1/1");
});

test("unknown metric scales and deflection rate are not assigned an invented denominator", () => {
  assert.equal(scoreText({ name: "deflection_rate", score: 0.75 }), "0.75");
  assert.equal(scoreText({ name: "future_metric", score: 0.2 }), "0.2");
});

test("not-applicable and skipped metrics cannot masquerade as quality failures or passes", () => {
  assert.equal(scoreText({ name: "tool_use_quality", status: "not_applicable", score: 0, passed: false }), "Not applicable");
  assert.equal(resultState({ status: "not_applicable", score: 0, passed: false }), "skipped");
  assert.equal(scoreText({ status: "skipped", score: 1, passed: true }), "Skipped");
  assert.equal(resultState({ status: "skipped", passed: true }), "skipped");
  assert.equal(scoreText({ status: "skipped", label: "not_applicable", score: null }), "Not applicable");
});

test("native categorical verdicts and evaluator errors are surfaced distinctly", () => {
  assert.equal(scoreText({ score: null, label: "pass" }), "Pass");
  assert.equal(resultState({ score: null, label: "pass" }), "pass");
  assert.equal(scoreText({ status: "error", score: null }), "Evaluator error");
  assert.equal(resultState({ status: "error", passed: false }), "error");
  assert.equal(scoreText({ score: {} }), "Invalid score format");
});

test("composite drill-down keeps standalone metrics independent and preserves every result", () => {
  const rows = [
    { name: "output_quality", metric: "output_quality", score: 1 },
    { name: "output_quality", metric: "coherence", score: 5 },
    { name: "coherence", metric: "coherence", score: 4 },
  ];
  const groups = groupMetrics(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].components.length, 1);
  assert.equal(groups[1].primary.score, 4);
  assert.deepEqual(groups.flatMap((group) => [group.primary, ...group.components]), rows);
  assert.equal(groupMetrics([rows[1]]).length, 1);
});
