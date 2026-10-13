import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function demand(condition, message) {
  if (!condition) throw new HttpError(400, message);
}

export function snapshot(input, { chat = false } = {}) {
  demand(input && typeof input === "object", "A conversation object is required.");
  demand(Buffer.byteLength(JSON.stringify(input), "utf8") <= 100_000, "The conversation exceeds 100 KB.");
  demand(Array.isArray(input.messages), "messages must be an array.");
  demand(input.messages.length >= (chat ? 2 : 3) && input.messages.length <= 100, "Invalid message count.");
  const definitions = input.tool_definitions ?? [];
  demand(Array.isArray(definitions) && definitions.length <= 8, "At most eight tool definitions are allowed.");
  const toolNames = new Set();
  for (const definition of definitions) {
    demand(definition && typeof definition.name === "string" && definition.name.length <= 100, "Invalid tool name.");
    demand(!toolNames.has(definition.name), "Duplicate tool definition.");
    toolNames.add(definition.name);
    demand(typeof definition.description === "string" && definition.parameters?.type === "object", "Invalid tool definition.");
  }
  const messages = [];
  const pending = new Set();
  const usedIds = new Set();
  let awaiting = false;
  let users = 0;
  for (const [index, source] of input.messages.entries()) {
    demand(source && ["system", "user", "assistant", "tool"].includes(source.role), "Invalid message role.");
    demand(index === 0 ? source.role === "system" : source.role !== "system", "Use one system message at the start.");
    if (source.role === "assistant" && source.tool_calls !== undefined) {
      demand(awaiting && pending.size === 0, "Unexpected assistant tool call.");
      demand(!chat, "Live chat does not execute tools. Use prepared tool conversations for evaluation.");
      demand(source.content === null && Array.isArray(source.tool_calls) && source.tool_calls.length > 0, "Invalid tool-call message.");
      const calls = source.tool_calls.map((call) => {
        demand(call?.type === "function" && typeof call.id === "string" && call.id.length <= 100, "Invalid tool call.");
        demand(!usedIds.has(call.id) && toolNames.has(call.function?.name), "Duplicate call ID or undefined tool.");
        demand(typeof call.function.arguments === "string", "Function arguments must be a JSON string.");
        let args;
        try { args = JSON.parse(call.function.arguments); }
        catch { throw new HttpError(400, "Function arguments contain invalid JSON."); }
        demand(args && typeof args === "object" && !Array.isArray(args), "Function arguments must be an object.");
        pending.add(call.id);
        usedIds.add(call.id);
        return { id: call.id, type: "function", function: { name: call.function.name, arguments: call.function.arguments } };
      });
      messages.push({ role: "assistant", content: null, tool_calls: calls });
      continue;
    }
    demand(typeof source.content === "string" && source.content.trim().length > 0 && source.content.length <= 20_000, "Messages need non-empty text of at most 20,000 characters.");
    const message = { role: source.role, content: source.content };
    if (source.role === "user") {
      demand(!awaiting && pending.size === 0, "The previous user turn has not finished.");
      awaiting = true;
      users++;
    } else if (source.role === "assistant") {
      demand(awaiting && pending.size === 0, "Unexpected assistant response.");
      awaiting = false;
    } else if (source.role === "tool") {
      demand(pending.has(source.tool_call_id), "Tool response does not match a pending call.");
      message.tool_call_id = source.tool_call_id;
      pending.delete(source.tool_call_id);
    }
    messages.push(message);
  }
  demand(users <= 20, "At most 20 user turns are allowed.");
  demand(pending.size === 0, "A tool response is missing.");
  demand(chat ? awaiting && messages.at(-1).role === "user" : !awaiting && messages.at(-1).role === "assistant", chat ? "Chat must end with a user question." : "Evaluation needs a completed assistant turn.");
  return { messages, tool_definitions: structuredClone(definitions) };
}

export function transcriptHash(item) {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex");
}

