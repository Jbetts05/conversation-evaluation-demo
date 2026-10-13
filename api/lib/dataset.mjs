import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assistantMessages(value) {
  return typeof value === "string" ? [{ role: "assistant", content: value }] : structuredClone(value);
}

export function validateMessages(messages, definitions, label) {
  requireCondition(Array.isArray(messages) && messages.length >= 3, `${label}: incomplete conversation`);
  requireCondition(messages[0].role === "system", `${label}: missing scenario instructions`);
  const tools = new Map(definitions.map((tool) => [tool.name, tool]));
  requireCondition(tools.size === definitions.length, `${label}: duplicate tool definition`);
  const callIds = new Set();
  const pending = new Map();
  let awaitingAnswer = false;
  for (const [index, message] of messages.entries()) {
    requireCondition(["system", "user", "assistant", "tool"].includes(message.role), `${label}: invalid role`);
    requireCondition(index === 0 || message.role !== "system", `${label}: system message inside dialogue`);
    if (message.role === "user") {
      requireCondition(!awaitingAnswer && pending.size === 0, `${label}: unanswered previous user`);
      requireCondition(typeof message.content === "string" && message.content.trim(), `${label}: empty user`);
      awaitingAnswer = true;
    } else if (message.role === "assistant") {
      requireCondition(awaitingAnswer && pending.size === 0, `${label}: misplaced assistant response`);
      if (message.tool_calls) {
        requireCondition(message.content === null, `${label}: tool-call message must have null content`);
        requireCondition(message.tool_calls.length > 0, `${label}: empty tool-call list`);
        for (const call of message.tool_calls) {
          requireCondition(call.type === "function" && typeof call.id === "string", `${label}: invalid function call`);
          requireCondition(!callIds.has(call.id), `${label}: duplicate call ID`);
          const definition = tools.get(call.function?.name);
          requireCondition(definition, `${label}: undefined tool ${call.function?.name}`);
          const args = JSON.parse(call.function.arguments);
          requireCondition(args && typeof args === "object" && !Array.isArray(args), `${label}: invalid arguments`);
          for (const name of definition.parameters.required) {
            requireCondition(Object.hasOwn(args, name), `${label}: missing tool argument ${name}`);
          }
          for (const [name, value] of Object.entries(args)) {
            const property = definition.parameters.properties[name];
            requireCondition(property, `${label}: unexpected tool argument ${name}`);
            requireCondition(typeof value === property.type, `${label}: tool argument type mismatch`);
            if (property.enum) requireCondition(property.enum.includes(value), `${label}: unknown argument value`);
          }
          callIds.add(call.id);
          pending.set(call.id, args);
        }
      } else {
        requireCondition(typeof message.content === "string" && message.content.trim(), `${label}: empty assistant`);
        awaitingAnswer = false;
      }
    } else if (message.role === "tool") {
      requireCondition(pending.has(message.tool_call_id), `${label}: orphan tool response`);
      const args = pending.get(message.tool_call_id);
      const result = JSON.parse(message.content);
      requireCondition(result.account_id === args.account_id, `${label}: tool result does not match called account`);
      requireCondition(result.total === result.charges.plan + result.charges.roaming, `${label}: inconsistent bill total`);
      pending.delete(message.tool_call_id);
    } else {
      requireCondition(typeof message.content === "string" && message.content.trim(), `${label}: empty system`);
    }
  }
  requireCondition(pending.size === 0 && !awaitingAnswer, `${label}: incomplete final turn`);
}

