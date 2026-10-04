/** Appended to `nexus workflow test-node`. */
export const WORKFLOW_TEST_NODE_HELP = `
Examples:
  $ nexus workflow test-node 11111111-1111-4111-8111-111111111111 node-456
  $ nexus workflow test-node 11111111-1111-4111-8111-111111111111 node-456 --input '{"upstream-node-id":{"rows":[]}}'
  $ nexus workflow test-node 11111111-1111-4111-8111-111111111111 node-456 --body input.json
  $ nexus workflow test-node 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  THE SAME ENDPOINT AS "nexus workflow node test", which documents the mock shape
  in full. This spelling adds --input as sugar; both send {input: …}.
  --input IS A MAP OF UPSTREAM OUTPUTS, not this node's arguments. Each key is an
  upstream node id (or an input variable's name) and its value becomes that node's
  mocked output, which is how {{upstream.field}} resolves. An unknown key is a 400.
  WITHOUT MOCKS, UPSTREAM REFERENCES RESOLVE FROM EACH UPSTREAM NODE'S LAST TEST
  RESULT. An upstream that has never run exposes nothing, so the node under test
  runs on empty values and a green result proves only that it did not crash.
  A trigger node is refused here with 400 NODE_IS_TRIGGER — use "workflow test".
  IT WRITES BACK the node's testExecutionId and inferred outputFormat, which is
  what lets downstream nodes see this node's shape — and which overwrites the
  previous test's pointer.
  runOutput IS ONLY PERSISTED FOR agentInputTrigger, humanInput AND
  newsMonitorTrigger. On every other type the snapshot is stripped before the
  graph is saved, so "workflow get" shows runOutput null right after a green
  test. That null is not a failed test.
  A FAILED RUN WRITES BACK NOTHING BUT testExecutionId. status is "FAILED" and the
  error envelope is in data; outputFormat and runOutput keep whatever the last
  SUCCESSFUL test left, so a broken run never becomes this node's contract.
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
  "nexus --help" holds the code table.`;
