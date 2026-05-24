#!/usr/bin/env bash
# sweep.sh — methodical read-only sweep of `nexus` CLI subcommands.
#
# Two roles:
#   1. Underlay for the /pinguin skill — produces structured results so the
#      agent loop can focus on interpretation.
#   2. CI gate (.github/workflows/cli-sweep.yml) — runs against staging on
#      every PR touching packages/cli/**. The --strict flag promotes WARN
#      to FAIL so the JSON contract is treated as load-bearing.
#
# Usage:
#   ./sweep.sh                       # text output, default profile
#   ./sweep.sh --profile prod        # explicit profile
#   ./sweep.sh --json                # machine-readable output (for /pinguin)
#   ./sweep.sh --strict              # WARN counts as FAIL (used by CI)
#   ./sweep.sh --check-drift         # walk `nexus --help`, diff against the
#                                    # inventory; reports new untested leaves
#                                    # and stale entries. Standalone — does
#                                    # not run the sweep.
#
# Exit code:
#   default        — number of FAILs (0 = clean)
#   --strict       — number of FAILs + WARNs (any non-PASS fails CI)
#   --check-drift  — number of (untested + stale) entries (0 = no drift)

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

# ─────────────────────────────────────────────────────────────────────────────
# Inventory — read-only leaves that take no required positional and have --json
# Add a new line when a new read-only command lands in the CLI.
# ─────────────────────────────────────────────────────────────────────────────

LEAVES=(
  "auth list"
  "auth whoami"
  "analytics overview"
  "analytics feedback"
  "channel connection list"
  "channel whatsapp-sender list"
  "channel whatsapp-template list"
  "claude-code list"
  "collection list"
  "conversation list"
  "credential list"
  "custom-model list"
  "deployment list"
  "deployment folder list"
  "document list"
  "eval formats"
  "eval judges"
  "external-tool list"
  "folder list"
  "model list"
  "phone-number list"
  "prompt-assistant list-threads"
  "task list"
  "template list"
  "ticket list"
  "tracing traces"
  "tracing generations"
  "tracing models"
  "tracing summary"
  "tracing timeline"
  "tracing cost-breakdown"
  "tracing export-bulk"
  "workflow list"
  "workflow node-types"
  "workflow platform-listener-events"
)

