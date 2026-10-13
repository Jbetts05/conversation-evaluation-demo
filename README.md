# Conversation Lab

![Animated product walkthrough: a fictional billing and roaming conversation is evaluated by GPT-6 Astra at turn and conversation level](docs/conversation-lab.svg)

**Good answers. A good conversation?**

A lightweight, anonymous Microsoft Foundry demo showing the difference between
judging responses and judging the complete interaction. Plain HTML/CSS/JavaScript,
a Node.js 22 managed API, and Azure Static Web Apps. No frontend framework,
containers, application database, or visitor sign-in.

**Live chat:** GPT-6 Luna (`gpt-6-luna`). **Evaluation judge:** GPT-6 Astra
(`gpt-6-astra`), using a stronger model to assess Luna's conversations. Both
the built-in metrics and the custom rubric use Astra.

**What you can explore:** multi-topic conversations, interrupted requests, memory
and corrections, tool evidence, paired good/faulty examples, and the difference
between answer quality and end-to-end task completion.

The animation uses recorded scores from a fictional Astra example. Its timing is
illustrative, not an inference-latency claim. The source is self-hostable; a live
deployment requires your own Foundry project, model deployments and credentials.

**Start here:** [Evaluate multi-turn conversations in Microsoft Foundry](docs/evaluation-guide.md)
— a short how-to with an example, compatible evaluators, an SDK run and result interpretation.

## Use the demo

1. Choose an authored example and a well-handled or faulty version.
2. Select **Evaluate conversation**, or compare both versions.
3. Compare **Turn by turn** with **Whole conversation**. Expand explanations and
   rubric dimensions to see why each score was returned.
4. Alternatively, use **Live chat**, then evaluate the captured conversation.
5. Export a transcript or download the report containing the exact evaluated
   snapshot, settings, run IDs, and results.

Downloaded reports omit signed status/cancellation capabilities; sharing a report
does not grant control of the evaluation run.

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
| Whole conversation | All seven documented built-ins: output quality, tool-use quality, deflection rate, customer satisfaction, task completion, coherence, groundedness |
| Conversation rubric (preview) | Topic switching, request coverage, context retention, corrections, context separation, evidence/action integrity, recovery/clarification |
| Prepared tool cases | Synthetic function-tool evidence for actual tool-use and groundedness scoring |

Both composite gates have expandable component scores. Individual coherence,
groundedness and task completion are deliberately retained alongside output
quality for educational comparison; these overlapping judgments are not
independent votes. Deflection rate retains its returned score and native verdict,
not an invented higher-is-better quality scale.

For conversations without tool definitions, tool-use quality reports the
service's genuine **not applicable** result. Other unexpected skips, missing
composite gates, and evaluator errors are surfaced rather than presented as passes.

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

Output-quality and tool-use-quality gates are binary: `1/1` passes at threshold
1, while their individual Likert components use scales such as `4/5`.
Content-addressed UI assets prevent old formatters being mixed with new API
results. Judge settings refresh before evaluation, on opening the judge details,
and when returning to the tab. Historical results retain their actual judge and
are labelled when that differs from the current configuration.

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
Python is used only to create an isolated development environment; the application
itself is Node.js. Install dependencies inside that environment, never globally.

Clone the repository, then run this Windows PowerShell quickstart:

```powershell
git clone https://github.com/Jbetts05/conversation-evaluation-demo.git
Set-Location conversation-evaluation-demo
python -m venv .venv
& .\.venv\Scripts\python.exe -c "import sys; assert sys.prefix != sys.base_prefix"
$env:VIRTUAL_ENV = (Resolve-Path .venv).Path
npm install --prefix .venv\node --ignore-scripts --no-audit --no-fund @azure/ai-projects@2.8.0 @azure/identity@4.13.3 @azure/functions@4.16.5
$env:NODE_PATH = (Resolve-Path .venv\node\node_modules).Path
```

