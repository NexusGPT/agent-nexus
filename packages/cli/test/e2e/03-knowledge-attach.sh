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
# Note on assertions: the default assertion is the contract-level check (the
# agent replied at all). STRICT_RAG=1 promotes it to a retrieval-quality test
# and additionally requires the canary token "teal" in the assistant reply.
#
# That check spans two properties with very different owners, and the flow
# separates them rather than reporting them as one verdict:
#
#   * Is the canary RETRIEVABLE — did ingestion embed the document and does
#     semantic retrieval return it? This is ours, and it is deterministic.
#     Step 7 asserts it through `collection query`, with no model in the path.
#   * Did the model CHOOSE to call its collection tool? This is not ours. It
#     is a probabilistic property of a model reading a tool contract, and a
#     binary per-run gate over it is red often enough to train people to
#     ignore the check. Step 8 therefore asks up to STRICT_RAG_ATTEMPTS
#     times, in independent sessions, and only a run where EVERY attempt
#     declined to search is a failure.
#
# So a broken ingestion chain reds deterministically on the next run, and only
# model tool-choice variance is absorbed. See Step 8 for why the retry stops on
# the tool call rather than on the canary.
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
QUERY_JSON="${WORKDIR}/coll-query.json"
SESSION_JSON="${WORKDIR}/session.json"
SEND_JSON="${WORKDIR}/send.json"
SESSION_GET_JSON="${WORKDIR}/session-get.json"

register_dump "document create-text"        "${DOC_JSON}"
register_dump "collection create"           "${COLL_JSON}"
register_dump "collection attach-documents" "${ATTACH_JSON}"
register_dump "agent create"                "${AGENT_JSON}"
register_dump "agent-tool attach-collection" "${TOOL_JSON}"
register_dump "deployment create"           "${DEPLOYMENT_JSON}"
register_dump "collection query (retrieval)" "${QUERY_JSON}"
register_dump "emulator session create"     "${SESSION_JSON}"
register_dump "emulator send"               "${SEND_JSON}"
register_dump "emulator session get"        "${SESSION_GET_JSON}"

DOC_ID=""
COLL_ID=""
AGENT_ID=""
TOOL_ID=""
DEPLOYMENT_ID=""
SESSION_ID=""
# Every session this run opens, space-separated. STRICT_RAG can ask more than
# once (Step 8), and a cleanup that only knows the LAST id leaks the others.
SESSION_IDS=""

# WHY this flow failed, for the workflow's failure classifier
# (`scripts/cli-e2e-classify-failure.sh`). The workflow names the file on this
# step and on the classify step; a local run sets nothing and writes nothing.
# Removed first so a file can only describe THIS run.
#
# The classes, and which of them this flow declares probabilistic:
#   retrieval-timeout             Step 7. `collection query` has no model in its
#                                 path, so this is the ingestion/indexing chain.
#                                 NOT declared probabilistic.
#   no-reply                      Step 9. No AI reply inside the window.
#                                 NOT declared probabilistic.
#   tool-declined                 Step 9. Every attempt answered WITHOUT calling
#                                 the knowledge tool. The one class this flow
#                                 calls probabilistic — and ALSO exactly what a
#                                 broken tool contract produces, because Step 7
#                                 proves the collection answers, never that the
#                                 agent can reach it. Both readings stand.
#   canary-missing-after-tool-call  Step 9. The tool WAS called and the reply
#                                 still lacks the canary: retrieval or synthesis.
#                                 NOT declared probabilistic.
# Any other failure writes nothing, and the classifier reads the absence as
# "not declared".
FAILURE_CLASS_FILE="${CLI_E2E_FLOW_C_CLASS_FILE:-}"
if [[ -n "${FAILURE_CLASS_FILE}" ]]; then
  rm -f "${FAILURE_CLASS_FILE}"
fi

# record_failure_class <class> <attempts> <tool-calls>
record_failure_class() {
  [[ -n "${FAILURE_CLASS_FILE}" ]] || return 0
  jq -n --arg class "$1" --argjson attempts "$2" --argjson toolCalls "$3" \
    '{flow: "C", class: $class, attempts: $attempts, toolCalls: $toolCalls}' \
    > "${FAILURE_CLASS_FILE}"
}

