#!/usr/bin/env bash
# Shared helpers for CLI E2E flow scripts.
#
# Sourced by 01-hello-agent.sh and future flow scripts. Each flow MUST set
# `set -euo pipefail` itself — sourcing here would silently mask a flow that
# forgets to declare safety. We only export helpers and configuration.
#
# Provides: name prefix, unique run id, jq check, nexus binary resolution,
# the `nx` wrapper, the failure-dump registry, and a prod-guard.

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Every artifact created by an E2E flow MUST start with this prefix so the
# shared CI org stays auditable and a future reaper can vacuum stale data.
E2E_PREFIX="${E2E_PREFIX:-nexus_e2e}"

# Unique suffix per run. Three components so two runs starting in the same
# second on a containerised runner (where $$ can repeat across PID namespaces)
# don't collide: epoch, PID, and 4 hex bytes of /dev/urandom.
if [[ -z "${E2E_RUN_ID:-}" ]]; then
  E2E_RUN_ID="$(date +%s)-$$-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
fi

# Resolve the nexus binary into an array so paths with spaces survive.
# Local dev uses the dist build; CI installs @agent-nexus/cli globally.
if [[ -n "${NEXUS_BIN:-}" ]]; then
  # Caller passed a single command; split on whitespace into the array.
  read -r -a NEXUS_BIN_CMD <<< "${NEXUS_BIN}"
elif command -v nexus >/dev/null 2>&1; then
  NEXUS_BIN_CMD=(nexus)
elif [[ -f "${BASH_SOURCE%/*}/../../dist/index.js" ]]; then
  # -f, not -x: `pnpm build` lands a normal Node module without the
  # executable bit; we invoke it via `node`, so file existence is the
  # right precondition.
  NEXUS_BIN_CMD=(node "${BASH_SOURCE%/*}/../../dist/index.js")
else
  echo "ERROR: nexus binary not found. Install @agent-nexus/cli or run pnpm --filter @agent-nexus/cli build" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq required" >&2
    exit 2
  fi
}

stamp() {
  printf "[%s] %s\n" "$(date +%H:%M:%S)" "$*"
}

# Generate an E2E-prefixed name for a given resource kind.
e2e_name() {
  local kind="$1"
  echo "${E2E_PREFIX}_${kind}_${E2E_RUN_ID}"
}

# Dump diagnostic context when an assertion fails. Each flow calls
# `register_dump <label> <file>` to register a file the harness should cat
# on failure — the trap then dumps everything for the cron alert.
DUMP_FILES=()
register_dump() {
  DUMP_FILES+=("$1=$2")
}

