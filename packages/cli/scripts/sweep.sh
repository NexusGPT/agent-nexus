#!/usr/bin/env bash
# sweep.sh — methodical read-only sweep of `nexus` CLI subcommands.
#
# Two roles:
#   1. Underlay for the /pinguin skill — produces structured results so the
#      agent loop can focus on interpretation.
#   2. CI gate — the `cli-sweep` job of .github/workflows/pr-checks.yml. Runs
#      against staging on every PR affecting the CLI's package graph. The
#      --strict flag promotes WARN to FAIL so the JSON contract is treated as
#      load-bearing. Whether that context GATES is not asserted here; see
#      "Does this gate?" below.
#
# Usage:
#   ./sweep.sh                       # text output, default profile
#   ./sweep.sh --profile prod        # explicit profile
#   ./sweep.sh --json                # machine-readable output (for /pinguin)
#   ./sweep.sh --strict              # WARN counts as FAIL (used by CI)
#   ./sweep.sh --check-drift         # derive every command from the commander
#                                    # tree and diff it against the declared
#                                    # classification. Standalone — does not
#                                    # run the sweep, and needs no auth.
#
# Exit code:
#   default        — number of FAILs (0 = clean)
#   --strict       — number of FAILs + WARNs (any non-PASS fails CI)
#   --check-drift  — 1 if any drift, 0 if clean
#
# 🚨 A SKIP NEVER COUNTS TOWARD THE EXIT CODE, AND THAT IS WHY IT HAS TO BE
# DECLARED. Environment policy is not a regression, so a skip must not fail the
# build — but that also means a leaf going dark changes ONE DIGIT in a summary
# line and nothing else. Four `role *` leaves lost their live coverage exactly
# that way, and the only reason anyone noticed is that they went RED first.
#
# So `SWEEP_EXPECTED_SKIPS` in `src/command-universe.ts` names the skips this
# repository accepts, and this script reads it: an undeclared skip is a FAIL, a
# declared one is reported with the coverage it costs, and a declaration that no
# longer skips is reported STALE and fails nothing. The summary carries the
# denominator — `$SKIP/$DECLARED_TOTAL declared skip` — because a numerator on
# its own is what made the loss invisible.
#
# 🚨 PENDING IS THE SECOND NON-COUNTING STATUS, AND IT SELF-RETIRES RATHER THAN
# GOING STALE QUIETLY.
#
# This job builds the CLI from the PR's own sources and sweeps it against the
# DEPLOYED staging API — two different trees. A branch adding a CLI noun AND the
# route it calls is therefore red until it merges and deploys, with nothing wrong
# anywhere and no code change able to clear it.
#
# `SWEEP_ROUTES_PENDING_DEPLOY` in `src/command-universe.ts` names that, per leaf,
# bound to the exact path the deployed API says it cannot serve. Four outcomes,
# and the fourth is the whole point:
#
#   declared + that path is absent     PENDING, outside the exit code, with its
#                                      cause and its own denominator.
#   declared + any other failure       FAIL. A declaration is not an amnesty.
#   declared + the leaf ANSWERS        FAIL, naming the entry to delete. A route
#                                      going live is what retires the entry, and
#                                      a gate is the only thing that notices.
#   undeclared + that path is absent   FAIL, unchanged. Nothing is exempt by
#                                      shape.
#
# A SKIP's good news is reported and fails nothing, because an environment policy
# lifts by somebody else's hand at any time. A pending-deploy entry is about THIS
# branch's own undeployed diff, expires exactly once, and the person who wrote it
# is the person whose change deployed — so its good news is a FAIL. The cost of
# the other direction is in the tree: `tracks list` is parked behind a block
# comment naming the probe that would promote it, its route has been answering
# for some time, and nothing anywhere went red.
#
# 🚨 DOES THIS GATE? NOT ASSERTED HERE, AND THE LINE ABOVE USED TO ASSERT IT.
#
# Branch protection lives on GitHub and no file in this repository can see it, so
# a sentence here claiming the context is required goes wrong SILENTLY the moment
# it is armed or disarmed. That is not hypothetical: this header read `CLI: Sweep`
# "is REQUIRED on staging and main" while the context was required on NEITHER, so
# a red sweep read as blocking and its absence from a rollup read as impossible.
#
# `.github/required-contexts.json` declares the INTENT and is the input
# `scripts/required-contexts.ts` reads. Ask the live system:
#
#   pnpm dlx tsx scripts/required-contexts.ts --reconcile
#
# It needs ADMIN — `GET /branches/{b}/protection` is admin-only and the default
# GITHUB_TOKEN does not have it — so it CANNOT run in CI, and a declaration can
# sit unarmed indefinitely with nothing noticing. `--verify` is the half that
# does run in CI (via `Gate specs`) and it is OFFLINE: it checks the declaration
# against the workflow, never against protection. So this exact drift class is
# invisible to every automated check in the repository, by construction.
#
# WHERE THE COMMAND LIST LIVES — not here, deliberately.
#
# This script used to carry three bash arrays (LEAVES / REGISTRATION_ONLY /
# EXCLUDED) naming every command by hand. A hand list beside an evolving CLI
# goes stale in silence, and a sweep over a stale list reads exactly like a
# sweep over a complete one. Both the leaves executed below and the drift
# verdict now come from `src/command-universe.ts`, whose POPULATION is derived
# from the commander program tree and whose DISPOSITION per command is declared
# in one table. `src/command-universe.test.ts` fails the build when the two
# diverge, and it runs in `Tests: Vitest`, which is a required check.

set -uo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Arg parsing
# ─────────────────────────────────────────────────────────────────────────────

