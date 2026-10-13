# Conversation Lab

**Good answers. A good conversation?**

A lightweight, anonymous Microsoft Foundry demo showing the difference between
judging responses and judging the complete interaction. Plain HTML/CSS/JavaScript,
a Node.js 22 managed API, and Azure Static Web Apps. No frontend framework,
containers, application database, or visitor sign-in.

## Use the demo

1. Choose an authored example and a well-handled or faulty version.
2. Select **Evaluate conversation**, or compare both versions.
3. Compare **Turn by turn** with **Whole conversation**. Expand explanations and
   rubric dimensions to see why each score was returned.
4. Alternatively, use **Live chat**, then evaluate the captured conversation.
5. Export a transcript or download the report containing the exact evaluated
   snapshot, settings, run IDs, and results.

**View a recorded Foundry run** shows explicitly labelled, genuine past results.
It does not initiate a new evaluation and never presents recorded scores as live.

All telecom facts, policies, prices, people, tool responses, and accounts are
fictional. They are not Vodafone guidance. This is an educational demo, not a
representative accuracy benchmark or a claim that one model is better.

Evaluation sends transcripts to Foundry, where the run/data are retained.
Evaluated snapshots and run handles are held in browser session storage for
resume/export and normally disappear when that browser tab is closed. Do not
enter real customer data or other sensitive information into the public demo.
The application has no globally browsable public transcript history.

## How evaluation works

| View | Measures |
|------|----------|
| Turn by turn | Relevance and intent resolution |
| Whole conversation | Task completion, customer satisfaction, coherence |
| Conversation rubric (preview) | Topic switching, request coverage, context retention, corrections, context separation, evidence/action integrity, recovery/clarification |
| Prepared tool cases | Additional groundedness with synthetic function-tool evidence |

Each completed user/assistant exchange is submitted as its own prefix for
turn-level scoring. Earlier context is retained, but future messages are excluded.
This is intentional: the current service can otherwise score only the final
response of a full `messages` item even with `evaluation_level="turn"`.
Social closings can receive low relevance scores despite being appropriate;
inspect the explanation instead of treating the metric as ground truth.

Conversation-level evaluation receives the complete captured interaction.
Legitimate topic changes, necessary clarification, and withdrawn requests are
explicitly distinguished from dropped obligations. A later correct reply does
not erase an earlier fabricated account action.

Scores retain their native scales. No invented universal accuracy percentage,
model ranking, or cost estimate is shown. Thresholds are visible, and individual
dimension failures remain available even if a weighted average looks acceptable.
Skipped/missing/errored evaluators are not treated as quality passes.

Foundry jobs run asynchronously. The API prepares and submits a run in separate
short calls; the browser polls status. A page refresh resumes known runs without
resubmitting them. Ambiguous submission failures are not automatically retried:
use the evaluation ID to reconcile them in Foundry before creating another run.
Cancellation does not reverse usage already incurred.

## Dataset

Twelve controlled scenario pairs produce 24 conversations. Both variants use the
same instructions, user requests, and tool definitions; exactly one declared
assistant exchange changes. Multiple related rubric dimensions can be affected.
The unresolved-request pair has the same correct latest-topic answer and polite
ending in both variants, but only one fulfils the earlier explicit obligation.

| File | Purpose |
|------|---------|
| `data/scenarios.mjs` | Authored facts, requests, expected outcomes, and targeted faults |
| `data/rubric.json` | Proposed rubric and calibration policy |
| `data/generated/conversations.jsonl` | All 24 conversations |
| `data/generated/calibration.jsonl` | Nine scenarios / 18 conversations for tuning |
| `data/generated/holdout.jsonl` | Three scenarios / six conversations reserved from tuning |
| `data/generated/catalog.json` | Authored labels, topics, evidence ranges, hashes, and expectations |
| `api/data/corpus.json` | Generated deployment artifact |

Splits are by scenario, so a pair cannot leak across splits. Holdouts are hidden
from the initial scenario selector; don't use them to tune the rubric. If holdout
results inform changes, create a fresh held-out set. This small authored split is
a demo regression check, not an independent customer field study.