# Drift mode: paths that exist in `nexus --help` but the sweep cannot
# auto-invoke. Mutations (create/update/delete/etc) and reads that need
# a required positional or option (e.g. `agent get <id>`). They count as
# "covered" for drift purposes, so the detector verifies they're still
# registered — but they're never tested by run_leaf().
#
# Grouped by domain. New mutations or positional-bearing reads land in
# this list to keep --check-drift clean. If you add a command that takes
# no required input and emits --json, add it to LEAVES instead.
REGISTRATION_ONLY=(
  # access-card
  "access-card available-actions"
  "access-card create"
  "access-card delete"
  "access-card get"
  "access-card list"
  "access-card update"
  # agent
  "agent list"
  "agent create"
  "agent delete"
  "agent duplicate"
  "agent get"
  "agent update"
  # agent-tool
  "agent-tool attach-collection"
  "agent-tool create"
  "agent-tool delete"
  "agent-tool get"
  "agent-tool list"
  "agent-tool update"
  # analytics
  "analytics export"
  # channel
  "channel connect-waba"
  "channel connection create"
  "channel setup"
  "channel whatsapp-sender create"
  "channel whatsapp-sender get"
  "channel whatsapp-template approvals"
  "channel whatsapp-template create"
  "channel whatsapp-template delete"
  "channel whatsapp-template get"
  "channel whatsapp-template submit-approval"
  "channel whatsapp-template test-send"
  # collection
  "collection attach-documents"
  "collection create"
  "collection delete"
  "collection documents"
  "collection get"
  "collection remove-document"
  "collection search"
  "collection stats"
  "collection update"
  # conversation
  "conversation assign"
  "conversation close"
  "conversation comment"
  "conversation comments"
  "conversation get"
  "conversation messages"
  "conversation search"
  "conversation send-message"
  "conversation send-template"
  "conversation update-status"
  "conversation update-topic"
  # credential
  "credential delete"
  "credential get"
  "credential update"
  # cue prompt-editor
  "cue prompt-editor accept"
  "cue prompt-editor conversations delete"
  "cue prompt-editor conversations get"
  "cue prompt-editor conversations list"
  "cue prompt-editor reject"
  # custom-model
  "custom-model create"
  "custom-model delete"
  "custom-model get"
  "custom-model update"
  # deployment
  "deployment create"
  "deployment delete"
  "deployment duplicate"
  "deployment embed-config"
  "deployment embed-config-update"
  "deployment get"
  "deployment stats"
  "deployment update"
  "deployment folder assign"
  "deployment folder create"
  "deployment folder delete"
  "deployment folder update"
  "deployment template attach"
  "deployment template detach"
  "deployment template list"
  "deployment template settings"
  "deployment template update"
  # document
  "document add-website"
  "document create-text"
  "document delete"
  "document get"
  "document preview"
  "document upload"
  # emulator
  "emulator scenario delete"
  "emulator scenario get"
  "emulator scenario list"
  "emulator scenario replay"
  "emulator scenario save"
  "emulator session create"
  "emulator session delete"
  "emulator session get"
  "emulator session list"
  # eval
  "eval dataset add"
  "eval dataset list"
  "eval execute"
  "eval judge"
  "eval results"
  "eval session create"
  "eval session delete"
  "eval session get"
  "eval session list"
  # execution
  "execution diagnose"
  "execution export"
  "execution get"
  "execution list"
  "execution node-result"
  "execution output"
  "execution poll"
  "execution retry"
  # external-tool
  "external-tool create"
  "external-tool execute"
  "external-tool get"
  "external-tool test"
  "external-tool test-auth"
  "external-tool update-auth"
  "external-tool upload-icon"
  # folder
  "folder assign"
  "folder create"
  "folder delete"
  "folder update"
  # phone-number
  "phone-number buy"
  "phone-number get"
  "phone-number release"
  "phone-number search"
  # prompt-assistant
  "prompt-assistant delete-thread"
  "prompt-assistant get-thread"
  # task
  "task create"
  "task execute"
  "task get"
  # template
  "template create"
  "template generate"
  "template get"
  "template upload"
  # ticket
  "ticket attach"
  "ticket comment"
  "ticket comments"
  "ticket create"
  "ticket get"
  "ticket update"
  # tool
  "tool credentials"
  "tool get"
  "tool search"
  # tracing
  "tracing delete"
  "tracing export"
  "tracing generation"
  "tracing trace"
  # version
  "version create"
  "version delete"
  "version get"
  "version list"
  "version publish"
  "version restore"
  "version update"
  # workflow
  "workflow batch"
  "workflow create"
  "workflow delete"
  "workflow duplicate"
  "workflow get"
  "workflow layout"
  "workflow overview"
  "workflow publish"
  "workflow test"
  "workflow test-node"
  "workflow trigger"
  "workflow unpublish"
  "workflow update"
  "workflow validate"
  "workflow node-type"
  "workflow branch create"
  "workflow branch delete"
  "workflow branch list"
  "workflow branch update"
  "workflow edge create"
  "workflow edge delete"
  "workflow node create"
  "workflow node delete"
  "workflow node get"
  "workflow node output-format"
  "workflow node reload-props"
  "workflow node test"
  "workflow node update"
  "workflow node variables"
)

# Drift mode: paths in `nexus --help` that are NEVER testable in a sweep —
# arbitrary surfaces, interactive flows, or self-modifying actions. These
# never count as "untested" drift.
EXCLUDED=(
  # arbitrary or self-modifying
  "api"                        # accepts any HTTP verb + path — unbounded
  "docs"                       # interactive topic browser
  "docs search"                # interactive
  "upgrade"                    # self-update; would reinstall mid-sweep
  "claude-code install"        # writes files into ~/.claude
  # auth mutations / preflight
  "auth login"                 # writes credentials
  "auth logout"                # deletes credentials
  "auth switch"                # flips active profile
  "auth pin"                   # writes .nexusrc
  "auth unpin"                 # deletes .nexusrc
  "auth status"                # already used in preflight
  # interactive / browser-opening
  "emulator send"              # sends a message into an emulator (mutation)
  "cue prompt-editor chat"     # interactive REPL
  "prompt-assistant chat"      # interactive REPL
  "external-tool initiate-oauth"  # opens browser OAuth flow
  "tool connect"               # opens browser OAuth flow
)

# ─────────────────────────────────────────────────────────────────────────────
# Run one leaf — capture exit code + JSON-parse result
# Emits a single result line: STATUS|PATH|NOTE
# ─────────────────────────────────────────────────────────────────────────────

run_leaf() {
  local path="$1"
  local out exit_code parse_ok=0

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

  if printf '%s' "$out" | python3 -c "import json,sys;json.load(sys.stdin)" 2>/dev/null; then
    parse_ok=1
  fi

  if [[ $parse_ok -eq 1 ]]; then
    printf 'PASS|%s|json ok\n' "$path"
  else
    local preview
    preview=$(printf '%s' "$out" | head -1 | cut -c1-60)
    printf 'WARN|%s|exit=0 but JSON parse failed: %s\n' "$path" "$preview"
  fi
}