PROFILE=""
OUTPUT="text"        # text | json
STRICT=false
CHECK_DRIFT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)      PROFILE="$2"; shift 2 ;;
    --json)         OUTPUT="json"; shift ;;
    --strict)       STRICT=true; shift ;;
    --check-drift)  CHECK_DRIFT=true; shift ;;
    -h|--help)
      sed -n '1,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Bash 3.2 (the macOS default) errors with "unbound variable" when expanding
# `"${ARR[@]}"` on an empty array under `set -u`. Callers expand via the
# `${NEXUS_ARGS[@]+"${NEXUS_ARGS[@]}"}` idiom to stay portable across the
# macOS-3.2 / linux-5.x split that matters for both local dev and CI.
NEXUS_ARGS=()
[[ -n "$PROFILE" ]] && NEXUS_ARGS+=(--profile "$PROFILE")

# Which `nexus` binary to invoke. Defaults to PATH lookup ("nexus"), which is
# correct for any developer with `pnpm add -g @agent-nexus/cli` installed.
# CI overrides via the NEXUS_BIN env var to point at the freshly-built artifact
# (e.g. NEXUS_BIN="node packages/cli/dist/index.js") — `pnpm install` does not
# link workspace bins to a PATH location, so without this override the script
# would FATAL at the preflight `nexus --version` step before testing anything.
# Multi-word values are split on whitespace into a bash array so we can invoke
# `"${NEXUS_CMD[@]}"` with proper argv expansion (no eval).
read -ra NEXUS_CMD <<< "${NEXUS_BIN:-nexus}"

# Defined ABOVE `run_leaf` deliberately. `run_leaf` shells out to
# `scan-response.py` beside this script, and bash resolves a variable at CALL
# time, so a definition further down would work today and break silently the
# first time anything calls `run_leaf` earlier.
SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)

# The policy-refusal matcher, shared with `seed-sweep-fixtures.sh`. Sourced
# rather than inlined because both scripts need the same answer and a second
# copy would keep agreeing with itself after this one was broadened.
#
# The source is GUARDED. `set -e` is deliberately not on in this script, so a
# missing file would leave `is_policy_refusal` undefined, every call would fail,
# and every policy refusal would silently become a FAIL — a wall of red that
# says nothing about the environment. That is the same failure direction the
# derivation refusals below are written to prevent, so it gets the same refusal.
# shellcheck source=./policy-refusal.sh
if ! . "$SCRIPT_DIR/policy-refusal.sh"; then
  echo "FATAL: could not source $SCRIPT_DIR/policy-refusal.sh" >&2
  echo "Refusing to sweep without it — every policy refusal would read as a CLI" >&2
  echo "regression and the run would be red for a reason that is not about the CLI." >&2
  exit 8
fi

# The route-absence matcher. GUARDED for the same reason and with the same shape:
# `set -e` is deliberately off, so a missing file would leave
# `is_route_not_deployed` undefined, every call would fail, and a leaf whose route
# this branch has not deployed yet would read as a CLI regression — a red that
# says nothing about the CLI and that no code change can clear.
#
# ⚠️ The failure direction is the OPPOSITE of the one above and it is worse, which
# is why it refuses rather than degrading: a missing policy matcher turns declared
# SKIPs red, and somebody looks. A missing route matcher turns a declared PENDING
# red AND leaves the STALE arm — the self-retiring half — unreachable, so the
# mechanism would stop noticing a deploy with nothing to say it had.
# shellcheck source=./route-not-deployed.sh
if ! . "$SCRIPT_DIR/route-not-deployed.sh"; then
  echo "FATAL: could not source $SCRIPT_DIR/route-not-deployed.sh" >&2
  echo "Refusing to sweep without it — a route this branch has not deployed yet would" >&2
  echo "read as a CLI regression, and the declaration that retires itself when the" >&2
  echo "route goes live would never fire at all." >&2
  exit 9
fi

# ─────────────────────────────────────────────────────────────────────────────
# Inventory — resolved from src/command-universe.ts, never written down here
# ─────────────────────────────────────────────────────────────────────────────



# `pnpm exec` resolves tsx through THIS package's own node_modules, so the sweep
# runs from any directory. No fallback and no `|| true` anywhere below: if the
# derivation cannot run, the leaf list is UNKNOWN, and an unknown list must
# never degrade into an empty one — a zero-leaf sweep passes.
#
# 🚨 `tsx` HAS TO BE A devDependency OF `packages/cli` ITSELF, and that is what
# `src/shell-scripts-declare-their-tools.test.ts` asserts. `pnpm exec` also
# searches the WORKSPACE ROOT's `node_modules/.bin`, so a tool the monorepo root
# happens to declare resolves here and looks declared. The public mirror is a
# different workspace whose root declares nothing at all — every tool a script
# under `packages/cli/` runs has to come from this package's own manifest, or it
# resolves in the monorepo and is absent in the mirror.
run_universe() {
  (cd -- "$SCRIPT_DIR/.." && pnpm exec tsx scripts/command-universe.ts "$@")
}

# ─────────────────────────────────────────────────────────────────────────────
# Run one leaf — capture exit code + JSON-parse result
# Emits a single result line: STATUS|PATH|NOTE
# ─────────────────────────────────────────────────────────────────────────────

