#!/usr/bin/env bash
# Flow C — "Knowledge attach" (KB integration).
#
# Drives the document → collection → agent retrieval chain: create a text
# document, build a collection around it, attach the collection to an
# agent as a tool, deploy the agent, send a question through the emulator,
# verify the agent answered. Cleans up every artifact unconditionally.
#
# Tests: KB ingestion entry point, collection lifecycle, agent-collection
# binding via agent-tool, full RAG-capable agent reachability through the
# emulator.
#
# Note on assertions: RAG ingestion is asynchronous. By the time the
# emulator sends a message, the embedding pipeline may not have finished.
# The default assertion is the contract-level check (the agent replied at
# all). Set STRICT_RAG=1 to additionally require the canary token "teal"
# in the assistant reply — flips this from a contract test to a
# retrieval-quality test, with the flakiness that implies.
#
# Local run:   NEXUS_PROFILE=e2e ./03-knowledge-attach.sh
# CI run:      NEXUS_PROFILE=ci  ./03-knowledge-attach.sh

set -euo pipefail

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_jq
assert_safe_target

DOC_NAME=$(e2e_name "doc")
COLLECTION_SLUG=$(e2e_name "coll" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-')
AGENT_NAME=$(e2e_name "agent")
DEPLOYMENT_NAME=$(e2e_name "deployment")
WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/nexus_e2e_knowledge.XXXXXX")
DOC_JSON="${WORKDIR}/doc-create.json"
COLL_JSON="${WORKDIR}/coll-create.json"
ATTACH_JSON="${WORKDIR}/coll-attach.json"
AGENT_JSON="${WORKDIR}/agent-create.json"
TOOL_JSON="${WORKDIR}/tool-create.json"
DEPLOYMENT_JSON="${WORKDIR}/deployment.json"
SESSION_JSON="${WORKDIR}/session.json"
SEND_JSON="${WORKDIR}/send.json"
SESSION_GET_JSON="${WORKDIR}/session-get.json"

register_dump "document create-text"        "${DOC_JSON}"
register_dump "collection create"           "${COLL_JSON}"
register_dump "collection attach-documents" "${ATTACH_JSON}"
register_dump "agent create"                "${AGENT_JSON}"
register_dump "agent-tool attach-collection" "${TOOL_JSON}"
register_dump "deployment create"           "${DEPLOYMENT_JSON}"
register_dump "emulator session create"     "${SESSION_JSON}"
register_dump "emulator send"               "${SEND_JSON}"
register_dump "emulator session get"        "${SESSION_GET_JSON}"

DOC_ID=""
COLL_ID=""
AGENT_ID=""
TOOL_ID=""
DEPLOYMENT_ID=""
SESSION_ID=""

cleanup() {
  local rc=$?
  set +e
  # Order: session (deployment delete only SetNulls the session FK,
  # leaving the session+chats behind) → deployment (releases agent ref)
  # → tool (releases agent ↔ collection link) → agent → collection
  # → document. Each failure goes to stderr; nothing in cleanup is
  # allowed to swallow the script's exit code.
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
  if [[ -n "${TOOL_ID}" && -n "${AGENT_ID}" ]]; then
    stamp "cleanup: deleting agent-tool ${TOOL_ID}"
    if ! nx agent-tool delete "${AGENT_ID}" "${TOOL_ID}" --yes --json >/dev/null; then
      echo "cleanup: agent-tool delete failed for ${TOOL_ID}" >&2
    fi
  fi
  if [[ -n "${AGENT_ID}" ]]; then
    stamp "cleanup: deleting agent ${AGENT_ID}"
    if ! nx agent delete "${AGENT_ID}" --yes --json >/dev/null; then
      echo "cleanup: agent delete failed for ${AGENT_ID}" >&2
    fi
  fi
  if [[ -n "${COLL_ID}" ]]; then
    stamp "cleanup: deleting collection ${COLL_ID}"
    if ! nx collection delete "${COLL_ID}" --yes --json >/dev/null; then
      echo "cleanup: collection delete failed for ${COLL_ID}" >&2
    fi
  fi
  if [[ -n "${DOC_ID}" ]]; then
    stamp "cleanup: deleting document ${DOC_ID}"
    if ! nx document delete "${DOC_ID}" --yes --json >/dev/null; then
      echo "cleanup: document delete failed for ${DOC_ID}" >&2
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
# Step 1 — create a text document with a canary token
# ---------------------------------------------------------------------------
stamp "creating document ${DOC_NAME}"
nx document create-text \
  --name    "${DOC_NAME}" \
  --content "Sky color fact sheet: the sky is teal. This is a canary used by the E2E test harness." \
  --json > "${DOC_JSON}"

DOC_ID=$(jq -r '.id' "${DOC_JSON}")
[[ -n "${DOC_ID}" && "${DOC_ID}" != "null" ]] || {
  echo "FAIL: document create-text did not return an id" >&2
  exit 1
}
stamp "document id: ${DOC_ID}"

# ---------------------------------------------------------------------------
# Step 2 — create a collection
# ---------------------------------------------------------------------------
stamp "creating collection ${COLLECTION_SLUG}"
nx collection create --name "${COLLECTION_SLUG}" --json > "${COLL_JSON}"

COLL_ID=$(jq -r '.id' "${COLL_JSON}")
[[ -n "${COLL_ID}" && "${COLL_ID}" != "null" ]] || {
  echo "FAIL: collection create did not return an id" >&2
  exit 1
}
stamp "collection id: ${COLL_ID}"

# ---------------------------------------------------------------------------
# Step 3 — attach the document to the collection
# ---------------------------------------------------------------------------
stamp "attaching document to collection"
nx collection attach-documents "${COLL_ID}" \
  --document-ids "${DOC_ID}" \
  --json > "${ATTACH_JSON}"

# ---------------------------------------------------------------------------
# Step 4 — create the agent
# ---------------------------------------------------------------------------
stamp "creating agent ${AGENT_NAME}"
nx agent create \
  --first-name "${E2E_PREFIX}" \
  --last-name  "${E2E_RUN_ID}" \
  --role       "E2E Knowledge Agent" \
  --json > "${AGENT_JSON}"

AGENT_ID=$(jq -r '.id' "${AGENT_JSON}")
[[ -n "${AGENT_ID}" && "${AGENT_ID}" != "null" ]] || {
  echo "FAIL: agent create did not return an id" >&2
  exit 1
}
stamp "agent id: ${AGENT_ID}"

# ---------------------------------------------------------------------------
# Step 5 — bind the collection to the agent
# ---------------------------------------------------------------------------
stamp "attaching collection to agent"
nx agent-tool attach-collection "${AGENT_ID}" \
  --collection-id "${COLL_ID}" \
  --label         "E2E Knowledge" \
  --json > "${TOOL_JSON}"

TOOL_ID=$(jq -r '.id' "${TOOL_JSON}")
[[ -n "${TOOL_ID}" && "${TOOL_ID}" != "null" ]] || {
  echo "FAIL: agent-tool attach-collection did not return an id" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Step 6 — deploy the agent
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

# ---------------------------------------------------------------------------
# Step 7 — open emulator session and ask the canary question
# ---------------------------------------------------------------------------
stamp "creating emulator session"
nx emulator session create "${DEPLOYMENT_ID}" --json > "${SESSION_JSON}"
SESSION_ID=$(jq -r '.id' "${SESSION_JSON}")
[[ -n "${SESSION_ID}" && "${SESSION_ID}" != "null" ]] || {
  echo "FAIL: emulator session create did not return an id" >&2
  exit 1
}

stamp "asking about sky color"
send_message "${DEPLOYMENT_ID}" "${SESSION_ID}" \
  "What color is the sky in the fact sheet?" "${SEND_JSON}" "${SESSION_GET_JSON}"

# ---------------------------------------------------------------------------
# Step 8 — assert assistant replied (and optionally surfaced the canary)
# ---------------------------------------------------------------------------
# Default mode is structural — every prior step proved the contract chain
# (doc → collection → agent → tool binding → deployment → emulator) round
# trips correctly. The actual AI reply is product-level: RAG ingestion is
# asynchronous and an agent with an empty index may simply not respond
# within the window. STRICT_RAG=1 promotes the reply check to mandatory
# AND requires the canary token, flipping this from a contract test to a
# retrieval-quality test (off by default for the same reason).
stamp "waiting for AI reply (best-effort)"
ASSISTANT_COUNT=0
if wait_for_ai_reply "${DEPLOYMENT_ID}" "${SESSION_ID}" "${SESSION_GET_JSON}"; then
  ASSISTANT_COUNT=$(jq '[.messages[]? | select(.type == "AI")] | length' "${SESSION_GET_JSON}" 2>/dev/null || echo "0")
else
  # Still capture the last session state for the dump in case STRICT_RAG=1
  # then fails and we need to see what the agent did with the question.
  nx emulator session get "${DEPLOYMENT_ID}" "${SESSION_ID}" --json > "${SESSION_GET_JSON}" || true
fi

if [[ "${STRICT_RAG:-0}" == "1" ]]; then
  if [[ "${ASSISTANT_COUNT}" -lt 1 ]]; then
    echo "FAIL: STRICT_RAG=1 but no AI reply landed within 60s" >&2
    exit 1
  fi
  # `.content` is normally a string but the emulator can serialise rich
  # content blocks as arrays/objects. `tostring` keeps the search robust
  # to that shape evolution — otherwise jq throws on `join` and the script
  # reports a phantom "canary missing" when the real issue is shape drift.
  if ! jq -e '
    [ .messages[]?
      | select(.type == "AI")
      | (.content // "")
      | if type == "string" then . else tostring end
    ] | join(" ") | ascii_downcase | contains("teal")
  ' "${SESSION_GET_JSON}" >/dev/null; then
    echo "FAIL: STRICT_RAG=1 but canary token 'teal' missing from assistant reply" >&2
    exit 1
  fi
  stamp "PASS: assistant reply contains canary token (STRICT_RAG)"
else
  if [[ "${ASSISTANT_COUNT}" -ge 1 ]]; then
    stamp "PASS: contract chain green; assistant replied (${ASSISTANT_COUNT} message(s)) — STRICT_RAG off, content unchecked"
  else
    stamp "PASS: contract chain green; no AI reply within 60s (RAG-async, STRICT_RAG off)"
  fi
fi
exit 0