export function buildCorpus(scenarios, rubric) {
  const dimensions = new Set(rubric.definition.dimensions.map((dimension) => dimension.id));
  requireCondition(dimensions.size === rubric.definition.dimensions.length, "Duplicate rubric dimension");
  requireCondition(scenarios.length > 0, "Empty scenario catalog");
  const ids = new Set();
  const rows = [];
  const catalog = [];
  for (const scenario of scenarios) {
    requireCondition(!ids.has(scenario.id), `Duplicate scenario ID: ${scenario.id}`);
    ids.add(scenario.id);
    requireCondition(["calibration", "holdout"].includes(scenario.split), `${scenario.id}: invalid split`);
    requireCondition(dimensions.has(scenario.focus), `${scenario.id}: unknown focus dimension`);
    requireCondition(scenario.turns.length >= 2, `${scenario.id}: expected multiple exchanges`);
    const turnIds = new Set(scenario.turns.map((turn) => turn.id));
    requireCondition(turnIds.size === scenario.turns.length, `${scenario.id}: duplicate turn ID`);
    requireCondition(turnIds.has(scenario.fault.turnId), `${scenario.id}: fault targets unknown turn`);
    const outcomeIds = new Set(scenario.outcomes.map((outcome) => outcome.id));
    requireCondition(outcomeIds.size === scenario.outcomes.length, `${scenario.id}: duplicate outcome ID`);
    requireCondition(outcomeIds.has(scenario.fault.violatedOutcome), `${scenario.id}: unknown violated outcome`);
    for (const outcome of scenario.outcomes) {
      requireCondition(outcome.description?.trim() && outcome.evidenceTurns.length > 0, `${scenario.id}: missing outcome evidence`);
      requireCondition(outcome.evidenceTurns.every((id) => turnIds.has(id)), `${scenario.id}: invalid evidence turn`);
    }
    const failedOutcome = scenario.outcomes.find((outcome) => outcome.id === scenario.fault.violatedOutcome);
    requireCondition(failedOutcome.evidenceTurns.includes(scenario.fault.turnId), `${scenario.id}: fault outside outcome evidence`);
    const definitions = structuredClone(scenario.toolDefinitions ?? []);
    const pair = [];
    for (const variant of ["well-handled", "faulty"]) {
      const messages = [{ role: "system", content: scenario.system }];
      const turns = [];
      for (const turn of scenario.turns) {
        requireCondition(scenario.topics.includes(turn.topic), `${scenario.id}: unknown topic`);
        const start = messages.length;
        messages.push({ role: "user", content: turn.user });
        const response = variant === "faulty" && turn.id === scenario.fault.turnId
          ? scenario.fault.assistant : turn.assistant;
        messages.push(...assistantMessages(response));
        turns.push({ id: turn.id, topic: turn.topic, start, end: messages.length });
      }
      const id = `conversation-v1-${String(rows.length + 1).padStart(3, "0")}`;
      validateMessages(messages, definitions, id);
      const hash = createHash("sha256").update(JSON.stringify({ messages, tool_definitions: definitions })).digest("hex");
      const row = { id, messages, tool_definitions: definitions };
      rows.push(row);
      pair.push({ row, turns });
      catalog.push({
        conversation_id: id,
        scenario_id: scenario.id,
        title: scenario.title,
        split: scenario.split,
        variant,
        focus_dimension: scenario.focus,
        transcript_sha256: hash,
        turns,
        expected_outcomes: structuredClone(scenario.outcomes),
        authored_expectation: {
          focus_score: variant === "well-handled"
            ? { min: rubric.calibration_policy.expected_well_handled_focus_min, max: 5 }
            : { min: 1, max: rubric.calibration_policy.expected_faulty_focus_max },
          violated_outcome: variant === "faulty" ? scenario.fault.violatedOutcome : null,
          fault_turn: variant === "faulty" ? scenario.fault.turnId : null,
          explanation: variant === "faulty" ? scenario.fault.explanation : null,
          measured: false,
        },
      });
    }
    const [good, faulty] = pair;
    requireCondition(isDeepStrictEqual(
      good.row.messages.filter((message) => ["system", "user"].includes(message.role)),
      faulty.row.messages.filter((message) => ["system", "user"].includes(message.role)),
    ), `${scenario.id}: variants have different requests or policies`);
    requireCondition(isDeepStrictEqual(good.row.tool_definitions, faulty.row.tool_definitions), `${scenario.id}: tool definitions differ`);
    for (const [index, turn] of scenario.turns.entries()) {
      const left = good.turns[index];
      const right = faulty.turns[index];
      const identical = isDeepStrictEqual(
        good.row.messages.slice(left.start, left.end),
        faulty.row.messages.slice(right.start, right.end),
      );
      requireCondition(identical === (turn.id !== scenario.fault.turnId), `${scenario.id}: fault is not isolated to its declared exchange`);
    }
  }
  return { rows, catalog };
}

export function evaluationItem(row) {
  return {
    messages: structuredClone(row.messages),
    tool_definitions: structuredClone(row.tool_definitions),
  };
}

export function turnContexts(row, catalogEntry) {
  return catalogEntry.turns.map((turn) => ({
    turn_id: turn.id,
    messages: structuredClone(row.messages.slice(0, turn.end)),
  }));
}