run_leaf() {
  local path="$1"
  local out exit_code diag diag_bytes transcript errfile
  # Second argument, not a global lookup: the caller already knows, and a
  # function that re-derives its own inputs is a second place for the two lists
  # to disagree.
  local require_non_empty="${2:-false}"
  # Third argument, same reasoning as the second: the caller already resolved
  # membership of SWEEP_EXPECTED_SKIPS, and a function re-deriving its own inputs
  # is a second place for the two lists to disagree.
  local expected_skip="${3:-false}"
  # Fourth and fifth, same reasoning again. EMPTY means this leaf carries no
  # pending-deploy declaration, which is the ordinary case — so the arms below
  # test for a non-empty route rather than for a flag, and there is no third state
  # in which a route is declared and its acceptance is not.
  local pending_route="${4:-}"
  local pending_cause="${5:-}"

  # 🚨 THE TWO STREAMS ARE KEPT APART, AND `2>&1` HERE WAS A HOLE IN THE SECRET
  # SCAN RATHER THAN AN EXTENSION OF IT.
  #
  # `scan-response.py` parses BEFORE it walks — its `scan()` returns `1, []` the
  # moment `json.loads` fails, so `findings()`, the credential walk this whole
  # gate exists for, never runs on a body that did not parse. Folding stderr in
  # therefore did not scan stderr; it DISABLED the scan over stdout. One byte of
  # commentary blinded it to the entire response. Measured 2026-09-09 on one
  # document: stdout alone `exit 2 pushToken (len 40)`, the same stdout plus 332
  # bytes of stderr `exit 1 NOT-JSON`, stdout alone again `exit 2` as a control.
  #
  # And the CLI writes to stderr on runs where nothing is wrong, deliberately —
  # the contract warning (on by default), the retry notice and the deprecation
  # notice all do, none gated on `--json`, because the promise is "ONE JSON
  # document on STDOUT and nothing else". So the fold also reported a healthy
  # leaf as "exit=0 but JSON parse failed". `src/id-graph.streams.ts` carries
  # the full argument; this is the same split in the sibling sweep.
  #
  # A REFUSAL still needs both: an error's text is on stderr, and
  # `is_policy_refusal` matches that sentence. That is what `$transcript` is for.
  errfile=$(mktemp) || {
    printf 'FAIL|%s|could not create a temp file to capture stderr; refusing to sweep this leaf with the streams merged\n' "$path"
    return
  }
  # shellcheck disable=SC2086
  out=$("${NEXUS_CMD[@]}" ${NEXUS_ARGS[@]+"${NEXUS_ARGS[@]}"} $path --json 2>"$errfile")
  exit_code=$?
  diag=$(cat "$errfile")
  # Off the FILE, never off `$diag`: `$(cat …)` strips trailing newlines and
  # `${#var}` counts characters, so both under-report and the label says bytes.
  diag_bytes=$(wc -c < "$errfile" | tr -d ' ')
  rm -f "$errfile"
  transcript="$out$diag"

  if [[ $exit_code -ne 0 ]]; then
    # SKIP: the backend explicitly declared the feature unavailable in this
    # env (e.g. tickets requires LINEAR_API_KEY + LINEAR_TEAM_ID, only set
    # on prod). This is environment policy, not a CLI regression — accept
    # the gap and don't fail CI. The reason is preserved in the report so
    # an unexpected SKIP still stands out to a human reader.
    #
    # 🚨 MATCH THE SENTENCE, NEVER THE STATUS — and the phrase list itself lives
    # in `policy-refusal.sh`, sourced above, because `seed-sweep-fixtures.sh`
    # needs the identical answer. That file carries the reasoning in full: which
    # backend branch each sentence comes from, which branch is deliberately NOT
    # matched, and why every tempting broadening ("403 means skip", the
    # `FEATURE_NOT_ENABLED` wire code, "non-zero exit means skip") is silent and
    # permanent. `sweep-skips-only-a-declared-opt-out.test.ts` holds that line by
    # reading the pattern out of that file and asserting a plain 401 and a 500
    # still FAIL.
    if is_policy_refusal "$transcript"; then
      local reason
      reason=$(policy_refusal_reason "$transcript")

      # 🚨 THE PHRASE SAYS THE REFUSAL IS POLICY. IT DOES NOT SAY ANYONE DECIDED
      # TO ACCEPT IT. Those are different facts and only the second is a reason
      # to stay green: a leaf going dark costs exactly the coverage it used to
      # carry, and the skip count moving from 1 to 5 is the only trace it ever
      # left. So an undeclared skip FAILS, and the remedy is one line.
      if [[ "$expected_skip" != "true" ]]; then
        printf 'FAIL|%s|UNDECLARED SKIP: %s — the backend declares this unavailable by policy, which is not a CLI defect, but nobody has declared the coverage loss. Add this leaf to SWEEP_EXPECTED_SKIPS in src/command-universe.ts with the CAUSE, or restore the environment.\n' \
          "$path" "$reason"
        return
      fi

      # 🚨 `require_non_empty` IS READ HERE, AND THAT IS THE POINT OF THE BRANCH.
      # It used to be bound at the top of this function and read only in the
      # success path below, so a `safe-with-fixture` leaf that skipped bypassed
      # every non-emptiness assertion and reported an outcome indistinguishable
      # from a leaf that never had one. That is the exact vacuous green the
      # disposition exists to delete, one layer up from where it was guarded.
      if [[ "$require_non_empty" == "true" ]]; then
        printf 'SKIP|%s|%s — DECLARED. safe-with-fixture: its non-emptiness assertion did NOT run, so this leaf is dark rather than merely unasserted.\n' \
          "$path" "$reason"
      else
        printf 'SKIP|%s|%s — DECLARED\n' "$path" "$reason"
      fi
      return
    fi

    # ── PENDING-DEPLOY ──────────────────────────────────────────────────────
    #
    # AFTER the policy branch and never before it. A policy refusal is about an
    # ENVIRONMENT and wins: a leaf that is both opted out and undeployed is still
    # a declared skip, and nothing about that branch changes here.
    #
    # The matcher binds to the DECLARED path, so a 404 naming any other path —
    # including a typo of this one — falls through to the FAIL below. `exit 4` and
    # a bare `404` are deliberately not consulted; `route-not-deployed.sh` carries
    # the argument for each refused broadening.
    local err
    err=$(printf '%s' "$transcript" | tr '\n' ' ' | cut -c1-100)

    if [[ -n "$pending_route" ]]; then
      is_route_not_deployed "$transcript" "$pending_route"
      local route_verdict=$?
      case $route_verdict in
        0)
          printf 'PENDING|%s|%s — DECLARED pending-deploy: %s is absent from the deployed API\n' \
            "$path" "$pending_cause" "$pending_route"
          return
          ;;
        2)
          # The declaration itself is unusable, so nothing was measured. Never a
          # PENDING: an unvalidated path is spliced into a regular expression, and
          # a declaration reading `.*` would accept every 404 there is.
          # `--print-pending-deploy` refuses this before the sweep starts; this is
          # the second line of the same defence, and it must not read as a match.
          printf 'FAIL|%s|MALFORMED PENDING-DEPLOY DECLARATION: route %s is not a literal path, so nothing was measured about this leaf. Fix the entry in SWEEP_ROUTES_PENDING_DEPLOY in src/command-universe.ts. Its actual failure was exit=%d: %s\n' \
            "$path" "$pending_route" "$exit_code" "$err"
          return
          ;;
        *)
          # 🚨 DECLARED, AND FAILING FOR SOMETHING ELSE. This is the arm that
          # keeps the declaration from being an amnesty: a 401 from an expired CI
          # key and a 500 from an outage are the regressions they always were, and
          # swallowing either under a pending-deploy entry would be exactly the
          # blanket green `sweep-skips-only-a-declared-opt-out.test.ts` exists to
          # forbid one mechanism over. Named separately from the generic FAIL
          # below so the reader is told the declaration did NOT apply, rather than
          # being left to wonder whether it did.
          printf 'FAIL|%s|DECLARED pending-deploy (%s) BUT THIS IS A DIFFERENT FAILURE — the declaration does not cover it: exit=%d: %s\n' \
            "$path" "$pending_route" "$exit_code" "$err"
          return
          ;;
      esac
    fi

    printf 'FAIL|%s|exit=%d: %s\n' "$path" "$exit_code" "$err"
    return
  fi

  # One pass answers both questions: is it JSON, and does it carry a secret.
  # `scan-response.py` prints the KEY and the LENGTH of anything secret-shaped
  # and NEVER the value, because everything printed here reaches the CI log.
  local scan_out scan_code
  local scan_args=()
  [[ "$require_non_empty" == "true" ]] && scan_args+=(--require-non-empty)
  scan_out=$(printf '%s' "$out" | python3 "$SCRIPT_DIR/scan-response.py" ${scan_args[@]+"${scan_args[@]}"})
  scan_code=$?

  # 🚨 THE PREVIEW BRANCH IS THE DANGEROUS ONE, AND IT NEEDS A POSITIVE ANSWER
  # RATHER THAN A DEFAULT. A python traceback exits 1 exactly like "not JSON"
  # does, and a missing interpreter exits 127. A `*)` branch that previewed
  # `$out` on any unexpected status would print the first characters of a
  # response the scanner never managed to read — which is the leak this whole
  # gate exists to prevent, reintroduced by its own error path. Bugbot caught
  # that on the first version of this code.
  #
  # So: preview ONLY on exit 1 AND the scanner's own `NOT-JSON` marker. Anything
  # else is UNMEASURED, and UNMEASURED is a failure with nothing quoted.
  case $scan_code in
    0)
      # 🚨 THE SELF-RETIRING ARM, AND THE REASON THE WHOLE DISPOSITION IS WORTH
      # HAVING. The leaf answered with a clean document, so the route it was
      # declared absent for is LIVE — and the declaration is now excusing nothing
      # while standing ready to excuse whatever next takes that leaf's name.
      #
      # It FAILS where a stale SKIP declaration merely reports. The asymmetry is
      # argued in `SWEEP_ROUTES_PENDING_DEPLOY`'s own docblock: a policy opt-out
      # lifts by somebody else's hand at any time, so reddening on it reddens on
      # weather; an undeployed route in THIS branch's diff expires exactly once,
      # at a deploy the declaring lane performed.
      #
      # It sits in the `0)` arm rather than ahead of the scan on purpose. A leaf
      # that returns a SECRET-SHAPED response is the one finding that must outrank
      # this one, and every other non-PASS outcome here is already a FAIL — or a
      # WARN, which `--strict` counts — so the run is red either way and the stale
      # declaration surfaces on the next run once the sharper finding is fixed.
      if [[ -n "$pending_route" ]]; then
        printf 'FAIL|%s|STALE PENDING-DEPLOY DECLARATION: %s is live on the deployed API. Delete this entry from SWEEP_ROUTES_PENDING_DEPLOY in packages/cli/src/command-universe.ts.\n' \
          "$path" "$pending_route"
        return
      fi
      # A leaf that wrote to stderr on a clean read has SAID something — a
      # contract-drift warning, a retry notice, a deprecation announcement. None
      # of those is a failure, and all three are invisible now that the streams
      # are apart, so the VOLUME is reported to keep the signal. Never the text:
      # this line reaches a CI log and stderr is the one stream `scan-response.py`
      # structurally cannot clear, because it parses JSON before it walks.
      if [[ "$diag_bytes" -gt 0 ]]; then
        printf 'PASS|%s|json ok · %d bytes on stderr (diagnostics, not the document)\n' \
          "$path" "$diag_bytes"
      else
        printf 'PASS|%s|json ok\n' "$path"
      fi
      ;;
    2)
      # LEAK. The field and its length, never the payload, and never the preview
      # below. A FAIL in every mode, `--strict` included: a leaf that returns a
      # live credential is not a warning anyone gets to tune down.
      printf 'FAIL|%s|SECRET-SHAPED RESPONSE: %s — this leaf must not be swept; classify it away from `safe`\n' \
        "$path" "$(printf '%s' "$scan_out" | tr '\n' ' ' | cut -c1-120)"
      ;;
    4)
      # A `safe-with-fixture` leaf came back with no rows. The route works and
      # the read proves nothing about item shape, which is exactly the vacuous
      # green this disposition exists to refuse. Never demote the leaf to `safe`
      # to clear this — reseed.
      if [[ "$scan_out" == "EMPTY" ]]; then
        printf 'FAIL|%s|FIXTURE MISSING: declared safe-with-fixture and returned no rows. Reseed with packages/cli/scripts/seed-sweep-fixtures.sh; do NOT reclassify this leaf as `safe`.\n' "$path"
      else
        printf 'FAIL|%s|SECRET SCAN UNMEASURED: exit 4 without the EMPTY marker.\n' "$path"
      fi
      ;;
    1)
      if [[ "$scan_out" == "NOT-JSON" ]]; then
        local preview
        preview=$(printf '%s' "$out" | head -1 | cut -c1-60)
        printf 'WARN|%s|exit=0 but JSON parse failed: %s\n' "$path" "$preview"
      else
        printf 'FAIL|%s|SECRET SCAN UNMEASURED: exit 1 without the NOT-JSON marker, so the scanner died rather than read this response. Nothing is quoted here on purpose. Reproduce by piping this leaf'"'"'s output into packages/cli/scripts/scan-response.py by hand.\n' \
          "$path"
      fi
      ;;
    *)
      # Neither read nor cleared. Say the status and quote NOTHING — the output
      # this branch would have previewed is the output nothing has scanned.
      printf 'FAIL|%s|SECRET SCAN UNMEASURED: scanner exited %d. Nothing is quoted here on purpose; an unscanned response may carry a credential.\n' \
        "$path" "$scan_code"
      ;;
  esac
}