# Drift-mode walker: recursively traverses `nexus <path> --help`, prints
# every leaf path (space-joined, e.g. "auth whoami") to stdout one per line.
# A leaf is a command whose --help has no "Commands:" section. Groups are
# recursed into; `help` and `[command]` artifacts are filtered out; alias
# variants like `list|ls` are normalised to the canonical (first) name.
walk_help() {
  local path="$1"
  local help_out children

  # shellcheck disable=SC2086
  help_out=$("${NEXUS_CMD[@]}" ${NEXUS_ARGS[@]+"${NEXUS_ARGS[@]}"} $path --help 2>&1)

  children=$(printf '%s' "$help_out" | awk '
    /^Commands:/{p=1; next}
    /^[A-Z]/{p=0}
    p && /^  [a-z]/{print $1}
  ' | sed 's/|.*//' | grep -v '^help$' | grep -v '^\[')

  if [[ -z "$children" ]]; then
    [[ -n "$path" ]] && printf '%s\n' "$path"
    return
  fi

  while IFS= read -r child; do
    walk_help "${path:+$path }$child"
  done <<< "$children"
}

# Drift-mode entry point: walks --help, diffs against the covered arrays,
# reports + exits. Standalone — does NOT run the per-leaf sweep. The
# (untested + stale) count is the exit code so CI / shell scripts can
# gate on it cleanly.
run_drift_check() {
  local observed covered untested stale
  observed=$(walk_help "" | sort -u)
  covered=$(printf '%s\n' \
    "${LEAVES[@]}" \
    "${REGISTRATION_ONLY[@]}" \
    "${EXCLUDED[@]}" | sort -u)

  # Two-way set diff. comm needs sorted input on both sides; process
  # substitution feeds it without spilling to tempfiles.
  untested=$(comm -23 <(printf '%s\n' "$observed") <(printf '%s\n' "$covered"))
  stale=$(comm -23 \
    <(printf '%s\n' "${LEAVES[@]}" "${REGISTRATION_ONLY[@]}" | sort -u) \
    <(printf '%s\n' "$observed"))

  # grep -c counts lines; the || keeps `set -e`-style failures from
  # blowing up the script when the diff is empty.
  local untested_count stale_count
  untested_count=$([[ -n "$untested" ]] && printf '%s\n' "$untested" | grep -c . || echo 0)
  stale_count=$([[ -n "$stale" ]] && printf '%s\n' "$stale" | grep -c . || echo 0)

  if [[ "$OUTPUT" == "json" ]]; then
    UNTESTED_BLOCK="$untested" STALE_BLOCK="$stale" \
    BIN="$BINARY_VERSION" NPM_LATEST_V="$NPM_LATEST" PROF="$PROFILE" \
    python3 <<'PYEOF'
import json, os
def lines(name):
    s = os.environ.get(name, "").strip()
    return s.splitlines() if s else []
print(json.dumps({
    "preflight": {
        "binary": os.environ["BIN"],
        "npm_latest": os.environ["NPM_LATEST_V"],
        "profile": os.environ["PROF"],
    },
    "drift": {
        "untested": lines("UNTESTED_BLOCK"),
        "stale": lines("STALE_BLOCK"),
    },
}, indent=2))
PYEOF
  else
    echo "pinguin drift · binary=$BINARY_VERSION$DRIFT_NOTE · profile=${PROFILE:-default}"
    echo ""
    if [[ "$untested_count" -gt 0 ]]; then
      echo "Untested ($untested_count) — observed in CLI --help but missing from LEAVES / REGISTRATION_ONLY / EXCLUDED:"
      printf '%s\n' "$untested" | sed 's/^/  · /'
      echo ""
    fi
    if [[ "$stale_count" -gt 0 ]]; then
      echo "Stale ($stale_count) — in LEAVES / REGISTRATION_ONLY but not in CLI --help:"
      printf '%s\n' "$stale" | sed 's/^/  · /'
      echo ""
    fi
    if [[ "$untested_count" -eq 0 && "$stale_count" -eq 0 ]]; then
      echo "Clean — no drift detected."
    else
      echo "Drift: $untested_count untested + $stale_count stale = $((untested_count + stale_count)) total"
    fi
  fi

  exit $((untested_count + stale_count))
}

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

# Drift mode short-circuits BEFORE the auth check — `nexus <path> --help`
# does not require authentication, and a drift report should still be
# obtainable on a fresh machine. Standalone per the M255 scope: drift and
# sweep are separate runs.
if [[ "$CHECK_DRIFT" == "true" ]]; then
  run_drift_check
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

for leaf in "${LEAVES[@]}"; do
  RESULTS+=("$(run_leaf "$leaf")")
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
