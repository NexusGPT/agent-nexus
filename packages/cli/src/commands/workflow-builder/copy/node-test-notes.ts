/**
 * Appended to `nexus workflow node test`: how a node test is judged, and which
 * outcomes are a refusal rather than a failure.
 */

export const NODE_TEST_NOTES = `
Examples:
  $ nexus workflow node test 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow node test 11111111-1111-4111-8111-111111111111 node-456 --body '{"input":{"human-node-id":{"rasp_note":"X"}}}'
  $ nexus workflow node test 11111111-1111-4111-8111-111111111111 node-456 --body '{"input":{"human":{"decision":"CANCEL"}}}'
  $ nexus workflow node test 11111111-1111-4111-8111-111111111111 node-456 --body '{"input":{"name":"Acme","website":"acme.com"}}'

Notes:
  THIS RUNS THE NODE FOR REAL against live systems — there is no dry mode.
  Mock data is nested under "input" and keyed by upstream node ID OR the input
  variable name (e.g. a customScript input's variableName). Each value becomes
  the mocked output of that upstream node. Unknown keys are rejected with 400.
  Without mocks, each {{upstream.field}} resolves from that upstream node's LAST
  TEST RESULT, so an untested upstream contributes nothing and a green result
  proves only that the node did not crash. Mocking is how you make the input
  deterministic.
  It WRITES BACK this node's testExecutionId and inferred outputFormat — that is
  what lets downstream nodes see this node's shape, and it overwrites the previous
  test's pointer. Mock data itself is never persisted.
  A FAILED RUN WRITES BACK NOTHING BUT testExecutionId. status is "FAILED" and the
  error envelope is in data; outputFormat and runOutput keep whatever the last
  SUCCESSFUL test left, so a broken run never becomes this node's contract.
  runOutput IS NOT KEPT ON MOST NODES, AND A null THERE IS NOT A FAILED TEST. The
  test result is stored only for an agentInputTrigger, a humanInput or a
  newsMonitorTrigger; on every other node type — customScript, aiTask, plugin —
  the snapshot is stripped before the graph is saved, so "workflow get" shows
  runOutput null right after a green test. testExecutionId is the pointer that
  survives, and it is what the execution verbs below resolve.
  A trigger node is refused with 400 NODE_IS_TRIGGER; use "nexus workflow test".
  The returned executionId is a per-node test id — a WorkflowExecutionNode key, not
  a WorkflowExecution one — and every "nexus execution" verb RESOLVES it: get, poll,
  diagnose, node-result, output, retry, cancel and export all accept it and answer
  for the parent execution, reporting that execution's own canonical id. It stays
  out of "nexus execution list" until you pass --include-test-runs, which is a
  separate filter on wasTestExecution.
  THE OUTPUT IS IN data ONLY FOR A SYNCHRONOUS NODE TYPE. plugin, firecrawl, exaai,
  sixtyfour, aiTask, cueNode, loop, and parallelai on any action but search or chat
  are dispatched to the background: they answer status PENDING with data null, and
  their result is read back later through the id above.
  status REPORTS THE OUTCOME — COMPLETED when the node ran, FAILED when it threw
  (the error envelope is then in data), PENDING when the run went to the background.
  THE EXIT CODE IS READ FROM data RATHER THAN status, so this CLI and the console's
  own test panel cannot disagree about the same run: a node that failed exits
  non-zero and its error is in data.errorDetails. A background run measured nothing,
  so it exits under the UNMEASURED category, which is neither a pass nor a failure.
  Identical to "nexus workflow test-node", which is the same endpoint.`;
