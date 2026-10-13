import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { HttpError, snapshot, transcriptHash, createHandles, evaluationDefinition, evaluationRun, makeLimiter, terminal } from "./core.mjs";
import { createFoundry } from "./foundry.mjs";

export async function loadCorpus() {
  return JSON.parse(await readFile(new URL("../data/corpus.json", import.meta.url), "utf8"));
}

export function application({ corpus, config, providerFactory = () => createFoundry(config), log = console.error }) {
  const limit = makeLimiter();
  let provider;
  const cloud = () => provider ??= providerFactory();
  const handles = () => createHandles(config.signingKey);
  const live = () => {
    if (!config.liveEnabled) throw new HttpError(503, "Live calls are disabled. You can still inspect and export the prepared conversations.");
  };
  async function dispatch(method, path, body, signal) {
    if (method === "GET" && path === "/catalog") {
      return {
        rows: corpus.rows,
        catalog: corpus.catalog,
        rubric: corpus.rubric,
        configuration: {
          liveEnabled: config.liveEnabled,
          judge: config.judge ?? null,
          chat: config.chat ?? null,
          rubricName: config.rubricName ?? null,
          rubricVersion: config.rubricVersion ?? null,
          visitorAuthentication: false,
        },
      };
    }
    if (method !== "POST") throw new HttpError(404, "API route not found.");
    if (path === "/chat") {
      live();
      if (!config.chat) throw new HttpError(503, "The chat deployment is not configured.");
      const item = snapshot(body, { chat: true });
      if (item.tool_definitions.length) throw new HttpError(400, "Live chat does not execute tools.");
      return limit(async () => {
        const started = performance.now();
        const response = await cloud().chat(item.messages, config.chat, signal);
        const message = response.choices?.[0]?.message;
        if (!message?.content || message.tool_calls?.length) throw new HttpError(502, "The chat model did not return a text answer.");
        return { message: { role: "assistant", content: message.content }, deployment: config.chat, latency_ms: Math.round(performance.now() - started), usage: response.usage ?? null };
      });
    }
    if (path === "/evaluations/prepare") {
      live();
      const item = snapshot(body?.conversation);
      const level = body?.level;
      const hash = transcriptHash(item);
      const definition = evaluationDefinition(level, config.judge, config.rubricName, item.tool_definitions.length > 0, hash);
      const tokens = handles();
      return limit(async () => {
        const evaluation = await cloud().createEvaluation(definition, signal);
        if (!evaluation.id) throw new HttpError(502, "Foundry did not return an evaluation ID.");
        return {
          handle: tokens.issue({ purpose: "prepared", evalId: evaluation.id, hash, level, judge: config.judge, rubricName: config.rubricName, rubricVersion: config.rubricVersion, criterionNames: definition.testing_criteria.map((criterion) => criterion.name), requestId: randomUUID() }),
          evaluation_id: evaluation.id,
          transcript_sha256: hash,
          definition,
        };
      });
    }
    if (path === "/evaluations/submit") {
      live();
      const prepared = handles().read(body?.handle, "prepared");
      const item = snapshot(body?.conversation);
      if (prepared.hash !== transcriptHash(item)) throw new HttpError(409, "The transcript changed after preparation. Prepare a new evaluation.");
      return limit(async () => {
        // Reconcile a lost submission response before creating another billable run.
        if (body?.reconcile === true) {
          throw new HttpError(409, "Submission outcome is uncertain. Inspect the evaluation ID in Foundry before retrying; this demo does not automatically resubmit.");
        }
        const run = await cloud().createRun(prepared.evalId, evaluationRun(item, prepared.level, prepared.requestId), signal);
        if (!run.id) throw new HttpError(502, "Foundry did not return a run ID.");
        return {
          handle: handles().issue({ ...prepared, purpose: "run", runId: run.id, submittedAt: new Date().toISOString() }),
          evaluation_id: prepared.evalId, run_id: run.id, status: run.status, transcript_sha256: prepared.hash,
        };
      });
    }
    if (path === "/evaluations/status" || path === "/evaluations/cancel") {
      const job = handles().read(body?.handle, "run");
      if (path === "/evaluations/cancel") {
        const run = await cloud().cancelRun(job.evalId, job.runId, signal);
        return { status: run.status, cancellationRequested: true };
      }
      const run = await cloud().getRun(job.evalId, job.runId, signal);
      const items = run.status === "completed" ? await cloud().outputItems(job.evalId, job.runId, signal) : [];
      const errors = items.flatMap((item) => item.results ?? []).filter((result) => ["error", "errored", "failed"].includes(result.status));
      const warnings = [];
      if (run.status === "completed" && items.length === 0) warnings.push("The run completed but returned no scored items.");
      for (const item of items) {
        const names = new Set((item.results ?? []).map((result) => result.name));
        const missing = job.criterionNames.filter((name) => !names.has(name));
        if (missing.length) warnings.push(`Item ${item.id}: missing results for ${missing.join(", ")}.`);
      }
      return {
        status: run.status,
        terminal: terminal(run.status),
        error: run.error ? { code: run.error.code ?? "evaluation_failed", message: "Foundry could not complete this evaluation. Inspect the returned error code and run IDs." } : null,
        item_errors: errors.length,
        warnings,
        result_counts: run.result_counts ?? null,
        items,
        report_url: run.report_url ?? null,
        provenance: {
          evaluation_id: job.evalId, run_id: job.runId, level: job.level, transcript_sha256: job.hash,
          judge: job.judge, rubric_name: job.rubricName, rubric_version: job.rubricVersion,
          submitted_at: job.submittedAt,
        },
      };
    }
    throw new HttpError(404, "API route not found.");
  }
  return async ({ method, path, body }) => {
    try {
      return { status: 200, body: await dispatch(method, path, body, AbortSignal.timeout(38_000)) };
    } catch (error) {
      const requestId = randomUUID();
      log(JSON.stringify({ request_id: requestId, error_type: error.name, status: error.status ?? error.statusCode ?? 500, code: error.code ?? null }));
      const status = error instanceof HttpError ? error.status : 502;
      return {
        status,
        body: { error: {
          message: error instanceof HttpError ? error.message : "The Foundry request failed. Check the model deployment, backend identity and project permissions.",
          code: error.code ?? (error.status ? `upstream_${error.status}` : "request_failed"),
          upstream_status: error instanceof HttpError ? null : error.status ?? error.statusCode ?? null,
          request_id: requestId,
        } },
      };
    }
  };
}
