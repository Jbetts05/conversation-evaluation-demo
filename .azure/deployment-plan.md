# Conversation Lab deployment plan

Status: Deployed - Astra judge and seven-evaluator profile

## Approved scope

The user approved proceeding with implementation and deployment in the same
subscription/resource group as Decision One, reusing receipt-benchmark Foundry.
The user separately approved a dedicated backend application identity, its
credential, and Foundry User access at the account scope. Visitors have no login.
The existing Decision One application remains untouched.

## Azure context

- Subscription: 556dc8cb-5da1-41d7-8a10-1be2cd6de16e
- Resource group: rg-receipt-benchmark
- New Static Web App: conversation-evaluation-demo
- Hosting region: westeurope, same as Decision One
- Existing Foundry account region: swedencentral
- Existing project: receipt-benchmark
- Project endpoint: https://aireceiptbench556dc8.services.ai.azure.com/api/projects/receipt-benchmark
- Judge deployment: gpt-6-astra (GPT-6 Astra), compatibility verified and live server setting updated
- Chat deployment: gpt-6-luna
- Backend application ID: 472d4608-3678-40cd-904b-a4bfbeeb7f9a
- Credential expiry: 2027-04-11; values are never in source control
- Rubric: conversation-lab-rubric-5571bb3b8379, version 1

## Components and recipe

| Component | Path | Hosting |
|-----------|------|---------|
| Plain HTML/CSS/JavaScript UI | web/ | Azure Static Web Apps Free |
| Node.js 22 anonymous HTTP API | api/ | Integrated managed Functions |
| Pinned Foundry/Identity SDKs | api/package.json | Isolated cloud build |
| Synthetic corpus and rubric | api/data/corpus.json | Generated deployment asset |
| Initial site infrastructure | infra/main.bicep | Bicep via Azure CLI |
| Continuous deployment | .github/workflows/deploy.yml | GitHub Actions |

No new model deployments, database, queue, storage account, or containers.
GitHub source is a separate private repository, not the Decision One repository.
Credentials are encrypted server settings. Integrated Functions do not provide
managed identity, so this approved service principal is intentional.

## Capacity and limits

The quota CLI was queried first for Microsoft.Web/westeurope. Its returned wildcard
quota explicitly had isQuotaApplicable=false and described regional VMs, not
Static Web Apps. It is not a usable Static Web Apps quota.

Fallback: actual subscription inventory from az staticwebapp list plus official
Static Web Apps quota documentation:
https://learn.microsoft.com/en-us/azure/static-web-apps/quotas

| Resource type | New quantity | Current | Total after | Limit | Source |
|---------------|--------------|---------|-------------|-------|--------|
| Microsoft.Web/staticSites, Free | 1 | 2 | 3 | 10 per subscription | Azure CLI inventory + Microsoft Learn |
| Existing Foundry/model resources | 0 | Reused | Unchanged | No new allocation | Azure deployment list |

The approved Entra app/principal/credential and account-scoped role assignment
have already been created successfully. No additional identity or permission
change is required by the deployment template.

HTTP calls have a shared 38-second abort budget and a 35-second SDK request
timeout. They never wait for a complete evaluation job. Browser polling handles
the asynchronous Foundry execution.

Anonymous billable operations use per-instance concurrency/start limits, input
and output bounds, signed 24-hour run handles, and an operator kill switch.
These are not a hard global spending cap. Transcript bodies/credentials are not
written to application logs.

## Implementation proof

The twelve scenario pairs and separate calibration/holdout splits are generated
and structurally checked. Expectations are not included in judge inputs.

Real SDK smoke runs verified conversation rubric support, complete mappings,
and explicit per-turn prefixes with no future messages. On the paired unfinished
request example, each variant passed 3 of 4 turn items; request_coverage scored
5 for the well-handled variant and 2 for the faulty one. This is a small observed
example, not a benchmark. Social closing relevance limitations are disclosed.

Genuine reference runs are explicitly labelled and contain no credentials or
signed control handles. Live chat, comparison, import/export, safe rendering,
native score scales, evaluator errors, and stale-input distinctions are wired.

## Execution checklist

- [x] Scope, hosting and existing Foundry reuse approved
- [x] Server identity and resource-scoped role approved/configured
- [x] Resource inventory and capacity checked
- [x] Core implementation and generated datasets
- [x] Real Foundry SDK compatibility/calibration smoke
- [x] API/unit/syntax checks
- [x] Real browser end-to-end/local visual check
- [x] Mark Ready for Validation and run azure-validate
- [x] Bicep compilation
- [x] ARM template validation and policy preflight
- [x] What-if shows only the new site
- [x] Azure authentication and static role review
- [x] Deployment using azure-deploy
- [x] Hosted anonymous UI/API/live-call verification

## Validation proof

Validated by: azure-validate, 2026-10-13.

