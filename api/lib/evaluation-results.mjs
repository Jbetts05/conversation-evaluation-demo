const composites = new Set(["output_quality", "tool_use_quality"]);

export function inspectResults(items, criterionNames, { noToolDefinitions = false } = {}) {
  const warnings = [];
  let errors = 0;
  let unexpectedSkips = 0;
  if (items.length === 0) warnings.push("The run completed but returned no scored items.");
  for (const item of items) {
    const results = item.results ?? [];
    const missing = criterionNames.filter((name) => !results.some((result) =>
      result.name === name && (!composites.has(name) || result.metric === name)));
    if (missing.length) warnings.push(`Item ${item.id}: missing primary results for ${missing.join(", ")}.`);
    for (const result of results) {
      if (["error", "errored", "failed"].includes(result.status)) errors++;
      if (result.status !== "skipped") continue;
      const expectedNotApplicable = noToolDefinitions
        && result.name === "tool_use_quality"
        && result.label === "not_applicable"
        && result.score === null;
      if (!expectedNotApplicable) {
        unexpectedSkips++;
        warnings.push(`Item ${item.id}: ${result.name}/${result.metric ?? result.name} was skipped: ${result.reason ?? "no reason returned"}.`);
      }
    }
  }
  return { errors, unexpectedSkips, warnings };
}
