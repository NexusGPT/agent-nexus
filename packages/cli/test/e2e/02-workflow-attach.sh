#!/usr/bin/env bash
# Flow B — "Workflow attach" (composition).
#
# Drives the cross-domain reference chain: create an agent, create a
# workflow, configure its trigger, validate, publish, then bind the
# workflow to the agent as a WORKFLOW-type tool. Verify the tool surfaces
# back via agent-tool list. Cleans up tool, workflow, agent.
#
# Tests: workflow CRUD, trigger replacement, validate/publish state
# machine, agent-tool ↔ workflow binding. A drift in any of these would
# break the customer's tool-using-agent flow.
#
# Local run:   NEXUS_PROFILE=e2e ./02-workflow-attach.sh
# CI run:      NEXUS_PROFILE=ci  ./02-workflow-attach.sh

set -euo pipefail

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_jq
assert_safe_target

AGENT_NAME=$(e2e_name "agent")
WORKFLOW_NAME=$(e2e_name "workflow")
TOOL_LABEL=$(e2e_name "tool")
WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/nexus_e2e_workflow.XXXXXX")
AGENT_JSON="${WORKDIR}/agent-create.json"
WORKFLOW_JSON="${WORKDIR}/workflow-create.json"
TRIGGER_JSON="${WORKDIR}/trigger.json"
WORKFLOW_GET_JSON="${WORKDIR}/workflow-get.json"
OUTPUT_NODE_JSON="${WORKDIR}/output-node-create.json"
EDGE_JSON="${WORKDIR}/edge-create.json"
VALIDATE_JSON="${WORKDIR}/validate.json"
PUBLISH_JSON="${WORKDIR}/publish.json"
TOOL_JSON="${WORKDIR}/tool-create.json"
TOOL_LIST_JSON="${WORKDIR}/tool-list.json"

register_dump "agent create"        "${AGENT_JSON}"
register_dump "workflow create"     "${WORKFLOW_JSON}"
register_dump "workflow trigger"    "${TRIGGER_JSON}"
register_dump "workflow get"        "${WORKFLOW_GET_JSON}"
register_dump "workflow node create" "${OUTPUT_NODE_JSON}"
register_dump "workflow edge create" "${EDGE_JSON}"
register_dump "workflow validate"   "${VALIDATE_JSON}"
register_dump "workflow publish"    "${PUBLISH_JSON}"
register_dump "agent-tool create"   "${TOOL_JSON}"
register_dump "agent-tool list"     "${TOOL_LIST_JSON}"

AGENT_ID=""
WORKFLOW_ID=""
TOOL_ID=""