# Drift mode — delegated to the derivation, which reads the commander program
# tree directly. This used to be ~60 lines of recursive `nexus <path> --help`
# plus an awk scrape of the rendered text. Two things that cost were structural
# and neither is fixable in bash:
#
#   1. A HIDDEN command is absent from `--help` by definition, so the scraper
#      could not see one. The 18 hidden `upgrade` aliases were invisible to it,
#      and so is every hidden command anyone adds next.
#   2. It needed a BUILT dist/ and spawned one process per node. The tree is in
#      the source; reading a rendering of it was always the longer way round.
#
# It also exited with the drift COUNT, and a process exit code is one byte —
# 256 items of drift arrived as 0 and read as clean. The delegate exits 1 for
# any drift at all.
run_drift_check() {
  if [[ "$OUTPUT" == "json" ]]; then
    run_universe --check-drift --json
  else
    run_universe --check-drift
  fi
  exit $?
}

# Drift mode short-circuits BEFORE the preflight, not just before the auth
# check. The derivation reads the TypeScript sources, so a drift verdict needs
# no built dist/, no credentials and no network — and running the preflight
# first would make it FATAL out on a fresh checkout for reasons that say
# nothing about drift.
if [[ "$CHECK_DRIFT" == "true" ]]; then
  run_drift_check