The evaluator receives only transcript/tool evidence, not authored variant labels
or expected verdicts. Expected score ranges remain hypotheses, not measured
results. The saved reference runs are measured results for their exact snapshots.

## Microsoft sample references

Implementation follows Microsoft's MIT-licensed
[conversation evaluation](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/ai/ai-projects/samples-dev/evaluations/multiturnConversationEvaluation.ts)
and [rubric evaluator](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/ai/ai-projects/samples-dev/evaluations/evaluatorsCatalogRubric.ts)
samples, with web-specific changes: bounded requests, explicit turn prefixes,
supported-level registration, complete data mappings, retained reports, and
credential-safe anonymous endpoints.

## Local development and checks

Node.js 22 or later is required. Runtime packages are pinned in
`api/package.json` and locked in `api/package-lock.json`.
Install development dependencies only in an isolated environment, never globally.
In this workspace they live under the verified `.venv\node` environment; point
`NODE_PATH` to its `node_modules` directory when running the local server.

```powershell
node scripts\build-datasets.mjs
node scripts\build-datasets.mjs --check
node scripts\build-web.mjs
node --test
node scripts\server.mjs
```

`scripts\calibrate.mjs` performs billable cloud smoke evaluations and persists
reports under ignored `.foundry\results\`. It registers a content-addressed rubric
with explicit conversation support. `scripts\export-reference.mjs` creates the
public, synthetic reference artifact only from completed runs with no evaluator
errors and verified per-turn coverage.

`scripts\ui-smoke.mjs` exercises real live chat/evaluation, export, refresh, and
mobile layout with isolated Playwright and an installed Edge browser.

## Deployment

GitHub Actions checks the generated corpus, builds the content-security policy,
runs the tests, and deploys `web/` plus `api/` on pushes to `main`.
Cloud package installation occurs in the isolated Static Web Apps build.

| Server setting | Purpose |
|----------------|---------|
| `FOUNDRY_PROJECT_ENDPOINT` | Existing Foundry project endpoint |
| `FOUNDRY_JUDGE_DEPLOYMENT` | Evaluation judge deployment |
| `FOUNDRY_CHAT_DEPLOYMENT` | Live conversation deployment |
| `FOUNDRY_RUBRIC_NAME`, `FOUNDRY_RUBRIC_VERSION` | Verified registered rubric |
| `FOUNDRY_TENANT_ID`, `FOUNDRY_CLIENT_ID`, `FOUNDRY_CLIENT_SECRET` | Server-to-server Entra identity |
| `JOB_SIGNING_KEY` | At least 32 characters; signs per-run browser capabilities |
| `LIVE_CALLS_ENABLED` | Set to `false` to stop new billable calls |

There is **no visitor authentication**. Cloud evaluation nevertheless requires
server-to-server Entra credentials and Foundry User at account scope.
Managed Static Web Apps Functions do not support managed identity; credentials
stay in encrypted server application settings, never in the browser or repository.
Rotate credentials before expiry and update both server settings and local
protected configuration. The current dedicated demo credential expires
2027-04-11; the provisioning helper does not create or rotate identities.

`scripts\provision.ps1` is scoped to the maintainer's approved receipt-benchmark
environment. Review its subscription, group, site, and repository parameters
before running it elsewhere. `infra\main.bicep` creates only the new Static Web App
and does not modify the existing Decision One demo or create model deployments.
Set `AZURE_STATIC_WEB_APPS_API_TOKEN` as a GitHub Actions repository secret.

**Anonymous live inference/evaluation is billable.** Each API instance limits
active billable submission/chat operations to four and starts to 24 per minute.
This is not a global quota, a limit on remote running jobs, or a hard spending cap;
counters reset on restart and are independent across instances. Use the kill
switch when not presenting. Budget alerts do not enforce a spending cap.

The input ceiling is 100 KB and 20 user turns. Import accepts one complete
conversation at a time. Live chat is text-only and does not execute tools;
prepared tool examples are synthetic, read-only traces. Foundry portal report
links/administration may require operator access, but the demo's results do not.