| Check | Command run | Result | Date |
|-------|-------------|--------|------|
| Generated assets | node scripts/build-datasets.mjs --check; node scripts/build-web.mjs | Pass | 2026-10-13 |
| API/data checks | node --test | 19 tests passed, including deployment link regression | 2026-10-13 |
| Frontend syntax | node --check web/app.js | Pass | 2026-10-13 |
| Bicep compilation | az bicep build --file infra/main.bicep | Pass | 2026-10-13 |
| Template/policy preflight | az deployment group validate, scoped to approved group with infra/main.parameters.json | Succeeded | 2026-10-13 |
| What-if | az deployment group what-if --mode Incremental, same template/parameters | Only new site Create; all existing resources Ignore | 2026-10-13 |
| Authentication | az account show | Approved subscription active | 2026-10-13 |
| Assigned policies | az policy assignment list | Three SQL/storage protection sets; no Static Web Apps restriction; ARM preflight passed | 2026-10-13 |
| Real SDK jobs | node scripts/calibrate.mjs | Four completed runs, no evaluator errors; four turn rows per transcript | 2026-10-13 |
| Browser end-to-end | node scripts/ui-smoke.mjs | Real anonymous chat, both levels, export, reload and mobile layout passed | 2026-10-13 |
| Hosted browser end-to-end | TEST_BASE_URL set to deployed site; node scripts/ui-smoke.mjs | Anonymous real chat, both levels, capability-free report export, reload, CSP and mobile layout passed | 2026-10-13 |
| Prepared tool evaluation | TEST_BASE_URL set to deployed site; node scripts/tool-smoke.mjs | Groundedness and rubric completed; all returned metrics passed on the well-handled tool fixture | 2026-10-13 |
| Live role verification | az role assignment list at Foundry account scope | Dedicated app has Foundry User at approved resource only | 2026-10-13 |

Static role review: the template contains only the new site, with no managed
identity to grant. The separately approved application identity uses the resource
scoped Foundry User role required by the server SDK. No subscription-wide role is
granted and no inference key is sent to the browser.

## Deployment record

- Live anonymous site: https://kind-sand-00382f503.2.azurestaticapps.net
- Separate private source: https://github.com/Jbetts05/conversation-evaluation-demo
- Original verified deployment workflow run: 38400916804
- Original verified application revision: 97c25c766dcf4d0e2fb799e58caccae71403f972
- Existing Decision One site/resources: unchanged

Deployment packaging initially exposed an npm parent-package file link. The
manifest/lockfile were corrected and a regression check prevents recursive local
links from entering the managed API artifact. The subsequent deployment and
hosted real evaluations completed successfully.

## Approved judge/profile update

The user requested Astra as the stronger evaluation judge while retaining Luna
for live chat, and selected all seven documented conversation-level built-ins
plus the custom multi-topic rubric.

The updated conversation profile requests output_quality, tool_use_quality,
deflection_rate, customer_satisfaction, task_completion, coherence, groundedness,
and the existing rubric. Composite and individual metrics deliberately overlap
for educational comparison and must not be treated as independent votes.
Turn-only relevance/intent resolution remain confined to the turn profile.

Composite guidance recommends GPT-5.6-family judges. Real Astra runs in this
resource nevertheless completed both output_quality and tool_use_quality,
including a tool-evidence case with all eight primary metrics completed.
The no-tools case returned genuine tool_use_quality applicability skips, which
are distinctly displayed and not mistaken for execution errors or quality passes.

Recorded reference exports must match both the configured judge and current
testing criteria. Historical Mini runs retain their actual model provenance.

Local browser end-to-end checks verified all eight conversation-level cards,
native score scales, composite component grouping, real Astra model attribution,
capability-free report exports, and Luna remaining the live chat model.
All four published reference runs have been regenerated with Astra and the
current seven-built-in-plus-rubric profile.

Update validation, 2026-10-13:

| Check | Command | Result |
|-------|---------|--------|
| Profile/results/reference regressions | node --test | 28 passed |
| Browser module syntax | node --check web/app.js; node --check web/metrics.js | Passed |
| Static security/assets | node scripts/build-web.mjs; node scripts/build-datasets.mjs --check | Passed |
| Real tool composite | node scripts/tool-smoke.mjs against local SDK API, EXPECTED_JUDGE=gpt-6-astra | All seven built-ins plus rubric completed with actual tool evidence |
| Real browser flow | node scripts/ui-smoke.mjs, EXPECTED_JUDGE/EXPECTED_MODEL=gpt-6-astra | Eight conversation cards, correct underlying model, live Luna chat, export and resume passed |
| Infrastructure/identity | No template, resource, role, credential or endpoint changes | Existing validated infrastructure and identity reused |

The first calibration command treated genuine no-tool applicability skips as
failures in its own verifier. Raw runs had completed with no execution errors.
The shared result inspector now allows only explicit tool_use_quality
not-applicable results when no tool definitions were supplied, while surfacing
unexpected skips and missing composite gates. The original raw results are
preserved; no labels or scores were rewritten.

The updated runtime setting and reference assets now use gpt-6-astra; live chat
remains gpt-6-luna. Deployment 38413889042 successfully published revision
e965a09a7bfb54a3ac65ba67db1b66f3d7e26b24. Live catalog and recorded-run metadata
confirm Astra, with eight criteria per conversation-level reference run.
Hosted real UI and tool-evidence checks passed: the downloadable report confirms
Astra in both declared provenance and returned model usage, all eight primary
conversation metrics are present, no-tool results are explicitly not applicable,
and real tool traces complete the tool-use composite successfully.

## Files and data lifecycle

Local dependencies are confined to verified .venv/node. .local.env, .local/,
.venv/, and .foundry/results/ are ignored. The repository contains only fictional
reference transcripts/results, source, infrastructure, and locked dependency
metadata. Evaluations are retained in Foundry; no destructive automatic cleanup
is performed. Session snapshots/run capabilities are stored in the browser tab
only for resume/export.