dump_diagnostics() {
  if [[ ${#DUMP_FILES[@]} -eq 0 ]]; then
    return
  fi
  echo "" >&2
  echo "=== DIAGNOSTIC DUMP ===" >&2
  for entry in "${DUMP_FILES[@]}"; do
    local label="${entry%%=*}"
    local file="${entry#*=}"
    echo "--- ${label} (${file}) ---" >&2
    if [[ -f "${file}" ]]; then
      cat "${file}" >&2
    else
      echo "(missing)" >&2
    fi
  done
}

# Refuse to proceed against an unknown target. There are three layers:
#  1. NEXUS_E2E_ALLOW_DEFAULT=1 — local opt-out, run against the active CLI
#     profile with a loud warning. Caller owns the data.
#  2. NEXUS_PROFILE must resolve to an explicit base URL — either via
#     NEXUS_BASE_URL env var (CI sets it at the job level) or via the
#     profile's persisted baseUrl from `auth login --base-url …`.
#  3. The resolved URL must not match the prod host. NEXUS_E2E_ALLOW_PROD=1
#     overrides for genuinely-intended prod runs.
PROD_API_HOST="api.nexusgpt.io"

assert_safe_target() {
  if [[ "${NEXUS_E2E_ALLOW_DEFAULT:-}" == "1" ]]; then
    echo "WARNING: running against the active CLI profile (NEXUS_E2E_ALLOW_DEFAULT=1)." >&2
    echo "WARNING: artifacts will be created under whatever org that profile authenticates as." >&2
    return
  fi
  if [[ -z "${NEXUS_PROFILE:-}" ]]; then
    cat >&2 <<'EOF'
ERROR: refusing to run without an explicit target.
  Set NEXUS_PROFILE=<profile> to scope every call to a known profile (CI uses 'ci'),
  or NEXUS_E2E_ALLOW_DEFAULT=1 to accept the active profile (your choice, your data).
EOF
    exit 2
  fi

  # Resolve the effective target URL. NEXUS_BASE_URL wins (env override),
  # otherwise read the profile's persisted baseUrl from `auth list`.
  local target_url=""
  if [[ -n "${NEXUS_BASE_URL:-}" ]]; then
    target_url="${NEXUS_BASE_URL}"
  else
    target_url=$("${NEXUS_BIN_CMD[@]}" auth list --json 2>/dev/null \
      | jq -r --arg p "${NEXUS_PROFILE}" '.[] | select(.name == $p) | .baseUrl // ""' \
      || echo "")
  fi

  if [[ -z "${target_url}" ]]; then
    cat >&2 <<EOF
ERROR: profile '${NEXUS_PROFILE}' has no base URL persisted.
  Set NEXUS_BASE_URL or re-login with one:
    nexus auth login --profile ${NEXUS_PROFILE} --base-url <url> --api-key …
EOF
    exit 2
  fi

  if [[ "${target_url}" == *"${PROD_API_HOST}"* && "${NEXUS_E2E_ALLOW_PROD:-}" != "1" ]]; then
    cat >&2 <<EOF
ERROR: profile '${NEXUS_PROFILE}' resolves to a prod-looking URL (${target_url}).
  Refusing to create nexus_e2e_* artifacts in production.
  Override with NEXUS_E2E_ALLOW_PROD=1 only if this is genuinely intended.
EOF
    exit 2
  fi

  stamp "target: ${target_url} (profile=${NEXUS_PROFILE})"
}

# Wrapper so each flow can write `nx agent create ...` instead of repeating
# the binary path. If NEXUS_PROFILE is set (CI sets this to `ci`), every call
# is routed through that profile so the local default is never touched
# accidentally during a run.
nx() {
  if [[ -n "${NEXUS_PROFILE:-}" ]]; then
    "${NEXUS_BIN_CMD[@]}" --profile "${NEXUS_PROFILE}" "$@"
  else
    "${NEXUS_BIN_CMD[@]}" "$@"
  fi
}

# Arm a cleanup function on EXIT and on the cancellation signals bash does
# not fire EXIT for by default. Each signal handler maps to its conventional
# 128+N exit code and then exit-s, which triggers the EXIT trap exactly once.
# Without this, GitHub Actions' `cancel-in-progress` SIGTERM mid-flow leaks
# every staging artifact the flow has created.
arm_traps() {
  local cleanup_fn="$1"
  trap "${cleanup_fn}" EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  trap 'exit 129' HUP
}

# Send one message, surviving a transient edge failure WITHOUT ever double-sending.
#
# `emulator send` is a POST: it writes the HUMAN message and starts an agent
# turn. A 502 from the edge proxy cannot tell us whether the server applied it
# before the connection died, so a blind retry can post the message twice and
# bill two model calls. That is why the SDK deliberately does not retry a POST,
# and why this cannot simply loop.
#
# So it asks instead. On a failed send it reads the session back: this session
# was created seconds earlier and nothing else writes to it, so "a HUMAN message
# exists" means the send landed and only its RESPONSE was lost. Only a session
# still holding zero HUMAN messages is re-sent to.
#
# A PROBE THAT CANNOT ANSWER IS NOT A SESSION WITH ZERO MESSAGES, and conflating
# the two reintroduces the double-send this helper exists to prevent — in exactly
# the window it exists for, since whatever 502s the send can 502 the probe. So the
# probe is polled until it ANSWERS, and an unread session refuses to re-send and
# fails instead. A duplicated user message costs more than a red CI job.
#
# Why this is needed at all: measured over every `CLI: E2E flows` failure since
# 2026-08-05, the 502-class ones land 0.7–2.6 minutes AFTER a staging
# `porter-deploy` reports success — never during the rollout — and always on this
# call, which is the longest in the flow (10–13 s against 1–3 s for every other).
# The assertions the flow makes are unchanged; only a lost RESPONSE is absorbed.
send_message() {
  local deployment_id="$1" session_id="$2" text="$3" out_file="$4" probe_file="$5"
  local max_attempts="${6:-3}"
  local humans=""

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if nx emulator send "${deployment_id}" "${session_id}" \
      --text "${text}" --json > "${out_file}"; then
      return 0
    fi

    stamp "send attempt ${attempt} failed; asking the session whether it landed"

    # Empty means UNKNOWN, never zero. Only a numeric answer authorises anything.
    humans=""
    for ((probe = 1; probe <= 5; probe++)); do
      if nx emulator session get "${deployment_id}" "${session_id}" --json > "${probe_file}" 2>/dev/null; then
        humans=$(jq '[.messages[]? | select(.type == "HUMAN")] | length' "${probe_file}" 2>/dev/null || true)
        if [[ "${humans}" =~ ^[0-9]+$ ]]; then
          break
        fi
        humans=""
      fi
      stamp "the session did not answer (probe ${probe}); retrying the READ, not the send"
      sleep 2
    done

    if [[ -z "${humans}" ]]; then
      echo "FAIL: emulator send failed and the session could not be read." >&2
      echo "  Refusing to re-send: the message may already have landed, and a" >&2
      echo "  duplicate would post twice and bill a second model call." >&2
      return 1
    fi

    if [[ "${humans}" -ge 1 ]]; then
      stamp "the message DID land (${humans} HUMAN message(s)) — only the response was lost"
      return 0
    fi

    if [[ "${attempt}" -lt "${max_attempts}" ]]; then
      stamp "the session confirms nothing landed; re-sending in $((attempt * 2))s"
      sleep "$((attempt * 2))"
    fi
  done

  echo "FAIL: emulator send did not land after ${max_attempts} attempt(s)" >&2
  return 1
}

# Poll `emulator session get` until an AI message lands or we run out of
# attempts. `emulator send` returns synchronously after writing the HUMAN
# message; the AI reply is generated async and lands later, so any flow
# that fetches the session immediately after sending will race the reply.
# 60s ceiling matches the longest LLM round-trip we've observed in
# staging — comfortably above the median, well below the 15min job timeout.
wait_for_ai_reply() {
  local deployment_id="$1"
  local session_id="$2"
  local out_file="$3"
  local max_attempts="${4:-30}"   # 30 * 2s = 60s
  local count=""
  for ((attempt = 0; attempt < max_attempts; attempt++)); do
    if ! nx emulator session get "${deployment_id}" "${session_id}" --json > "${out_file}"; then
      sleep 2
      continue
    fi
    # `|| true` so a jq parse failure (e.g. transiently malformed JSON
    # from a server-side hiccup) does not abort the polling loop under
    # the caller's set -e. The numeric guard below keeps malformed reads
    # in the "not yet" branch and lets the timeout decide.
    count=$(jq '[.messages[]? | select(.type == "AI")] | length' "${out_file}" 2>/dev/null || true)
    if [[ "${count}" =~ ^[0-9]+$ ]] && [[ "${count}" -ge 1 ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}