export function createHandles(secret, now = () => Date.now()) {
  if (typeof secret !== "string" || secret.length < 32) throw new HttpError(503, "The server run-signing key is not configured.");
  function sign(text) { return createHmac("sha256", secret).update(text).digest("base64url"); }
  return {
    issue(payload) {
      const text = Buffer.from(JSON.stringify({ ...payload, expires: now() + 86_400_000 })).toString("base64url");
      return `${text}.${sign(text)}`;
    },
    read(handle, purpose) {
      if (typeof handle !== "string" || handle.length > 12_000) throw new HttpError(400, "Invalid run handle.");
      const [text, signature, extra] = handle.split(".");
      if (!text || !signature || extra !== undefined) throw new HttpError(400, "Invalid run handle.");
      const expected = Buffer.from(sign(text));
      const provided = Buffer.from(signature);
      if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new HttpError(403, "The run handle is not valid.");
      let payload;
      try { payload = JSON.parse(Buffer.from(text, "base64url").toString("utf8")); }
      catch { throw new HttpError(400, "Invalid run handle payload."); }
      if (payload.purpose !== purpose || payload.expires <= now()) throw new HttpError(403, "The run handle has expired or has the wrong purpose.");
      return payload;
    },
  };
}

export function criteria(level, judge, rubricName, tools = false) {
  demand(["turn", "conversation"].includes(level), "Unknown evaluation level.");
  const names = level === "turn"
    ? ["relevance", "intent_resolution"]
    : ["task_completion", "customer_satisfaction", "coherence"];
  if (level === "conversation" && tools) names.push("groundedness");
  const items = names.map((name) => ({
    type: "azure_ai_evaluator",
    name,
    evaluator_name: `builtin.${name}`,
    initialization_parameters: { deployment_name: judge },
    data_mapping: {
      messages: "{{item.messages}}",
      ...(["intent_resolution", "task_completion", "groundedness"].includes(name)
        ? { tool_definitions: "{{item.tool_definitions}}" } : {}),
    },
  }));
  if (level === "conversation") {
    if (!rubricName) throw new HttpError(503, "The conversation rubric has not been registered.");
    items.push({
      type: "azure_ai_evaluator",
      name: "multi_topic_rubric",
      evaluator_name: rubricName,
      initialization_parameters: { deployment_name: judge },
      data_mapping: { messages: "{{item.messages}}", tool_definitions: "{{item.tool_definitions}}" },
    });
  }
  return items;
}

export function evaluationDefinition(level, judge, rubricName, tools, hash) {
  return {
    name: `Conversation Lab ${level} ${hash.slice(0, 12)}`,
    data_source_config: {
      type: "custom",
      item_schema: {
        type: "object",
        properties: { messages: { type: "array" }, tool_definitions: { type: "array" } },
        required: ["messages"],
      },
      include_sample_schema: false,
    },
    testing_criteria: criteria(level, judge, rubricName, tools),
  };
}

export function evaluationRun(item, level, requestId = randomUUID()) {
  const inputs = level === "turn"
    ? item.messages.flatMap((message, index) => message.role === "assistant" && !message.tool_calls
      ? [{ messages: structuredClone(item.messages.slice(0, index + 1)), tool_definitions: structuredClone(item.tool_definitions) }]
      : [])
    : [item];
  return {
    name: `Conversation Lab ${level}`,
    metadata: { application: "conversation-lab", request_id: requestId, transcript_sha256: transcriptHash(item) },
    data_source: { type: "jsonl", source: { type: "file_content", content: inputs.map((input) => ({ item: input })) } },
    evaluation_level: level,
  };
}

export function makeLimiter({ maxActive = 4, startsPerMinute = 24, now = () => Date.now() } = {}) {
  let active = 0;
  let starts = [];
  return async (work) => {
    starts = starts.filter((time) => now() - time < 60_000);
    if (active >= maxActive || starts.length >= startsPerMinute) throw new HttpError(429, "The demo is busy. Please wait a minute before trying again.");
    active++;
    starts.push(now());
    try { return await work(); }
    finally { active--; }
  };
}

export function terminal(status) {
  return ["completed", "failed", "canceled", "cancelled"].includes(status);
}