fi

# ─────────────────────────────────────────────────────────────────────────────
# Preflight — binary, npm drift, auth
# ─────────────────────────────────────────────────────────────────────────────

BINARY_VERSION=$("${NEXUS_CMD[@]}" --version 2>/dev/null | head -1 | tr -d '\r\n')
if [[ -z "$BINARY_VERSION" ]]; then
  echo "FATAL: nexus binary unavailable. Install: pnpm add -g @agent-nexus/cli@latest" >&2
  exit 3
fi

NPM_LATEST=$(curl -fsSL https://registry.npmjs.org/@agent-nexus/cli/latest 2>/dev/null \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "?")

DRIFT_NOTE=""
if [[ "$BINARY_VERSION" != "$NPM_LATEST" && "$NPM_LATEST" != "?" ]]; then
  DRIFT_NOTE=" ← npm-latest=$NPM_LATEST (drift)"
fi

AUTH_OUT=$("${NEXUS_CMD[@]}" ${NEXUS_ARGS[@]+"${NEXUS_ARGS[@]}"} auth status 2>&1)
AUTH_EXIT=$?
if [[ $AUTH_EXIT -ne 0 ]]; then
  echo "FATAL: not authenticated. Output:" >&2
  echo "$AUTH_OUT" >&2
  exit 4
fi

# ─────────────────────────────────────────────────────────────────────────────
# Sweep
# ─────────────────────────────────────────────────────────────────────────────

START=$(date +%s)
RESULTS=()

# The leaves come from the derivation, so this list cannot fall behind the CLI.
# `readarray` under an explicit failure check rather than a pipeline: a pipeline
# would hand back the exit code of its last stage, so a derivation that failed
# would fill LEAVES with nothing and the sweep would report a clean 0-leaf pass.
# The derivation's OWN diagnosis is printed on refusal. Both streams, because
# neither is reliably the one carrying it: `pnpm exec` reports an unresolvable
# tool on STDOUT, which `$(...)` captures into the variable below — so the
# refusal used to discard the only sentence naming the cause and print two
# lines that say a list could not be derived without ever saying why. Nine
# consecutive red runs read identically to each other and to any future cause.
UNIVERSE_STDERR=$(mktemp)
SWEEP_TARGETS_RAW=$(run_universe --print-safe-leaves 2>"$UNIVERSE_STDERR")
UNIVERSE_EXIT=$?
if [[ $UNIVERSE_EXIT -ne 0 || -z "$SWEEP_TARGETS_RAW" ]]; then
  echo "FATAL: could not derive the safe-leaf list from src/command-universe.ts." >&2
  echo "Refusing to sweep an unknown list — an empty sweep passes." >&2
  echo "  command : pnpm exec tsx scripts/command-universe.ts --print-safe-leaves" >&2
  echo "  exit    : $UNIVERSE_EXIT" >&2
  echo "  --- its stdout ---" >&2
  printf '%s\n' "$SWEEP_TARGETS_RAW" >&2
  echo "  --- its stderr ---" >&2
  cat "$UNIVERSE_STDERR" >&2
  rm -f "$UNIVERSE_STDERR"
  exit 5
fi
rm -f "$UNIVERSE_STDERR"
SWEEP_TARGETS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && SWEEP_TARGETS+=("$line")
done <<< "$SWEEP_TARGETS_RAW"

# The fixture-backed subset, derived from the SAME table as the leaf list above.
# A second `run_universe` call rather than a parsed two-column format, because
# the alternative is a parser in bash. An empty answer is legitimate here — no
# leaf need be fixture-backed — so unlike the leaf list this one does not treat
# emptiness as a refusal. What it DOES refuse is a non-zero exit, because a
# derivation that failed would silently drop every non-emptiness assertion and
# the sweep would still report PASS.
FIXTURE_STDERR=$(mktemp)
FIXTURE_RAW=$(run_universe --print-fixture-leaves 2>"$FIXTURE_STDERR")
FIXTURE_EXIT=$?
if [[ $FIXTURE_EXIT -ne 0 ]]; then
  # BOTH streams, exactly like the safe-leaf FATAL above. `pnpm exec` names an
  # unresolvable tool on STDOUT, which `$(...)` traps in FIXTURE_RAW — so
  # printing stderr alone can omit the only line that explains the failure. The
  # refusal above already did this correctly and this one, written later, did
  # not: the same file disagreed with itself.
  echo "FATAL: could not derive the fixture-backed leaf list." >&2
  echo "Refusing to sweep without it — every non-emptiness assertion would be skipped" >&2
  echo "and the sweep would report PASS over exactly the leaves that need one." >&2
  echo "  command : pnpm exec tsx scripts/command-universe.ts --print-fixture-leaves" >&2
  echo "  exit    : $FIXTURE_EXIT" >&2
  echo "  --- its stdout ---" >&2
  printf '%s\n' "$FIXTURE_RAW" >&2
  echo "  --- its stderr ---" >&2
  cat "$FIXTURE_STDERR" >&2
  rm -f "$FIXTURE_STDERR"
  exit 6
fi
rm -f "$FIXTURE_STDERR"

# The skips this run is allowed to report, from the SAME table as the two lists
# above. Emptiness is legitimate — an environment answering every leaf declares
# nothing — so this is not treated as a refusal. A non-zero exit IS, for the
# reason the fixture list gives: a derivation that failed would silently make
# every skip undeclared, turning a visibility gate into a wall of red that says
# nothing about the environment.
SKIPS_STDERR=$(mktemp)
EXPECTED_SKIPS_RAW=$(run_universe --print-expected-skips 2>"$SKIPS_STDERR")
SKIPS_EXIT=$?
if [[ $SKIPS_EXIT -ne 0 ]]; then
  echo "FATAL: could not derive the expected-skip list." >&2
  echo "Refusing to sweep without it — every skip would read as undeclared and the" >&2
  echo "run would be red for a reason that says nothing about this environment." >&2
  echo "  command : pnpm exec tsx scripts/command-universe.ts --print-expected-skips" >&2
  echo "  exit    : $SKIPS_EXIT" >&2
  echo "  --- its stdout ---" >&2
  printf '%s\n' "$EXPECTED_SKIPS_RAW" >&2
  echo "  --- its stderr ---" >&2
  cat "$SKIPS_STDERR" >&2
  rm -f "$SKIPS_STDERR"
  exit 7
fi
rm -f "$SKIPS_STDERR"

# The absences this run accepts, from the SAME table as the three lists above,
# one TAB-separated `path<TAB>route<TAB>cause` line each. Emptiness is legitimate
# — a branch that introduces no route declares nothing. A non-zero exit is NOT,
# and the direction is worse than the skip list's: a failed derivation would make
# every pending-deploy declaration vanish, so a leaf whose route this branch has
# not deployed would go red as a CLI regression AND the stale arm that retires the
# declaration would never run. The producer also REFUSES a malformed declaration
# before a single leaf is executed, which is the other thing a non-zero means here.
PENDING_DEPLOY_STDERR=$(mktemp)
PENDING_DEPLOY_RAW=$(run_universe --print-pending-deploy 2>"$PENDING_DEPLOY_STDERR")
PENDING_DEPLOY_EXIT=$?
if [[ $PENDING_DEPLOY_EXIT -ne 0 ]]; then
  echo "FATAL: could not derive the pending-deploy list." >&2
  echo "Refusing to sweep without it — a route this branch has not deployed yet would" >&2
  echo "read as a CLI regression, and a malformed declaration would be spliced into a" >&2
  echo "regular expression instead of being refused." >&2
  echo "  command : pnpm exec tsx scripts/command-universe.ts --print-pending-deploy" >&2
  echo "  exit    : $PENDING_DEPLOY_EXIT" >&2
  echo "  --- its stdout ---" >&2
  printf '%s\n' "$PENDING_DEPLOY_RAW" >&2
  echo "  --- its stderr ---" >&2
  cat "$PENDING_DEPLOY_STDERR" >&2
  rm -f "$PENDING_DEPLOY_STDERR"
  exit 10
fi
rm -f "$PENDING_DEPLOY_STDERR"

is_fixture_backed() {
  local needle="$1" line
  while IFS= read -r line; do
    [[ "$line" == "$needle" ]] && return 0
  done <<< "$FIXTURE_RAW"
  return 1
}

is_expected_skip() {
  local needle="$1" line
  while IFS= read -r line; do
    [[ "$line" == "$needle" ]] && return 0
  done <<< "$EXPECTED_SKIPS_RAW"
  return 1
}

# The declared route and cause for one leaf, printed as `route<TAB>cause`, or
# nothing at all when the leaf carries no declaration.
#
# `IFS=$'\t' read -r p r c` and not a parser: the producer refuses a field
# carrying a TAB or a newline, so one `read` per line is exact. The third field
# takes the REST of the line by `read`'s own rule, so a cause containing spaces
# arrives whole.
pending_deploy_declaration() {
  local needle="$1" p r c
  while IFS=$'\t' read -r p r c; do
    [[ -z "$p" ]] && continue
    if [[ "$p" == "$needle" ]]; then
      printf '%s\t%s' "$r" "$c"
      return 0
    fi
  done <<< "$PENDING_DEPLOY_RAW"
  return 1
}

for leaf in "${SWEEP_TARGETS[@]}"; do
  expected=false
  is_expected_skip "$leaf" && expected=true
  # Two fields out of one lookup, split here rather than in `run_leaf`, for the
  # same reason the two arguments above are passed rather than re-derived: the
  # caller has already resolved membership, and a function that re-derives its own
  # inputs is a second place for the two to disagree.
  pending_route=""
  pending_cause=""
  pending_declaration=$(pending_deploy_declaration "$leaf")
  if [[ -n "$pending_declaration" ]]; then
    IFS=$'\t' read -r pending_route pending_cause <<< "$pending_declaration"
  fi
  if is_fixture_backed "$leaf"; then
    RESULTS+=("$(run_leaf "$leaf" true "$expected" "$pending_route" "$pending_cause")")
  else
    RESULTS+=("$(run_leaf "$leaf" false "$expected" "$pending_route" "$pending_cause")")
  fi
done

# A declaration that no longer describes this environment. Reported, never fatal:
# the environment recovering is GOOD NEWS, and a gate that reddens on good news
# gets its declarations deleted rather than its news read. Drift in the other
# direction — a declaration naming a leaf the sweep does not execute — is caught
# by `--check-drift` in `Tests: Vitest`, where a stale line is unambiguous.
#
# ⚠️ THE PENDING-DEPLOY EQUIVALENT IS NOT HERE AND MUST NOT BE ADDED — do not read
# its absence as an oversight. A stale SKIP is reported and fails nothing, so it
# can only be computed after every leaf has run, which is what this loop is for. A
# stale pending-deploy declaration IS a per-leaf FAILURE, so `run_leaf`'s `0)` arm
# owns it: the leaf that answered is the leaf that reports it, with the entry to
# delete named in its own note. A second loop here would be a second place for the
# same verdict to live.
STALE_SKIPS=()
while IFS= read -r declared; do
  [[ -z "$declared" ]] && continue
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r st pa _ <<< "$r"
    if [[ "$pa" == "$declared" && "$st" != "SKIP" ]]; then
      # `path|status`, not a prose string: the text and JSON paths both render
      # from this, so the two cannot describe different sets of stale leaves.
      STALE_SKIPS+=("$declared|$st")
    fi
  done
done <<< "$EXPECTED_SKIPS_RAW"

ELAPSED=$(( $(date +%s) - START ))

# ─────────────────────────────────────────────────────────────────────────────
# Aggregate counts
# ─────────────────────────────────────────────────────────────────────────────

PASS=0; FAIL=0; WARN=0; SKIP=0; PENDING=0
for r in "${RESULTS[@]}"; do
  case "${r%%|*}" in
    PASS) ((PASS++)) ;;
    FAIL) ((FAIL++)) ;;
    WARN) ((WARN++)) ;;
    SKIP) ((SKIP++)) ;;
    PENDING) ((PENDING++)) ;;
  esac
