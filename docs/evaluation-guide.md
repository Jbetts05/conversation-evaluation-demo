# Evaluate the answer. Then evaluate the journey.

**Turn-level evaluation asks: "Was this reply good?"  
Conversation-level evaluation asks: "Did this interaction work?"**

For a multi-turn assistant, usually use both. One diagnoses individual steps;
the other checks outcomes that a last-answer check or average score can hide.

## When to use which

| Use | When | Why |
|-----|------|-----|
| **Turn level** | Testing answer relevance, grounded claims, or a particular tool interaction | Find the response or step that needs fixing |
| **Conversation level** | Testing topic switches, corrections, interruptions, remembered context, or task completion | Judge the user's complete experience |
| **Both** | Comparing versions of a multi-turn assistant | Distinguish a local response defect from an end-to-end failure |

**Example:** a user asks for billing-dispute instructions, briefly asks about
roaming, then supplies the missing billing information. The agent answers roaming
but never finishes the dispute guidance. Some replies are useful; the earlier
request is still unresolved. A full per-turn check may catch a bad step, while
conversation evaluation makes the unfinished obligation explicit.

## A practical approach

1. **Define success first.** Write the requests, constraints and expected outcomes.
   Distinguish pending work from work the user explicitly withdrew. Necessary
   clarification and legitimate topic changes are not failures.

2. **Capture enough evidence.** Use one complete conversation per JSONL line,
   with ordered `messages`. Keep relevant instructions, facts, tool calls,
   results and `tool_definitions`. Review data-handling and retention requirements
   before cloud upload.
   Pair well-handled and faulty examples; reserve separate scenarios from tuning.

3. **Choose the questions you need answered.** Use a business-specific rubric for
   outcomes such as context retention or correct resumption. Add built-ins for
   completion, satisfaction, coherence and groundedness, with the source facts or
   tool results needed to verify claims. `output_quality` bundles
   several quality dimensions; `tool_use_quality` bundles tool checks. Add
   deflection and safety measures where relevant. Check each evaluator's
   `supported_evaluation_levels` and judge-model compatibility.

4. **Set the level explicitly.** Map `messages` and set the run's
   `evaluation_level` to `"turn"` or `"conversation"`; the default is `"turn"`.
   Don't assume a whole `messages` item produces one score per reply: in our runs
   it could score only the final reply. This repo submits one prefix ending at each
   completed assistant text reply. Tool calls/results stay in context, not separate
   reply rows; future messages are excluded. See [`evaluationRun()`](../api/lib/core.mjs).
   Check that the score count matches the intended reply count.

5. **Read evidence, not just the headline.** Inspect scores, thresholds, reasons,
   component results and execution status. Unsupported evaluators can be skipped
   without failing the run. Missing/error results are not passes; no-tool
   applicability is different from an unexpected skip. The
   [result inspector](../api/lib/evaluation-results.mjs) makes that distinction.

## Keep the conclusions honest

Choose the judge deliberately. The [composite reference](https://learn.microsoft.com/azure/foundry/concepts/evaluation-evaluators/agent-evaluators#composite-evaluators-preview)
recommends GPT-5.6-family judges; this deployment verified both composites with
**GPT-6 Astra**, judging **GPT-6 Luna**. Test compatibility in your project and
calibrate against human-reviewed examples; strength is not a guarantee of truth.
Keep judge, rubric, dataset and thresholds
fixed when comparing versions; repeat selected cases to observe variability.

Composite gates are **binary**: 1 means pass, 0 means fail. Components use their
own scales, including `1–5` and `0–1`. If all components are skipped, the gate is
`not_applicable`, not a pass. Overlapping composite and standalone dimensions are
not independent votes; this demo shows both for teaching.

Several evaluators here are **preview**: no SLA and not recommended by Microsoft
for production workloads. Check current feature status before operational use.

An evaluation detects behaviour; it does not implement intent orchestration or
memory. Pair model judgments with deterministic checks where state or tool
arguments have exact expected values. Our
[scenarios](../data/scenarios.mjs) and [rubric](../data/rubric.json) show the pattern.
The small fictional dataset demonstrates techniques, not production accuracy.

## Follow the sources

**Foundry docs:** [conversation workflow](https://learn.microsoft.com/azure/foundry/observability/how-to/cloud-evaluation-conversations?tabs=python)
· [levels and compatibility](https://learn.microsoft.com/azure/foundry/concepts/built-in-evaluators#evaluation-levels)
· [rubrics](https://learn.microsoft.com/azure/foundry/concepts/evaluation-evaluators/rubric-evaluators).

**Microsoft code:** [Python conversation sample](https://github.com/Azure/azure-sdk-for-python/blob/main/sdk/ai/azure-ai-projects/samples/evaluations/sample_multiturn_conversation_evaluation.py)
· [JavaScript conversation sample](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/ai/ai-projects/samples-dev/evaluations/multiturnConversationEvaluation.ts)
· [JavaScript rubric sample](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/ai/ai-projects/samples-dev/evaluations/evaluatorsCatalogRubric.ts).
