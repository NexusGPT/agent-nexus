/** Appended to `nexus execution diagnose`. */
export const EXECUTION_DIAGNOSE_HELP = `
Examples:
  $ nexus execution diagnose 11111111-1111-4111-8111-111111111111
  $ nexus execution diagnose 11111111-1111-4111-8111-111111111111 --verbose
  $ nexus execution diagnose 11111111-1111-4111-8111-111111111111 --json

Notes:
  START HERE when a run went wrong: one call gives the execution's status, its
  error, the per-node breakdown with each node's own error, and every loop
  iteration nested under its loop node.
  Per-node status uses the NODE enum — COMPLETED, RUNNING, PENDING, READY, SKIPPED,
  WAITING, ERROR. A failed node reads ERROR.
  SKIPPED is not a failure: it is a node a branch did not select. A whole branch
  reading SKIPPED means the condition chose elsewhere.
  --verbose adds each node's full input and output JSON, which is how you see what
  a reference actually resolved to. Without it you get a one-line output summary.

  🚨 outputSummary IS A TRUNCATED STRING, NOT THE OUTPUT. It is the node's output
  run through JSON.stringify and cut to the first 100 characters with a "…"
  appended — so a truncated one is 101 characters — and it is a STRING at every
  length. jq'ing into it (.outputSummary.someField) gets undefined, and once it
  has been cut it is no longer parseable JSON either. Treat it as a PREVIEW for
  reading, never as a field to script against.
  ANYTHING YOU MEAN TO PARSE NEEDS --verbose, which adds "input" and "output"
  carrying the real values. WITHOUT IT THOSE TWO KEYS ARE ABSENT, not null: a
  script testing "output === null" cannot tell "the node produced nothing" from
  "you did not pass --verbose". Test for the key.
  A BRANCHING NODE'S CHOICE LIVES IN THAT FULL OUTPUT — read
  .nodes[] | select(.nodeType=="…") | .output under --verbose. It is not on
  outputSummary in any readable form, and it is not a field of its own here.
  THE EXIT CODE CARRIES status. A COMPLETED run exits 0 and a FAILED one exits
  non-zero. A CANCELLED run, and one still PENDING or RUNNING, exit non-zero
  under the UNMEASURED category instead — a run somebody stopped did not fail,
  and a run still going has not been judged at all. "nexus --help" holds the
  code table.`;