done

# The DENOMINATOR for the skip count. A bare "5 skip" is a numerator, and a
# numerator alone cannot distinguish the skips somebody declared from the ones
# that arrived on their own — which is precisely how four leaves went dark
# unnoticed. Every SKIP above is declared by construction (an undeclared one is
# a FAIL), so this is what says whether the DECLARATION still fits.
DECLARED_TOTAL=0
while IFS= read -r declared; do
  [[ -n "$declared" ]] && ((DECLARED_TOTAL++))
done <<< "$EXPECTED_SKIPS_RAW"

# The DENOMINATOR for the pending-deploy count, for the identical reason. A bare
# `1 pending deploy` cannot separate "the one absence this branch declared" from
# "one of three declarations fired and two silently stopped applying" — and the
# two that stopped applying are leaves whose routes have gone live, which is the
# event the whole disposition exists to catch. Every PENDING above is declared by
# construction (an undeclared one is a FAIL), so this is what says whether the
# DECLARATION still fits.
PENDING_DECLARED_TOTAL=0
while IFS= read -r declared; do
  [[ -n "$declared" ]] && ((PENDING_DECLARED_TOTAL++))
done <<< "$PENDING_DEPLOY_RAW"

# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────

if [[ "$OUTPUT" == "json" ]]; then
  # THE HEREDOC BELOW IS UNQUOTED, SO BASH EXPANDS ITS ENTIRE BODY FIRST.
  # `<<PYEOF`, not `<<'PYEOF'`: every `$` in the block is live before python
  # sees a byte of it, and `#` inside a heredoc is ordinary TEXT to bash, not
  # a comment. A python comment in there is expanded exactly like code.
  #
  # That is why this warning lives out here. Written inside the block, a
  # comment naming "${STALE_SKIPS[@]}" IS the bug it describes — the shipped
  # version of it aborted the whole `--json` path, and the literal above is
  # inert only because a bash comment is discarded before any expansion runs.
  #
  # What it warns about: STALE_SKIPS is EMPTY on a healthy sweep, so a bare
  # "${STALE_SKIPS[@]}" is an unbound-variable error under this file's
  # `set -u` on bash 3.2, the macOS default. The NORMAL case, not the rare
  # one. Any array expanded inside the block takes the ${ARR[@]+"${ARR[@]}"}
  # idiom documented at line 96.
  python3 <<PYEOF
