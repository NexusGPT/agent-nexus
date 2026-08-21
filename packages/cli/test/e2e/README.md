# CLI End-to-End Flow Tests

A handful of bash scripts that drive the `nexus` CLI against a live API to
verify the public contract end-to-end. The sibling `scripts/sweep.sh` checks
each leaf in isolation (exit code + JSON parse). These flows check that the
data returned by one call is usable by the next — the chain-of-contract bugs
that shape-only sweeps cannot catch.

## What runs where

| Script                   | Flow                                     | Tests                                                                     |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------- |
| `01-hello-agent.sh`      | agent → deployment → emulator round-trip | agent persistence, deployment lifecycle, message dispatch, response shape |
| `02-workflow-attach.sh`  | workflow + node/edge + agent attach      | cross-domain references, publish lifecycle, validation gate               |
| `03-knowledge-attach.sh` | document + collection + agent + RAG      | KB ingestion, retrieval, agent-KB binding                                 |

Sequentially independent — failure in one does not poison the next. Each
script provisions, asserts, then cleans up via `trap`.

**The trap is not the only line of defence, and it cannot be.** A trap is a
promise a process makes about its own death, and a runner eviction, a
`timeout-minutes` cut and a SIGKILL are three deaths it never gets to observe.
So there are two layers:

- `cleanup_delete` records every delete that fails, and `cleanup_verdict` exits
  `3` when a flow PASSED and still left something behind. A leak on a passing
  flow is red; a leak on an already-failing flow is printed and does not rewrite
  the more informative failure.
- `scripts/cli-e2e-reap-orphans.mjs` runs as a workflow step on every outcome
  and vacuums prefixed rows older than 120 minutes. That covers the deaths a
  trap cannot.

## Naming convention

Every artifact a flow creates is prefixed `nexus_e2e_` (override via
`E2E_PREFIX`) and suffixed with a per-run id (`$(date +%s)-$$`). Reasoning:
the flows run in a **shared CI organization**, not a dedicated test org, so
auditability and reaper-friendliness matter. `scripts/cli-e2e-reap-orphans.mjs`
matches the prefix to vacuum orphans from failed cleanups.

🚨 **The prefix is the ONLY thing separating test data from real data in that
org, and the reaper deletes in bulk.** It matches on `startsWith`, never
`includes`; it counts two control prefixes that must match nothing and aborts
without deleting if either fires; it prints every row it will KEEP by name; and
it refuses a production base URL outright. A name that does not carry the prefix
is invisible to the reaper and will accumulate forever.

## Required environment

| Variable                  | Purpose                                                                   | Default                                                                                         |
| ------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NEXUS_BIN`               | Command used to invoke the CLI (split on whitespace)                      | `nexus` on PATH, else `node dist/index.js`                                                      |
| `NEXUS_PROFILE`           | Profile to scope every CLI call (CI uses `ci`)                            | unset (refuses to run unless `NEXUS_E2E_ALLOW_DEFAULT=1` is also set)                           |
| `NEXUS_BASE_URL`          | Explicit target host (overrides the profile's persisted baseUrl)          | unset (then the profile's stored baseUrl is used; refuses if the resolved URL is empty or prod) |
| `NEXUS_E2E_ALLOW_DEFAULT` | Acknowledge using the active CLI profile (developer escape hatch)         | unset                                                                                           |
| `NEXUS_E2E_ALLOW_PROD`    | Acknowledge the resolved URL matches `api.nexusgpt.io`. Almost never set. | unset                                                                                           |
| `E2E_PREFIX`              | Artifact name prefix                                                      | `nexus_e2e`                                                                                     |
| `E2E_RUN_ID`              | Per-run suffix (epoch, PID, random)                                       | computed                                                                                        |

CI exports `NEXUS_BASE_URL=https://api-staging.gpt.nexus` once at the job
level and logs in to a `ci` profile with `NEXUS_E2E_API_KEY` — distinct
from the read-only `NEXUS_STAGING_API_KEY` that the per-leaf sweep uses.
The e2e key needs write scopes; the sweep key explicitly does not.

### Prod guard

`lib.sh::assert_safe_target` is layered defense:

1. `NEXUS_E2E_ALLOW_DEFAULT=1` — opt in to the active profile with a loud
   warning. Caller owns the data.
2. `NEXUS_PROFILE` must resolve to an explicit base URL — either via
   `NEXUS_BASE_URL` (env override) or via the profile's persisted
   `baseUrl` from `auth login --base-url …`. Empty resolution → refuse.
3. The resolved URL must not match `api.nexusgpt.io`. Override with
   `NEXUS_E2E_ALLOW_PROD=1` only if a prod target is genuinely intended.

Without the guard, a profile created via `auth login` without
`--base-url` defaults to the prod host and would silently create
`nexus_e2e_*` artifacts in production.

## Local run

```bash
# Recommended — scope to a known staging profile. --base-url persists to
# the profile so the run is target-explicit on every subsequent invocation.
nexus auth login --profile e2e --api-key "$STAGING_KEY" \
  --base-url https://api-staging.gpt.nexus
NEXUS_PROFILE=e2e ./packages/cli/test/e2e/01-hello-agent.sh

# Belt-and-braces — pin the target via env, ignores the profile's baseUrl.
NEXUS_PROFILE=e2e NEXUS_BASE_URL=https://api-staging.gpt.nexus \
  ./packages/cli/test/e2e/01-hello-agent.sh

# Escape hatch — accept the active profile (you own the data).
NEXUS_E2E_ALLOW_DEFAULT=1 ./packages/cli/test/e2e/01-hello-agent.sh
```

## CI run

`.github/workflows/cli-e2e.yml` runs the flows on:

- PRs touching `packages/cli/**`, `packages/sdk/**`, or
  `packages/types/src/api/public/**`
- manual `workflow_dispatch`
- a 6-hourly cron against staging (catches contract drift from backend
  deploys even when no CLI change is in flight)

All three flow steps share one gate: `!cancelled() && steps.auth.outcome == 'success'`.
Auth/build/install failure short-circuits to one error rather than three
identical 403/404 dumps. Failures surface in the Actions UI; no external
alerting is wired today.

## Diagnostics on failure

Each step writes its `--json` response to a per-run temp directory. On
failure, the trap dumps every captured file to stderr before exiting. Cron
alerts at 3am are useless without the full JSON trail — this is the
cheapest way to keep them debuggable.

## Anti-patterns

- **Don't mock the API.** These tests exist precisely because shape-only
  mocks miss contract-chain drift. The whole point is the real chain.
- **Don't share state between flows.** Each script is fully self-contained
  with its own setup + teardown. Tempting to share an agent across flows;
  resist — it tightens coupling and complicates reaper logic.
- **Don't gate on flaky assertions.** If a step depends on LLM latency or
  generation quality, mark it as a soft check (e.g. assert ≥1 assistant
  message, not "the answer contains 'hello'") unless deterministic.