For local live calls, authenticate your own Azure CLI identity and give it the
[documented Foundry evaluation permissions](https://learn.microsoft.com/azure/foundry/observability/how-to/evaluation-permissions).
Set these values to your own project and actual deployment names:

```powershell
az login
$env:FOUNDRY_PROJECT_ENDPOINT = "https://<account>.services.ai.azure.com/api/projects/<project>"
$env:FOUNDRY_JUDGE_DEPLOYMENT = "<your-stronger-judge-deployment>"
$env:FOUNDRY_CHAT_DEPLOYMENT = "<your-chat-deployment>"
node scripts\local-config.mjs
```

The helper creates ignored `.local.env` settings and a random run-signing key
without printing credentials. `.local.env.example` documents the fields.
Without live configuration, the app can still inspect prepared conversations,
export transcripts, and show the genuine recorded runs.

```powershell
node scripts\build-datasets.mjs
node scripts\build-datasets.mjs --check
node scripts\build-web.mjs
node --test
```

To enable live evaluation, run `node scripts\calibrate.mjs` once after configuration.
It registers the rubric and performs **billable** smoke runs. Then start the app:

```powershell
node scripts\server.mjs
```

Open `http://127.0.0.1:8787`. On macOS/Linux the same Node commands work; adapt the
virtual-environment activation, paths and environment-variable syntax.

Edit `web/index.template.html`, not the generated `web/index.html`. The web
preparation command writes content-versioned assets and the Static Web Apps cache
and security headers; there is still no frontend framework or bundler.

`scripts\calibrate.mjs` performs billable cloud smoke evaluations and persists
reports under ignored `.foundry\results\`. It registers a content-addressed rubric
with explicit conversation support. `scripts\export-reference.mjs` creates the
public, synthetic reference artifact only from completed runs with no evaluator
errors and verified per-turn coverage.

`scripts\ui-smoke.mjs` exercises real live chat/evaluation, export, refresh, and
mobile layout with isolated Playwright and an installed Edge browser.
The core tests require no package installation. Browser checks additionally need
Playwright in the isolated environment; live browser checks invoke billable models.

Run `npm run release:check` before sharing source. It checks tracked files and Git
history for known local secrets and targeted credential patterns without printing
secret values. It is not a comprehensive security audit.

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
protected configuration. Credential expiry depends on your own identity
configuration; the provisioning helper does not create or rotate identities.

`scripts\provision.ps1` requires your subscription, resource group, location and
GitHub repository explicitly. It does not default to the maintainer's environment.
Before running it, add an authorised server application identity to your ignored
local settings; local Azure CLI credentials cannot be used by the hosted backend.
`infra\main.bicep` creates only a Static Web App, not a Foundry project or models.
Set `AZURE_STATIC_WEB_APPS_API_TOKEN` as a GitHub Actions repository secret.

```powershell
.\scripts\provision.ps1 -Subscription "<subscription-id>" `
  -ResourceGroup "<existing-resource-group>" -Location "<hosting-region>" `
  -Name "<your-site-name>" -Repository "<owner/repository>"
```

The helper sets encrypted server settings and the repository deployment secret.
Review it before execution. Follow your organisation's approval and validation
process before provisioning resources or assigning identity permissions.

**Anonymous live inference/evaluation is billable.** Each API instance limits
active billable submission/chat operations to four and starts to 24 per minute.
This is not a global quota, a limit on remote running jobs, or a hard spending cap;
counters reset on restart and are independent across instances. Use the kill
switch when not presenting. Budget alerts do not enforce a spending cap.

The input ceiling is 100 KB and 20 user turns. Import accepts one complete
conversation at a time. Live chat is text-only and does not execute tools;
prepared tool examples are synthetic, read-only traces. Foundry portal report
links/administration may require operator access, but the demo's results do not.

See [SECURITY.md](SECURITY.md) for data-handling, anonymous-use and credential
guidance. No open-source license file is included.