import json, sys
results = []
for line in """$(printf '%s\n' "${RESULTS[@]}")""".strip().splitlines():
    status, path, note = line.split("|", 2)
    results.append({"status": status, "path": path, "note": note})
# The expansion below is guarded on purpose. The reason is the bash comment
# above this heredoc, which is the only place it can be spelled out without
# being expanded. Nothing in here may name an array expansion literally.
stale_skips = []
for line in """$(printf '%s\n' ${STALE_SKIPS[@]+"${STALE_SKIPS[@]}"})""".strip().splitlines():
    path, status = line.split("|", 1)
    stale_skips.append({"path": path, "answered": status})
payload = {
    "preflight": {
        "binary": "$BINARY_VERSION",
        "npm_latest": "$NPM_LATEST",
        "profile": "$PROFILE",
        "elapsed_seconds": $ELAPSED,
    },
    "counts": {
        "pass": $PASS,
        "fail": $FAIL,
        "warn": $WARN,
        "skip": $SKIP,
        "skip_declared": $DECLARED_TOTAL,
        "skip_stale": len(stale_skips),
        "pending_deploy": $PENDING,
        "pending_deploy_declared": $PENDING_DECLARED_TOTAL,
        "total": ${#RESULTS[@]},
    },
    "results": results,
    # Without this a machine reader sees skip < skip_declared and cannot tell
    # which declarations went stale, so the remedy names the file to edit.
    "stale_skips": stale_skips,
    "stale_skips_remedy": (
        "These leaves answer again and SWEEP_EXPECTED_SKIPS still excuses them. "
        "This fails nothing. Remove each path from SWEEP_EXPECTED_SKIPS in "
        "packages/cli/src/command-universe.ts so the next leaf to go dark is not "
        "excused by a declaration nobody re-read."
    ) if stale_skips else None,
}
print(json.dumps(payload, indent=2))
PYEOF
else
  echo "pinguin · binary=$BINARY_VERSION$DRIFT_NOTE · profile=${PROFILE:-default} · ${#RESULTS[@]} leaves · ${ELAPSED}s"
  echo ""
  printf '%-6s %-45s %s\n' "STATUS" "PATH" "NOTE"
  printf '%-6s %-45s %s\n' "------" "---------------------------------------------" "----"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r status path note <<< "$r"
    printf '%-6s %-45s %s\n' "$status" "$path" "$note"
  done
  echo ""
  if [[ ${#STALE_SKIPS[@]} -gt 0 ]]; then
    echo "STALE declarations (${#STALE_SKIPS[@]}) — SWEEP_EXPECTED_SKIPS names these and they no longer skip."
    echo "This is GOOD NEWS and fails nothing: the environment answers again. Remove the"
    echo "line from SWEEP_EXPECTED_SKIPS in src/command-universe.ts so the next leaf to go"
    echo "dark is not excused by a declaration nobody re-read."
    for s in "${STALE_SKIPS[@]}"; do
      IFS='|' read -r sp ss <<< "$s"
      echo "  · $sp answered $ss"
    done
    echo ""
  fi
  # 🚨 THE PENDING PAIR GOES AFTER `$FAIL fail` AND NOT BETWEEN THE EXISTING
  # FIELDS. `sweep-skips-only-a-declared-opt-out.test.ts` pins the run of
  # `$PASS pass · $SKIP/$DECLARED_TOTAL declared skip · $WARN warn · $FAIL fail`
  # as one contiguous string, and `sweep-promotes-warn-only-under-strict.test.ts`
  # keys on `· N warn · N fail ·`. Splitting that run would red both for a reason
  # that has nothing to do with either property.
  if [[ "$STRICT" == "true" ]]; then
    echo "Summary: $PASS pass · $SKIP/$DECLARED_TOTAL declared skip · $WARN warn · $FAIL fail · $PENDING/$PENDING_DECLARED_TOTAL pending deploy · ${ELAPSED}s · STRICT (warn counts as fail)"
  else
    echo "Summary: $PASS pass · $SKIP/$DECLARED_TOTAL declared skip · $WARN warn · $FAIL fail · $PENDING/$PENDING_DECLARED_TOTAL pending deploy · ${ELAPSED}s"
  fi
fi

# Exit policy:
# - default: FAIL count (real CLI/API regressions)
# - --strict (CI): FAIL + WARN count (JSON contract violations promoted)
# SKIP never contributes — environment-policy gaps are not regressions.
# PENDING never contributes either — a route this branch has not deployed yet is
# not a regression, and the day it IS deployed the leaf turns up in the `0)` arm
# as a FAIL naming the declaration to delete, so the acceptance cannot outlive
# its reason.
if [[ "$STRICT" == "true" ]]; then
  exit $(( FAIL + WARN ))
fi
exit "$FAIL"
