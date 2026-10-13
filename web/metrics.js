const titles = {
  relevance: "Relevance", intent_resolution: "Intent resolution",
  task_completion: "Task completion", task_adherence: "Task adherence",
  customer_satisfaction: "Customer satisfaction", coherence: "Coherence",
  groundedness: "Groundedness", fluency: "Fluency",
  output_quality: "Output quality", tool_use_quality: "Tool-use quality",
  deflection_rate: "Deflection rate", tool_call_accuracy: "Tool-call accuracy",
  tool_call_success: "Tool-call success", tool_input_accuracy: "Tool-input accuracy",
  tool_output_utilization: "Tool-output utilization", tool_selection: "Tool selection",
  multi_topic_rubric: "Multi-topic rubric",
};
const binary = new Set([
  "task_completion", "task_adherence", "output_quality", "tool_use_quality",
  "tool_call_success", "tool_input_accuracy", "tool_output_utilization",
  "tool_selection", "multi_topic_rubric",
]);
const likert = new Set([
  "relevance", "intent_resolution", "customer_satisfaction", "coherence",
  "groundedness", "fluency", "tool_call_accuracy",
]);

export function metricKey(result) {
  return String(result.metric ?? result.name ?? "").replace(/^builtin\./, "").replace(/_score$/, "");
}

export function metricTitle(result) {
  const key = metricKey(result);
  const title = titles[key] ?? key ?? "Evaluator";
  if (["output_quality", "tool_use_quality"].includes(result.name) && key !== result.name) {
    return `${titles[result.name]} · ${title}`;
  }
  return title || "Evaluator";
}

function verdict(result) {
  if (result.passed === true || result.label === "pass") return "pass";
  if (result.passed === false || result.label === "fail") return "fail";
  return "";
}

export function resultState(result) {
  if (["error", "errored", "failed"].includes(result.status)) return "error";
  if (["skipped", "not_applicable", "not_scored"].includes(result.status)
    || result.label === "not_applicable") return "skipped";
  if (result.score !== null && result.score !== undefined
    && typeof result.score !== "boolean" && !Number.isFinite(result.score)) return "error";
  return verdict(result) || (result.score === null || result.score === undefined ? "skipped" : "");
}

export function scoreText(result) {
  if (["error", "errored", "failed"].includes(result.status)) return "Evaluator error";
  if (result.status === "not_applicable" || result.label === "not_applicable") return "Not applicable";
  if (result.status === "skipped") return "Skipped";
  if (result.score === null || result.score === undefined) {
    const state = verdict(result);
    return state === "pass" ? "Pass" : state === "fail" ? "Fail" : "Not scored";
  }
  if (typeof result.score === "boolean") return result.score ? "Pass" : "Fail";
  if (!Number.isFinite(result.score)) return "Invalid score format";
  const key = metricKey(result);
  const suffix = binary.has(key) ? "/1" : likert.has(key) ? "/5" : "";
  return `${Number(result.score.toFixed(2))}${suffix}`;
}

export function groupMetrics(results) {
  const seen = new Set();
  const groups = [];
  for (const result of results) {
    if (!["output_quality", "tool_use_quality"].includes(result.name)) {
      groups.push({ primary: result, components: [] });
      continue;
    }
    const peers = results.filter((candidate) => candidate.name === result.name);
    const primary = peers.find((candidate) => metricKey(candidate) === result.name);
    if (!primary) {
      groups.push({ primary: result, components: [] });
      continue;
    }
    if (seen.has(result.name)) continue;
    seen.add(result.name);
    groups.push({ primary, components: peers.filter((candidate) => candidate !== primary) });
  }
  return groups;
}
