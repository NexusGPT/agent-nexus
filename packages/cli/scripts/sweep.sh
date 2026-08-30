#!/usr/bin/env bash
# sweep.sh — methodical read-only sweep of `nexus` CLI subcommands.
#
# Two roles:
#   1. Underlay for the /pinguin skill — produces structured results so the
#      agent loop can focus on interpretation.
#   2. CI gate — the `cli-sweep` job of .github/workflows/pr-checks.yml, whose
#      `CLI: Sweep` context is REQUIRED on staging and main. Runs against
#      staging on every PR affecting the CLI's package graph. The --strict flag
#      promotes WARN to FAIL so the JSON contract is treated as load-bearing.
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
  local out exit_code
  # Second argument, not a global lookup: the caller already knows, and a
  # function that re-derives its own inputs is a second place for the two lists
  # to disagree.
  local require_non_empty="${2:-false}"

  # shellcheck disable=SC2086
  out=$("${NEXUS_CMD[@]}" ${NEXUS_ARGS[@]+"${NEXUS_ARGS[@]}"} $path --json 2>&1)
  exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    # SKIP: the backend explicitly declared the feature unavailable in this
    # env (e.g. tickets requires LINEAR_API_KEY + LINEAR_TEAM_ID, only set
    # on prod). This is environment policy, not a CLI regression — accept
    # the gap and don't fail CI. The reason is preserved in the report so
    # an unexpected SKIP still stands out to a human reader.
    #
    # Matched phrases come straight from current backend error messages.
    # Add new ones as new features adopt the same "feature not configured"
    # convention; resist the urge to broaden into generic 5xx matching —
    # that would mask real outages.
    if printf '%s' "$out" | grep -qE '"message":[[:space:]]*"[^"]*(not configured|feature is disabled|feature not enabled)'; then
      local reason
      reason=$(printf '%s' "$out" \
        | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('error',{}).get('message',''))" 2>/dev/null \
        | tr -d '\n' | cut -c1-80)
      printf 'SKIP|%s|%s\n' "$path" "$reason"
      return
    fi
    local err
    err=$(printf '%s' "$out" | tr '\n' ' ' | cut -c1-100)
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
    0) printf 'PASS|%s|json ok\n' "$path" ;;
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

is_fixture_backed() {
  local needle="$1" line
  while IFS= read -r line; do
    [[ "$line" == "$needle" ]] && return 0
  done <<< "$FIXTURE_RAW"
  return 1
}

for leaf in "${SWEEP_TARGETS[@]}"; do
  if is_fixture_backed "$leaf"; then
    RESULTS+=("$(run_leaf "$leaf" true)")
  else
    RESULTS+=("$(run_leaf "$leaf")")
  fi
done

ELAPSED=$(( $(date +%s) - START ))

# ─────────────────────────────────────────────────────────────────────────────
# Aggregate counts
# ─────────────────────────────────────────────────────────────────────────────

PASS=0; FAIL=0; WARN=0; SKIP=0
for r in "${RESULTS[@]}"; do
  case "${r%%|*}" in
    PASS) ((PASS++)) ;;
    FAIL) ((FAIL++)) ;;
    WARN) ((WARN++)) ;;
    SKIP) ((SKIP++)) ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────

if [[ "$OUTPUT" == "json" ]]; then
  python3 <<PYEOF
import json, sys
results = []
for line in """$(printf '%s\n' "${RESULTS[@]}")""".strip().splitlines():
    status, path, note = line.split("|", 2)
    results.append({"status": status, "path": path, "note": note})
payload = {
    "preflight": {
        "binary": "$BINARY_VERSION",
        "npm_latest": "$NPM_LATEST",
        "profile": "$PROFILE",
        "elapsed_seconds": $ELAPSED,
    },
    "counts": {"pass": $PASS, "fail": $FAIL, "warn": $WARN, "skip": $SKIP, "total": ${#RESULTS[@]}},
    "results": results,
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
  if [[ "$STRICT" == "true" ]]; then
    echo "Summary: $PASS pass · $SKIP skip · $WARN warn · $FAIL fail · ${ELAPSED}s · STRICT (warn counts as fail)"
  else
    echo "Summary: $PASS pass · $SKIP skip · $WARN warn · $FAIL fail · ${ELAPSED}s"
  fi
fi

# Exit policy:
# - default: FAIL count (real CLI/API regressions)
# - --strict (CI): FAIL + WARN count (JSON contract violations promoted)
# SKIP never contributes — environment-policy gaps are not regressions.
if [[ "$STRICT" == "true" ]]; then
  exit $(( FAIL + WARN ))
fi
exit "$FAIL"