cleanup() {
  local rc=$?
  set +e
  # Order: session (deployment delete only SetNulls the session FK,
  # leaving the session+chats behind) → deployment (releases agent ref)
  # → tool (releases agent ↔ collection link) → agent → collection
  # → document. Each failure goes to stderr; nothing in cleanup is
  # allowed to swallow the script's exit code.
  if [[ -n "${SESSION_IDS}" && -n "${DEPLOYMENT_ID}" ]]; then
    # Unquoted on purpose: SESSION_IDS is a space-separated list this script
    # built from UUIDs, and word-splitting it is what iterates it.
    # shellcheck disable=SC2086
    for session_id in ${SESSION_IDS}; do
      cleanup_delete "emulator session" "${session_id}" \
        emulator session delete "${DEPLOYMENT_ID}" "${session_id}"
    done
  fi
  if [[ -n "${DEPLOYMENT_ID}" ]]; then
    cleanup_delete "deployment" "${DEPLOYMENT_ID}" \
      deployment delete "${DEPLOYMENT_ID}"
  fi
  if [[ -n "${TOOL_ID}" && -n "${AGENT_ID}" ]]; then
    cleanup_delete "agent-tool" "${TOOL_ID}" \
      agent-tool delete "${AGENT_ID}" "${TOOL_ID}"
  fi
  if [[ -n "${AGENT_ID}" ]]; then
    cleanup_delete "agent" "${AGENT_ID}" \
      agent delete "${AGENT_ID}"
  fi
  if [[ -n "${COLL_ID}" ]]; then
    cleanup_delete "collection" "${COLL_ID}" \
      collection delete "${COLL_ID}"
  fi
  if [[ -n "${DOC_ID}" ]]; then
    cleanup_delete "document" "${DOC_ID}" \
      document delete "${DOC_ID}"
  fi
  if [[ ${rc} -ne 0 ]]; then
    dump_diagnostics
  fi
  rm -rf "${WORKDIR}"
  # The ledger can turn a PASSING flow red; it never rewrites a failure.
  # lib.sh's cleanup_verdict owns that rule.
  exit "$(cleanup_verdict "${rc}")"
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
# `--instructions` is the text that tells the agent WHEN to search this
# collection, and the CLI's own help for this command says outright that
# nothing supplies it for you. Omitted, both description candidates are empty,
# so the platform falls back to a generated sentence that states what the tool
# IS and never when to reach for it — and the model frequently answered
# "Please attach or share the fact sheet" without calling the tool at all.
#
# So this is a missing input being supplied, not an assertion being relaxed.
COLLECTION_INSTRUCTIONS="Contains the sky color fact sheet. Search it whenever the user asks about the fact sheet, or about what color the sky is."

# The instructions reach the model as the tool's description, so a canary token
# inside them would let the model answer "teal" straight from its tool contract
# with the retrieval chain dead — the STRICT_RAG assertion would pass having
# proved nothing. This refuses that at the source rather than trusting a comment
# nobody re-reads. `tr` rather than ${var,,}: bash 3.2 is still the system bash
# on macOS, where a developer runs this flow by hand.
if [[ "$(printf '%s' "${COLLECTION_INSTRUCTIONS}" | tr '[:upper:]' '[:lower:]')" == *teal* ]]; then
  echo "FAIL: the collection instructions contain the canary token 'teal'." >&2
  echo "  The model would be able to answer from the tool description alone," >&2
  echo "  making the STRICT_RAG assertion vacuous. Describe WHEN to search," >&2
  echo "  never what the answer is." >&2
  exit 1
fi

stamp "attaching collection to agent"
nx agent-tool attach-collection "${AGENT_ID}" \
  --collection-id "${COLL_ID}" \
  --label         "E2E Knowledge" \
  --instructions  "${COLLECTION_INSTRUCTIONS}" \
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
# Step 7 — confirm the canary is actually retrievable
# ---------------------------------------------------------------------------
# `collection query` is the SEMANTIC retrieval the agent's tool performs, asked
# directly with no model in the path — so it answers deterministically where
# the canary assertion cannot. (`collection search` is a document-NAME substring
# match and would not exercise the embedding pipeline at all.)
#
# This is the one property of this chain the platform owns, and asserting it
# separately is what makes a failure diagnosable: probe red means ingestion or
# indexing broke, probe green with the canary red means the model declined to
# search. The single canary assertion renders those two identically.
#
# It also removes a real race the flow ran with until now — ingestion is async,
# and nothing previously stopped the question being asked before the document
# was indexed. Placed last in the setup so every preceding call counts toward
# ingestion: measured against staging 2026-09-20, the canary became retrievable
# 13s after attach, well inside this 60s ceiling.
# Bounded by a DEADLINE, and the failure reports the elapsed time it measured
# rather than a budget. An iteration count cannot honestly name a duration here:
# each probe is a CLI process plus an HTTP round trip (~5s observed), so a
# "20 probes, sleep 3" loop that reads as 60s actually runs for ~160s, and the
# failure message would have understated its own wait by a factor of two and a
# half. Measured, not asserted.
stamp "confirming the canary is retrievable from the collection"
RETRIEVABLE=0
RETRIEVAL_BUDGET_SECONDS="${RETRIEVAL_BUDGET_SECONDS:-90}"
RETRIEVAL_STARTED=$(date +%s)
RETRIEVAL_PROBES=0
while :; do
  RETRIEVAL_PROBES=$(( RETRIEVAL_PROBES + 1 ))
  if nx collection query "${COLL_ID}" \
      --query "What color is the sky in the fact sheet?" \
      --json > "${QUERY_JSON}" 2>/dev/null \
    && jq -e '
      [ .results[]? | (.content // "") | tostring ]
      | join(" ") | ascii_downcase | contains("teal")
    ' "${QUERY_JSON}" >/dev/null 2>&1; then
    RETRIEVABLE=1
    break
  fi
  [[ $(( $(date +%s) - RETRIEVAL_STARTED )) -lt "${RETRIEVAL_BUDGET_SECONDS}" ]] || break
  sleep 3
done
RETRIEVAL_ELAPSED=$(( $(date +%s) - RETRIEVAL_STARTED ))

if [[ "${RETRIEVABLE}" -eq 1 ]]; then
  stamp "canary retrievable after ${RETRIEVAL_PROBES} probe(s), ${RETRIEVAL_ELAPSED}s"
else
  if [[ "${STRICT_RAG:-0}" == "1" ]]; then
    record_failure_class retrieval-timeout 0 0
    echo "FAIL: STRICT_RAG=1 but the canary never became retrievable from the" >&2
    echo "  collection — ${RETRIEVAL_PROBES} probe(s) over ${RETRIEVAL_ELAPSED}s." >&2
    echo "  This is the INGESTION/INDEXING chain, not a model decision:" >&2
    echo "  'collection query' asks retrieval directly, with no model in the" >&2
    echo "  path. Do not read this as a flaky assistant reply." >&2
    exit 1
  fi
  stamp "canary not retrievable in ${RETRIEVAL_ELAPSED}s (RAG-async, STRICT_RAG off) — continuing"
fi

# ---------------------------------------------------------------------------
# Step 8 — open emulator session(s) and ask the canary question
# ---------------------------------------------------------------------------
# Step 7 has already proved the canary is retrievable, so all that is left for
# this step to establish is that an agent holding the tool actually reaches it.
# Whether the model CHOOSES to call the tool is probabilistic and is not a
# property this repo owns, so under STRICT_RAG the ask is attempted up to
# STRICT_RAG_ATTEMPTS times. Each attempt opens a FRESH session: retrying inside
# a session the model has already answered conditions the next attempt on that
# answer, and the attempts are then not independent.
#
# The loop stops on the MECHANISM it exists to absorb — a TOOL message means
# the model invoked its tool rather than declining. It deliberately does NOT
# stop on the canary itself: a run where the tool WAS called and the reply still
# lacks the token is a genuine retrieval or synthesis failure, and retrying that
# would bury the one result worth reporting.
#
# Every attempt is stamped with its tool-call count, so a drift from "always
# attempt 1" toward "usually attempt 3" is readable in a PASSING log, before it
# ever becomes red.
#
# Default mode runs exactly one attempt — behaviour unchanged.
ASK_ATTEMPTS=1
if [[ "${STRICT_RAG:-0}" == "1" ]]; then
  ASK_ATTEMPTS="${STRICT_RAG_ATTEMPTS:-3}"
fi

ASSISTANT_COUNT=0
ASK_USED=0
TOOL_ROWS=0
for ((ask = 1; ask <= ASK_ATTEMPTS; ask++)); do
  ASK_USED="${ask}"
  stamp "ask ${ask}/${ASK_ATTEMPTS}: creating emulator session"
  nx emulator session create "${DEPLOYMENT_ID}" --json > "${SESSION_JSON}"
  SESSION_ID=$(jq -r '.id' "${SESSION_JSON}")
  [[ -n "${SESSION_ID}" && "${SESSION_ID}" != "null" ]] || {
    echo "FAIL: emulator session create did not return an id" >&2
    exit 1
  }
  SESSION_IDS="${SESSION_IDS}${SESSION_IDS:+ }${SESSION_ID}"

  stamp "asking about sky color"
  send_message "${DEPLOYMENT_ID}" "${SESSION_ID}" \
    "What color is the sky in the fact sheet?" "${SEND_JSON}" "${SESSION_GET_JSON}"

  stamp "waiting for AI reply (best-effort)"
  ASSISTANT_COUNT=0
  if wait_for_ai_reply "${DEPLOYMENT_ID}" "${SESSION_ID}" "${SESSION_GET_JSON}"; then
    ASSISTANT_COUNT=$(jq '[.messages[]? | select(.type == "AI")] | length' "${SESSION_GET_JSON}" 2>/dev/null || echo "0")
  else
    # Still capture the last session state for the dump in case STRICT_RAG=1
    # then fails and we need to see what the agent did with the question.
    nx emulator session get "${DEPLOYMENT_ID}" "${SESSION_ID}" --json > "${SESSION_GET_JSON}" || true
  fi

  # Empty or malformed reads as zero tool calls, which costs another attempt
  # and never a false early stop.
  TOOL_ROWS=$(jq '[.messages[]? | select(.type == "TOOL")] | length' "${SESSION_GET_JSON}" 2>/dev/null || true)
  [[ "${TOOL_ROWS}" =~ ^[0-9]+$ ]] || TOOL_ROWS=0
  stamp "ask ${ask}/${ASK_ATTEMPTS}: ${ASSISTANT_COUNT} AI message(s), ${TOOL_ROWS} tool call(s)"

  if [[ "${TOOL_ROWS}" -ge 1 ]]; then
    break
  fi
  if [[ "${ask}" -lt "${ASK_ATTEMPTS}" ]]; then
    stamp "the model replied without searching the collection — asking again in a fresh session"
  fi
done

# A tool call that arrived LATE is the early warning that the per-attempt
# decline rate has moved, and it is readable on a run that PASSES. It is raised
# as a workflow annotation rather than only a log line for a specific reason:
# the point of absorbing this variance is that nobody has to read a green log,
# so the drift has to surface where people already look. Without this, an
# intermediate regression — say 5% to 30% — would stay invisible until it
# finally produced a red, which at three attempts takes days. lib.sh raises its
# leak report through the same channel.
if [[ "${ASK_ATTEMPTS}" -gt 1 && "${ASK_USED}" -gt 1 && "${TOOL_ROWS}" -ge 1 ]]; then
  echo "::warning title=E2E tool-choice drift::Flow C needed ${ASK_USED} of ${ASK_ATTEMPTS} attempts before the agent searched its collection. Arriving on attempt 1 is the normal case. A run of these means the per-attempt decline rate has moved, and the thing to fix is the tool contract the model reads, never the attempt count." >&2
fi

# ---------------------------------------------------------------------------
# Step 9 — assert assistant replied (and optionally surfaced the canary)
# ---------------------------------------------------------------------------
# Default mode is structural — every prior step proved the contract chain
# (doc → collection → agent → tool binding → deployment → emulator) round
# trips correctly. The actual AI reply is product-level, so it stays
# best-effort. STRICT_RAG=1 promotes the reply check to mandatory AND requires
# the canary token, flipping this from a contract test to a retrieval-quality
# test (off by default for the same reason).
#
# This judges the LAST session Step 8 opened, which is the attempt that either
# searched the collection or was the final one to decline. Under STRICT_RAG it
# is reached only once retrieval has already been proved (Step 7), so a failure
# here is specifically "the agent did not surface what we know is retrievable".
if [[ "${STRICT_RAG:-0}" == "1" ]]; then
  if [[ "${ASSISTANT_COUNT}" -lt 1 ]]; then
    record_failure_class no-reply "${ASK_USED}" "${TOOL_ROWS}"
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
    if [[ "${TOOL_ROWS}" -ge 1 ]]; then
      record_failure_class canary-missing-after-tool-call "${ASK_USED}" "${TOOL_ROWS}"
    else
      record_failure_class tool-declined "${ASK_USED}" "${TOOL_ROWS}"
    fi
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
