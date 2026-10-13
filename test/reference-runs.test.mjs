import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { criteria } from "../api/lib/core.mjs";
import { inspectResults } from "../api/lib/evaluation-results.mjs";

test("recorded runs use Astra and the current complete profile without control capabilities", async () => {
  const reference = JSON.parse(await readFile(new URL("../web/reference-runs.json", import.meta.url), "utf8"));
  assert.equal(reference.runs.length, 4);
  for (const run of reference.runs) {
    assert.equal(run.status, "completed");
    assert.equal(run.result.provenance.judge, "gpt-6-astra");
    assert.ok(!Object.hasOwn(run, "handle") && !Object.hasOwn(run, "prepared"));
    assert.deepEqual(run.definition.testing_criteria, criteria(
      run.level, run.result.provenance.judge, run.result.provenance.rubric_name,
    ));
    const inspection = inspectResults(
      run.result.items,
      run.definition.testing_criteria.map((criterion) => criterion.name),
      { noToolDefinitions: run.snapshot.tool_definitions.length === 0 },
    );
    assert.equal(inspection.errors, 0);
    assert.deepEqual(inspection.warnings, []);
    assert.ok(run.result.provenance.run_id);
  }
});
