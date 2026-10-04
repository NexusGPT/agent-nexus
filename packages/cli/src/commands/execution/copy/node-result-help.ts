/** Appended to `nexus execution node-result`. */
export const EXECUTION_NODE_RESULT_HELP = `
Examples:
  $ nexus execution node-result 11111111-1111-4111-8111-111111111111 node-456
  $ nexus execution node-result 11111111-1111-4111-8111-111111111111 node-456 --json

Notes:
  <node-id> is the GRAPH node id (from "nexus workflow get"), not a per-execution
  id, and it is not a UUID by rule.
  status uses the NODE enum: COMPLETED, RUNNING, PENDING, READY, SKIPPED, WAITING
  or ERROR. A FAILED NODE READS "ERROR" — filtering for FAILED here finds nothing.
  A node inside a loop is found automatically: the lookup follows the run's loop
  sub-executions up to five levels deep, and returns the pass it finds first.
  input, output and error are the fields that carry data here. The input is what
  the node's references actually resolved to, which is where a null usually
  shows up.
  duration, startedAt AND completedAt ARE REAL NOW. They are derived from the
  node's own createdAt/finishedAt, the same arithmetic "execution diagnose" uses,
  so the two commands agree on a node's duration. They used to come back null on
  every healthy completed node — read off property names no column supplies — and
  this text used to describe that as normal.
  terminationReason IS THE ONLY THING THAT SEPARATES A CONVERGED doWhile FROM ONE
  THAT GAVE UP. On a doWhile node it reads condition_not_met (the conditions went
  false — it finished), max_iterations_reached (still true at the maxIterations
  cap, default 100 — it did NOT converge), condition_error (evaluating the
  conditions threw) or cancelled. The node is COMPLETED either way and output
  holds one entry per pass, so counting passes cannot tell the two apart: a loop
  capped at 3 that converged on its third pass reads exactly like one that gave
  up at 3. It is null on every other node type, and null on a doWhile that ran
  before the reason was recorded — never read null as "converged".
  THERE IS NO logs FIELD, AND LOOKING FOR ONE IS THE WASTED STEP THIS LINE SAVES.
  One was published until it was removed as unfillable — nothing in the platform
  stores a per-node log array. A node that captures console output (Browserbase,
  the sandbox nodes) folds those lines into its own result, so read them from
  output.
  startedAt IS THE ROW'S createdAt, so a node that is queued and not yet running
  still reports one; duration and completedAt stay null until it finishes.
  A per-node TEST also stamps its id onto the node itself, overwriting the previous
  one, so the last test wins as the node's linked result in the dashboard.`;
