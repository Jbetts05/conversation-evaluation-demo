# Sharing and operating this demo

This is an educational proof of concept, not a production customer-support
system. Its conversations, accounts, policies, prices, and tool results are
fictional. Do not enter real customer data or secrets.

## Credentials and public source

- `.local.env`, virtual environments, local settings, and private evaluation
  artifacts are excluded from source control.
- The browser receives no Foundry credential or server signing key.
- Published reference runs contain synthetic inputs and actual judge results,
  but no signed status/cancellation capabilities.
- Keep credentials in protected local configuration and encrypted Azure
  application settings. Rotate them before expiry.
- `npm run release:check` checks Git history against targeted credential patterns
  and available local runtime secrets; it is not a comprehensive security audit.

## Anonymous use and spending

The UI intentionally has no visitor authentication. Live chat and evaluation
consume the operator's Foundry quota and are billable. Per-instance throttling is
not a global budget, nor a limit on running cloud evaluation jobs.

Set `LIVE_CALLS_ENABLED=false` when not presenting. Recorded examples remain
available without creating new inference calls. If you need a hard global
allowance or tenant isolation, add those controls before broad deployment.

Evaluation data and runs are retained in Foundry. Browser session storage holds
evaluated snapshots and run handles for resume/export; the application has no
public transcript-history directory. Cancellation does not refund prior usage.

## Reporting issues

Report ordinary bugs through GitHub issues using fictional reproductions.
Never post working credentials, signed run handles, real customer transcripts,
or private evaluation artifacts in an issue. If a credential is exposed, revoke
or rotate it before discussing a redacted reproduction.
