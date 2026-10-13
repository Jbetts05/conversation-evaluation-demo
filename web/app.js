(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const storageKey = "conversation-lab-runs-v1";
  const metricNames = {
    relevance: "Relevance", intent_resolution: "Intent resolution", task_completion: "Task completion",
    customer_satisfaction: "Customer satisfaction", coherence: "Coherence", groundedness: "Groundedness",
    multi_topic_rubric: "Multi-topic rubric",
  };
  let corpus;
  let mode = "examples";
  let current;
  let currentMeta;
  let jobs = [];
  let busy = false;
  let chatting = false;
  let chatHistory;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function status(text, error = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", error);
  }
  async function api(path, body) {
    const response = await fetch(`/api${path}`, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`The server returned an unreadable response (${response.status}).`); }
    if (!response.ok) {
      const error = new Error(data.error?.message ?? `Request failed (${response.status}).`);
      error.code = data.error?.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function saveJobs() {
    try { sessionStorage.setItem(storageKey, JSON.stringify(jobs)); }
    catch { status("This browser could not save the run for resume. Keep the tab open and download the report.", true); }
  }
  function cleanItem(item) {
    return { messages: structuredClone(item.messages), tool_definitions: structuredClone(item.tool_definitions ?? []) };
  }
  function inputItem() {
    return mode === "chat" ? { messages: structuredClone(chatHistory), tool_definitions: [] } : cleanItem(current);
  }
  function controls() {
    const item = corpus ? inputItem() : null;
    const complete = item?.messages?.at(-1)?.role === "assistant";
    const ready = corpus?.configuration.liveEnabled && corpus.configuration.rubricName;
    $("evaluate").disabled = busy || chatting || !complete || !ready;
    $("compare").disabled = busy || chatting || mode !== "examples" || !currentMeta || !ready;
    $("scenario").disabled = !corpus || busy;
    $("variant").disabled = busy || !currentMeta;
    $("send-chat").disabled = chatting || busy || !corpus?.configuration.liveEnabled;
    $("apply-edit").disabled = busy || chatting || mode === "chat";
    $("export-transcript").disabled = !complete;
    $("export-report").disabled = jobs.length === 0;
  }
  function populateScenarios() {
    const previous = $("scenario").value;
    $("scenario").replaceChildren();
    const seen = new Set();
    for (const entry of corpus.catalog) {
      if (seen.has(entry.scenario_id) || (entry.split === "holdout" && !$("include-holdout").checked)) continue;
      seen.add(entry.scenario_id);
      const option = element("option", "", `${entry.title}${entry.split === "holdout" ? " · reserved" : ""}`);
      option.value = entry.scenario_id;
      $("scenario").append(option);
    }
    $("scenario").value = seen.has(previous) ? previous : "resume-unfinished-request";
  }
  function chooseExample() {
    currentMeta = corpus.catalog.find((entry) => entry.scenario_id === $("scenario").value && entry.variant === $("variant").value);
    current = cleanItem(corpus.rows.find((row) => row.id === currentMeta.conversation_id));
    renderConversation();
    controls();
  }
  function renderConversation() {
    const item = inputItem();
    $("messages").replaceChildren();
    $("conversation-title").textContent = mode === "chat" ? "Your conversation" : currentMeta?.title ?? "Edited / imported conversation";
    const turns = item.messages.filter((message) => message.role === "user").length;
    $("conversation-meta").textContent = `${turns} user turns · ${mode === "chat" ? corpus.configuration.chat ?? "unconfigured model" : currentMeta ? "authored synthetic transcript" : "custom transcript"}`;
    $("system-instructions").textContent = item.messages[0]?.content ?? "";
    for (const [index, message] of item.messages.entries()) {
      if (message.role === "system") continue;
      const node = element("div", `message ${message.role}`);
      const label = element("div", "message-label", message.role === "user" ? "You" : message.role === "tool" ? "Mock tool evidence" : "Assistant");
      const annotation = mode === "examples" && currentMeta?.turns.find((turn) => index >= turn.start && index < turn.end);
      if (annotation) label.append(element("span", "topic", annotation.topic));
      node.append(label);
      if (message.role === "tool" || message.tool_calls) {
        const details = element("details");
        details.append(element("summary", "", message.role === "tool" ? `Result · ${message.tool_call_id}` : `Call · ${message.tool_calls.map((call) => call.function.name).join(", ")}`));
        details.append(element("pre", "", JSON.stringify(message, null, 2)));
        node.append(details);
      } else node.append(element("div", "bubble", message.content));
      $("messages").append(node);
    }
    if (mode === "chat" && turns === 0) $("messages").append(element("p", "muted", "This assistant uses the selected example's fictional facts. Ask a question, switch topics, and return to an earlier request."));
    $("json-editor").value = JSON.stringify(item, null, 2);
    $("expected-outcomes").replaceChildren();
    if (mode === "examples" && currentMeta) {
      for (const outcome of currentMeta.expected_outcomes) $("expected-outcomes").append(element("p", "muted", outcome.description));
    } else $("expected-outcomes").append(element("p", "muted", "No authored expected-answer key applies to this custom conversation."));
    const changed = jobs.length > 0 && jobs.some((job) => JSON.stringify(job.snapshot) !== JSON.stringify(item));
    $("results-warning").hidden = !changed;
    $("results-warning").textContent = "The results below assess their captured snapshots, not the current draft. The report contains the exact evaluated transcripts.";
  }
  function changeMode(next) {
    mode = next;
    $("examples-mode").classList.toggle("selected", next === "examples");
    $("chat-mode").classList.toggle("selected", next === "chat");
    $("examples-mode").setAttribute("aria-pressed", String(next === "examples"));
    $("chat-mode").setAttribute("aria-pressed", String(next === "chat"));
    $("example-controls").hidden = next !== "examples";
    $("chat-form").hidden = next !== "chat";
    $("compare").hidden = next !== "examples";
    if (next === "chat" && !chatHistory) {
      const source = current.tool_definitions.length ? corpus.rows[0] : current;
      chatHistory = [{ role: "system", content: source.messages[0].content }];
    }
    renderConversation();
    controls();
  }
  function scoreText(result) {
    if (result.score === null || result.score === undefined) return "Not scored";
    if (typeof result.score === "boolean") return result.score ? "Pass" : "Fail";
    const scale = result.name === "multi_topic_rubric" ? "/1" : ["task_completion"].includes(result.name) ? "/1" : "/5";
    return `${Number.isFinite(result.score) ? Number(result.score.toFixed(2)) : String(result.score)}${scale}`;
  }
  function resultState(result) {
    if (["error", "errored", "skipped", "not_applicable", "not_scored", "failed"].includes(result.status)) return "skipped";
    if (result.score === null || result.score === undefined) return "skipped";
    if (result.passed === true || result.label === "pass") return "pass";
    if (result.passed === false || result.label === "fail") return "fail";
    return "";
  }
  function renderMetric(result) {
    const node = element("div", "metric");
    const heading = element("div", "metric-heading");
    heading.append(element("span", "", metricNames[result.name] ?? result.name ?? result.metric ?? "Evaluator"));
    const state = resultState(result);
    heading.append(element("span", `score ${state}`, ["error", "errored", "failed"].includes(result.status) ? "Evaluator error" : result.status === "skipped" ? "Skipped" : scoreText(result)));
    node.append(heading);
    if (result.reason) {
      const why = element("details");
      why.append(element("summary", "", "Why this score"));
      why.append(element("p", "reason", result.reason));
      node.append(why);
    }
    if (result.threshold !== undefined) node.append(element("p", "muted", `Threshold: ${result.threshold} · ${state === "pass" ? "Pass" : state === "fail" ? "Fail" : result.status ?? "Scored"}`));
    const dimensions = element("details");
    dimensions.append(element("summary", "", "Rubric dimensions and explanations"));
    for (const dimension of result.properties?.dimension_scores ?? []) {
      const detail = element("div", "dimension");
      detail.append(element("strong", "", `${dimension.id.replaceAll("_", " ")} · ${dimension.applicable === false ? "Not applicable" : `${dimension.score}/5`}`));
      if (dimension.reason) detail.append(element("span", "", dimension.reason));
      dimensions.append(detail);
    }
    if (result.properties?.dimension_scores?.length) node.append(dimensions);
    return node;
  }
  function renderJobs() {
    if (!jobs.length) return;
    $("results").replaceChildren();
    for (const job of jobs) {
      const card = element("article", "result-card panel");
      card.append(element("span", "eyebrow", job.level === "turn" ? "Turn by turn" : "Whole conversation"));
      card.append(element("h3", "", job.title));
      card.append(element("p", `result-status${job.error ? " error" : ""}`, job.error ?? (job.source === "recorded-foundry-run" ? `Recorded · ${job.result.provenance.recorded_at}` : job.status ?? "Preparing")));
      if (job.result?.status === "completed" && (job.result.result_counts?.errored || job.result.item_errors)) {
        card.append(element("p", "error", "Some evaluator items errored. This is not a successful quality assessment."));
      }
      if (job.result?.error) card.append(element("p", "error", `${job.result.error.message} (${job.result.error.code})`));
      for (const warning of job.result?.warnings ?? []) card.append(element("p", "warning", warning));
      for (const [index, item] of (job.result?.items ?? []).entries()) {
        if (job.level === "turn") {
          const turn = item.datasource_item?.messages?.filter((message) => message.role === "user").length;
          card.append(element("p", "muted", turn ? `Turn ${turn}` : `Scored item ${index + 1}`));
        }
        if (item.status && item.status !== "completed") card.append(element("p", "muted", `Item status: ${item.status}`));
        for (const result of item.results ?? []) card.append(renderMetric(result));
      }
      if (job.handle && !["completed", "failed", "canceled", "cancelled"].includes(job.status)) {
        const actions = element("div", "job-actions");
        const cancel = element("button", "quiet", "Cancel run");
        cancel.addEventListener("click", async () => {
          cancel.disabled = true;
          try {
            await api("/evaluations/cancel", { handle: job.handle });
            job.status = "Cancellation requested";
            saveJobs(); renderJobs();
          } catch (error) { job.error = error.message; renderJobs(); }
        });
        actions.append(cancel);
        if (job.status === "Polling paused") {
          const resume = element("button", "quiet", "Resume status check");
          resume.addEventListener("click", () => { void poll(job).catch((error) => { job.error = error.message; renderJobs(); }); });
          actions.append(resume);
        }
        card.append(actions);
      }
      const details = element("details", "inspector");
      details.append(element("summary", "", "Input · evaluation settings · raw output"));
      const payload = { transcript: job.snapshot, definition: job.definition ?? null, provenance: job.result?.provenance ?? { evaluation_id: job.evaluation_id, run_id: job.run_id, transcript_sha256: job.hash }, result: job.result ?? null };
      details.append(element("pre", "", JSON.stringify(payload, null, 2)));
      card.append(details);
      $("results").append(card);
    }
    controls();
  }
  async function poll(job) {
    const deadline = Date.now() + 15 * 60_000;
    while (Date.now() < deadline) {
      const result = await api("/evaluations/status", { handle: job.handle });
      job.result = result;
      job.status = result.status;
      job.error = null;
      saveJobs(); renderJobs();
      if (result.terminal) return;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    job.status = "Polling paused";
    saveJobs(); renderJobs();
  }
  async function submitJob(job) {
    let submitting = false;
    try {
      const prepared = await api("/evaluations/prepare", { conversation: job.snapshot, level: job.level });
      job.prepared = prepared.handle;
      job.evaluation_id = prepared.evaluation_id;
      job.hash = prepared.transcript_sha256;
      job.definition = prepared.definition;
      job.status = "Submitting";
      saveJobs(); renderJobs();
      submitting = true;
      const submitted = await api("/evaluations/submit", { handle: prepared.handle, conversation: job.snapshot });
      submitting = false;
      job.handle = submitted.handle;
      job.run_id = submitted.run_id;
      job.status = submitted.status;
      saveJobs(); renderJobs();
      await poll(job);
    } catch (error) {
      job.error = `${error.message}${error.code ? ` (${error.code})` : ""}${submitting ? " Submission outcome may be uncertain; it has not been automatically retried. Use the evaluation ID to inspect Foundry." : ""}`;
      job.status = submitting ? "Submission uncertain" : job.handle ? "Polling paused" : "Request failed";
      saveJobs(); renderJobs();
    }
  }
  async function evaluate(compare) {
    if (busy) return;
    busy = true;
    const snapshots = compare
      ? corpus.catalog.filter((entry) => entry.scenario_id === currentMeta.scenario_id).map((entry) => ({
        snapshot: cleanItem(corpus.rows.find((row) => row.id === entry.conversation_id)),
        title: `${entry.variant === "faulty" ? "Faulty" : "Well handled"} · authored`,
      }))
      : [{ snapshot: inputItem(), title: mode === "chat" ? "Your live conversation" : currentMeta ? `${currentMeta.variant === "faulty" ? "Faulty" : "Well handled"} · authored` : "Custom conversation" }];
    jobs = snapshots.flatMap((entry) => ["turn", "conversation"].map((level) => ({ ...entry, level, status: "Preparing", started_at: new Date().toISOString() })));
    saveJobs(); renderJobs(); controls();
    status("Submitting real Foundry runs. Results may take several minutes.");
    await Promise.all(jobs.map(submitJob));
    busy = false;
    status(jobs.some((job) => job.error || job.result?.error || job.result?.result_counts?.errored) ? "One or more runs need attention. See their status and details." : "Evaluation status updated. Inspect the scores and explanations.", jobs.some((job) => job.error));
    renderConversation(); controls();
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = element("a");
    anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("scenario").addEventListener("change", chooseExample);
  $("variant").addEventListener("change", chooseExample);
  $("include-holdout").addEventListener("change", () => { populateScenarios(); chooseExample(); });
  $("examples-mode").addEventListener("click", () => { if (corpus) changeMode("examples"); });
  $("chat-mode").addEventListener("click", () => { if (corpus) changeMode("chat"); });
  $("evaluate").addEventListener("click", () => { void evaluate(false).catch((error) => { busy = false; status(error.message, true); controls(); }); });
  $("compare").addEventListener("click", () => { void evaluate(true).catch((error) => { busy = false; status(error.message, true); controls(); }); });
  $("recorded").addEventListener("click", async () => {
    if (busy) { status("Wait for the current runs to finish before loading a recorded example.", true); return; }
    try {
      const response = await fetch("/reference-runs.json");
      if (!response.ok) throw new Error("Recorded runs are not available in this deployment.");
      const recorded = await response.json();
      jobs = recorded.runs;
      saveJobs(); renderJobs(); renderConversation();
      status("Showing genuine previously recorded Foundry results, not a new live evaluation.");
    } catch (error) { status(error.message, true); }
  });
  $("export-transcript").addEventListener("click", () => download("conversation.jsonl", JSON.stringify(inputItem()) + "\n", "application/x-ndjson"));
  $("export-report").addEventListener("click", () => download("conversation-evaluation-report.json", JSON.stringify({ application: "Conversation Lab", exported_at: new Date().toISOString(), rubric: corpus.rubric, runs: jobs }, null, 2), "application/json"));
  $("apply-edit").addEventListener("click", () => {
    try {
      const edited = JSON.parse($("json-editor").value);
      if (!Array.isArray(edited.messages) || !edited.messages.length) throw new Error("A messages array is required.");
      current = cleanItem(edited); currentMeta = null;
      renderConversation(); controls(); status("Edited transcript ready. Previous scores do not apply to these changes.");
    } catch (error) { status(error.message, true); }
  });
  $("import-file").addEventListener("change", async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 100_000) throw new Error("Imports are limited to 100 KB.");
      const lines = (await file.text()).trim().split(/\r?\n/);
      if (lines.length !== 1) throw new Error("Import one complete conversation per file. Select a single JSONL row.");
      const imported = JSON.parse(lines[0]);
      if (!Array.isArray(imported.messages) || !imported.messages.length) throw new Error("A messages array is required.");
      current = cleanItem(imported); currentMeta = null;
      changeMode("examples"); status("Imported transcript ready. No expected-answer key is attached.");
    } catch (error) { status(error.message, true); }
    event.target.value = "";
  });
  $("chat-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (chatting || busy) return;
    const question = $("chat-input").value.trim();
    if (!question) return;
    chatting = true; controls();
    const pending = [...chatHistory, { role: "user", content: question }];
    chatHistory = pending; renderConversation();
    status("Waiting for the live model...");
    try {
      const reply = await api("/chat", { messages: pending, tool_definitions: [] });
      chatHistory = [...pending, reply.message];
      $("chat-input").value = "";
      $("chat-metrics").textContent = `${reply.latency_ms} ms model request · input ${reply.usage?.prompt_tokens ?? "-"} · output ${reply.usage?.completion_tokens ?? "-"} tokens`;
      status("Live answer captured. Continue chatting or evaluate the conversation.");
    } catch (error) {
      chatHistory = pending.slice(0, -1);
      status(`${error.message} The question was not added to the captured transcript.`, true);
    }
    chatting = false; renderConversation(); controls();
    $("messages").scrollTop = $("messages").scrollHeight;
  });
  async function initialize() {
    corpus = await api("/catalog");
    populateScenarios(); chooseExample();
    $("configuration").textContent = `Judge: ${corpus.configuration.judge ?? "not configured"} · Chat: ${corpus.configuration.chat ?? "not configured"} · Rubric version: ${corpus.configuration.rubricVersion ?? "not registered"}`;
    $("configuration").after(element("p", "muted", "Each turn is scored with only its preceding context. Short social closings can receive low relevance scores despite being appropriate; inspect the explanation."));
    for (const dimension of corpus.rubric.definition.dimensions) {
      const details = element("details", "inspector");
      details.append(element("summary", "", `${dimension.id.replaceAll("_", " ")} · weight ${dimension.weight}`));
      details.append(element("p", "muted", dimension.description));
      $("rubric").append(details);
    }
    status(corpus.configuration.liveEnabled && corpus.configuration.rubricName ? "Choose a version, then evaluate or compare." : "Live evaluation is not configured. Transcript inspection and exports remain available.");
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) throw new Error("Saved run data is invalid.");
      jobs = parsed;
      renderJobs(); renderConversation();
      const pending = jobs.filter((job) => job.handle && !["completed", "failed", "canceled", "cancelled"].includes(job.status));
      if (pending.length) {
        busy = true; controls();
        await Promise.all(pending.map((job) => poll(job).catch((error) => { job.error = error.message; job.status = "Polling paused"; saveJobs(); renderJobs(); })));
        busy = false; controls();
      }
    }
  }
  void initialize().catch((error) => { status(`Unable to initialize: ${error.message}`, true); });
})();