cleanup() {
  local rc=$?
  set +e
  # Tool first — references agent + workflow. Workflow next — agents may
  # have a soft reference but the tool deletion already cleared the hard
  # link. Agent last. Failures surface to stderr so the reaper-prefix
  # system has a paper trail; the exit code is preserved.
  if [[ -n "${TOOL_ID}" && -n "${AGENT_ID}" ]]; then
    stamp "cleanup: deleting agent-tool ${TOOL_ID}"
    if ! nx agent-tool delete "${AGENT_ID}" "${TOOL_ID}" --json >/dev/null; then
      echo "cleanup: agent-tool delete failed for ${TOOL_ID}" >&2
    fi
  fi
  if [[ -n "${WORKFLOW_ID}" ]]; then
    stamp "cleanup: deleting workflow ${WORKFLOW_ID}"
    if ! nx workflow delete "${WORKFLOW_ID}" --json >/dev/null; then
      echo "cleanup: workflow delete failed for ${WORKFLOW_ID}" >&2
    fi
  fi
  if [[ -n "${AGENT_ID}" ]]; then
    stamp "cleanup: deleting agent ${AGENT_ID}"
    if ! nx agent delete "${AGENT_ID}" --json >/dev/null; then
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
# Step 1 — create agent (host for the eventual workflow-as-tool)
# ---------------------------------------------------------------------------
stamp "creating agent ${AGENT_NAME}"
nx agent create \
  --first-name "${E2E_PREFIX}" \
  --last-name  "${E2E_RUN_ID}" \
  --role       "E2E Workflow Host" \
  --json > "${AGENT_JSON}"

AGENT_ID=$(jq -r '.id' "${AGENT_JSON}")
[[ -n "${AGENT_ID}" && "${AGENT_ID}" != "null" ]] || {
  echo "FAIL: agent create did not return an id" >&2
  exit 1
}
stamp "agent id: ${AGENT_ID}"

# ---------------------------------------------------------------------------
# Step 2 — create workflow
# ---------------------------------------------------------------------------
stamp "creating workflow ${WORKFLOW_NAME}"
nx workflow create \
  --name        "${WORKFLOW_NAME}" \
  --description "E2E test workflow" \
  --json > "${WORKFLOW_JSON}"

WORKFLOW_ID=$(jq -r '.id' "${WORKFLOW_JSON}")
[[ -n "${WORKFLOW_ID}" && "${WORKFLOW_ID}" != "null" ]] || {
  echo "FAIL: workflow create did not return an id" >&2
  exit 1
}
stamp "workflow id: ${WORKFLOW_ID}"

# ---------------------------------------------------------------------------
# Step 3 — set trigger
# ---------------------------------------------------------------------------
# agentInputTrigger is the entry-point that the validator considers
# publishable for a tool-as-workflow. manualTrigger validates structurally
# (isValid=true) but the publish gate rejects it ("Workflow has no trigger
# nodes. It can only be run manually or from other workflows.").
stamp "setting trigger type"
nx workflow trigger "${WORKFLOW_ID}" --type agentInputTrigger --json > "${TRIGGER_JSON}"

# ---------------------------------------------------------------------------
# Step 3b — add a downstream outputNode and connect it
# ---------------------------------------------------------------------------
# Workflow validation rejects single-trigger graphs as DISCONNECTED_NODE —
# a publishable workflow needs at least one connected non-trigger node.
# outputNode is the leanest option: defaultData covers its required fields
# (outputType=previous), connectionRules require exactly 1 input edge.
stamp "fetching workflow to resolve trigger node id"
nx workflow get "${WORKFLOW_ID}" --json > "${WORKFLOW_GET_JSON}"
TRIGGER_NODE_ID=$(jq -r '.nodes[] | select(.type == "agentInputTrigger") | .id' "${WORKFLOW_GET_JSON}")
[[ -n "${TRIGGER_NODE_ID}" && "${TRIGGER_NODE_ID}" != "null" ]] || {
  echo "FAIL: could not find agentInputTrigger node id in workflow.nodes" >&2
  exit 1
}

stamp "creating outputNode"
nx workflow node create "${WORKFLOW_ID}" --type outputNode --json > "${OUTPUT_NODE_JSON}"
OUTPUT_NODE_ID=$(jq -r '.id' "${OUTPUT_NODE_JSON}")
[[ -n "${OUTPUT_NODE_ID}" && "${OUTPUT_NODE_ID}" != "null" ]] || {
  echo "FAIL: workflow node create did not return an id" >&2
  exit 1
}

stamp "connecting trigger → outputNode"
nx workflow edge create "${WORKFLOW_ID}" \
  --source "${TRIGGER_NODE_ID}" \
  --target "${OUTPUT_NODE_ID}" \
  --json > "${EDGE_JSON}"

# ---------------------------------------------------------------------------
# Step 4 — validate
# ---------------------------------------------------------------------------
stamp "validating workflow"
nx workflow validate "${WORKFLOW_ID}" --json > "${VALIDATE_JSON}"

IS_VALID=$(jq -r '.isValid // false' "${VALIDATE_JSON}")
READY_TO_PUBLISH=$(jq -r '.readyToPublish // false' "${VALIDATE_JSON}")
if [[ "${IS_VALID}" != "true" || "${READY_TO_PUBLISH}" != "true" ]]; then
  echo "FAIL: workflow not valid/publishable (isValid=${IS_VALID}, readyToPublish=${READY_TO_PUBLISH})" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 5 — publish
# ---------------------------------------------------------------------------
stamp "publishing workflow"
nx workflow publish "${WORKFLOW_ID}" --json > "${PUBLISH_JSON}"

# ---------------------------------------------------------------------------
# Step 6 — attach workflow to agent as a tool
# ---------------------------------------------------------------------------
stamp "attaching workflow as agent tool"
# --config flattens its JSON into the top-level body (Object.assign),
# which doesn't reach the API's nested `config` field. WORKFLOW tools
# also require agentInputSchema (a JSON-Schema describing the agent's
# invocation payload). --body delivers both correctly nested. --label
# and --type are Commander requiredOption()s and must be passed even
# when --body is used — mergeBodyWithFlags lets flag values win, which
# is fine since we set them to the same values.
nx agent-tool create "${AGENT_ID}" \
  --label "${TOOL_LABEL}" \
  --type  WORKFLOW \
  --body "$(jq -nc --arg wf "${WORKFLOW_ID}" '
    {
      config: { workflowId: $wf },
      agentInputSchema: { type: "object", properties: {} }
    }
  ')" \
  --json > "${TOOL_JSON}"

TOOL_ID=$(jq -r '.id' "${TOOL_JSON}")
[[ -n "${TOOL_ID}" && "${TOOL_ID}" != "null" ]] || {
  echo "FAIL: agent-tool create did not return an id" >&2
  exit 1
}
stamp "tool id: ${TOOL_ID}"

# ---------------------------------------------------------------------------
# Step 7 — assert the tool surfaces in agent-tool list with the right
#          workflow reference
# ---------------------------------------------------------------------------
stamp "verifying tool listed against agent"
nx agent-tool list "${AGENT_ID}" --json > "${TOOL_LIST_JSON}"

# Tolerate both `{ data: [...] }` (wrapped) and raw `[...]` shapes — the CLI
# normalises differently across list endpoints and we want this flow to
# survive a wrap/unwrap toggle without lying about a real regression.
# `.data // .` does not work because jq evaluates `.data` on an array as a
# type error (it never reaches the //). An explicit type check picks the
# right iterable cleanly.
#
# Assertion: the tool we just created (id + type=WORKFLOW) is in the list.
# We do NOT assert config.workflowId because the list endpoint strips the
# config blob to {} — the binding still works (agent invocation uses it),
# but the introspection contract differs. agent-tool get on the same id
# would expose the full saved record if a stricter check were needed.
MATCHED=$(jq --arg tid "${TOOL_ID}" '
  [
    (if type == "array" then .[] else (.data // [])[] end)
    | select(.id == $tid and .type == "WORKFLOW")
  ] | length
' "${TOOL_LIST_JSON}")

if [[ ! "${MATCHED}" =~ ^[0-9]+$ ]] || [[ "${MATCHED}" -lt 1 ]]; then
  echo "FAIL: tool ${TOOL_ID} (type=WORKFLOW) not found in agent-tool list (matched=${MATCHED})" >&2
  exit 1
fi

stamp "PASS: workflow attached as agent tool"
exit 0
