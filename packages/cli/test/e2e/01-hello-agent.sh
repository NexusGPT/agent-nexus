#!/usr/bin/env bash
# Flow A — "Hello agent" (read-write minimum).
#
# Drives the core customer chain: create an agent, deploy it, open an
# emulator session, send a message, verify a response, clean up.
#
# Tests: agent persistence, deployment lifecycle, session creation,
# emulator dispatch, response shape. Failure here means the public API
# contract for the agent→deployment→message chain has drifted.
#
# Local run:   ./01-hello-agent.sh
# CI run:      same — picks NEXUS_API_KEY from env / nexus config.

set -euo pipefail

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_jq
assert_safe_target

AGENT_NAME=$(e2e_name "agent")
DEPLOYMENT_NAME=$(e2e_name "deployment")
WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/nexus_e2e_hello.XXXXXX")
AGENT_JSON="${WORKDIR}/agent-create.json"
AGENT_GET_JSON="${WORKDIR}/agent-get.json"
DEPLOYMENT_JSON="${WORKDIR}/deployment.json"
SESSION_JSON="${WORKDIR}/session.json"
SEND_JSON="${WORKDIR}/send.json"
SESSION_GET_JSON="${WORKDIR}/session-get.json"

register_dump "agent create"           "${AGENT_JSON}"
register_dump "agent get"              "${AGENT_GET_JSON}"
register_dump "deployment create"      "${DEPLOYMENT_JSON}"
register_dump "emulator session create" "${SESSION_JSON}"
register_dump "emulator send"          "${SEND_JSON}"
register_dump "emulator session get"   "${SESSION_GET_JSON}"

AGENT_ID=""
DEPLOYMENT_ID=""
SESSION_ID=""

cleanup() {
  local rc=$?
  set +e
  # Session first — `deployment delete` SetNulls the session's deployment
  # FK rather than cascading, so without an explicit delete the session
  # (and its chats/messages) survive each run and pile up in the shared org.
  # Then deployment (backend enforces an FK from deployment to agent so the
  # reverse order leaves orphan deployments on cleanup paths where agent
  # delete succeeds but deployment delete failed earlier). Then agent.
  # Cleanup failures are surfaced to stderr so the nexus_e2e_* reaper has a
  # paper trail; the script's exit code is preserved.
  if [[ -n "${SESSION_ID}" && -n "${DEPLOYMENT_ID}" ]]; then
    stamp "cleanup: deleting emulator session ${SESSION_ID}"
    if ! nx emulator session delete "${DEPLOYMENT_ID}" "${SESSION_ID}" --yes --json >/dev/null; then
      echo "cleanup: emulator session delete failed for ${SESSION_ID}" >&2
    fi
  fi
  if [[ -n "${DEPLOYMENT_ID}" ]]; then
    stamp "cleanup: deleting deployment ${DEPLOYMENT_ID}"
    if ! nx deployment delete "${DEPLOYMENT_ID}" --yes --json >/dev/null; then
      echo "cleanup: deployment delete failed for ${DEPLOYMENT_ID}" >&2
    fi
  fi
  if [[ -n "${AGENT_ID}" ]]; then
    stamp "cleanup: deleting agent ${AGENT_ID}"
    if ! nx agent delete "${AGENT_ID}" --yes --json >/dev/null; then
      echo "cleanup: agent delete failed for ${AGENT_ID}" >&2
    fi
  fi
  if [[ ${rc} -ne 0 ]]; then
    dump_diagnostics
  fi
  rm -rf "${WORKDIR}"
  exit "${rc}"
}
arm_traps cleanup

# ---------------------------------------------------------------------------
# Step 1 — create agent
# ---------------------------------------------------------------------------
stamp "creating agent ${AGENT_NAME}"
nx agent create \
  --first-name "${E2E_PREFIX}" \
  --last-name  "${E2E_RUN_ID}" \
  --role       "E2E Test Agent" \
  --json > "${AGENT_JSON}"

AGENT_ID=$(jq -r '.id' "${AGENT_JSON}")
[[ -n "${AGENT_ID}" && "${AGENT_ID}" != "null" ]] || {
  echo "FAIL: agent create did not return an id" >&2
  exit 1
}
stamp "agent id: ${AGENT_ID}"

# ---------------------------------------------------------------------------
# Step 2 — verify agent get shape
# ---------------------------------------------------------------------------
stamp "verifying agent get"
nx agent get "${AGENT_ID}" --json > "${AGENT_GET_JSON}"
[[ "$(jq -r '.id' "${AGENT_GET_JSON}")" == "${AGENT_ID}" ]] || {
  echo "FAIL: agent get returned wrong id" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Step 3 — create deployment for the agent
# ---------------------------------------------------------------------------
stamp "creating deployment ${DEPLOYMENT_NAME}"
nx deployment create \
  --name     "${DEPLOYMENT_NAME}" \
  --type     API \
  --agent-id "${AGENT_ID}" \
  --json > "${DEPLOYMENT_JSON}"

DEPLOYMENT_ID=$(jq -r '.id' "${DEPLOYMENT_JSON}")
[[ -n "${DEPLOYMENT_ID}" && "${DEPLOYMENT_ID}" != "null" ]] || {
  echo "FAIL: deployment create did not return an id" >&2
  exit 1
}
stamp "deployment id: ${DEPLOYMENT_ID}"

# ---------------------------------------------------------------------------
# Step 4 — create emulator session
# ---------------------------------------------------------------------------
stamp "creating emulator session"
nx emulator session create "${DEPLOYMENT_ID}" --json > "${SESSION_JSON}"
SESSION_ID=$(jq -r '.id' "${SESSION_JSON}")
[[ -n "${SESSION_ID}" && "${SESSION_ID}" != "null" ]] || {
  echo "FAIL: emulator session create did not return an id" >&2
  exit 1
}
stamp "session id: ${SESSION_ID}"

# ---------------------------------------------------------------------------
# Step 5 — send a message
# ---------------------------------------------------------------------------
stamp "sending message"
send_message "${DEPLOYMENT_ID}" "${SESSION_ID}" "hello" "${SEND_JSON}" "${SESSION_GET_JSON}"

# ---------------------------------------------------------------------------
# Step 6 — assert the agent replied
# ---------------------------------------------------------------------------
stamp "waiting for AI reply"
if ! wait_for_ai_reply "${DEPLOYMENT_ID}" "${SESSION_ID}" "${SESSION_GET_JSON}"; then
  echo "FAIL: no AI reply within 60s" >&2
  exit 1
fi

ASSISTANT_COUNT=$(jq '[.messages[]? | select(.type == "AI")] | length' "${SESSION_GET_JSON}" 2>/dev/null || echo "0")

stamp "PASS: agent replied (${ASSISTANT_COUNT} assistant message(s))"
exit 0
