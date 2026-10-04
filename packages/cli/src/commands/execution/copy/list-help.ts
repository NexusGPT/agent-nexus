/** Appended to `nexus execution list`. */
export const EXECUTION_LIST_HELP = `
Lists real end-to-end runs only. A loop / do-while node records each pass of its
body as its own execution, and the builder records single-node test runs the same
way; both are hidden unless you ask for them, so a row count means what it looks
like it means. The TYPE column names each row (run / loop_iteration / node_test).

Examples:
  $ nexus execution list
  $ nexus execution list --workflow-id 22222222-2222-4222-8222-222222222222 --limit 5
  $ nexus execution list --status COMPLETED --json
  $ nexus execution list --workflow-id 22222222-2222-4222-8222-222222222222 --include-child-executions
  $ nexus execution list --workflow-id 22222222-2222-4222-8222-222222222222 --include-test-runs --limit 1 --json

Notes:
  --status, --sort-by and --order are validated LOCALLY against the contract, so
  a bad value is refused here and never becomes a 400.
  --page defaults to 1 and --limit to 20; above 100 is a 400, not a clamp.
  --sort-by defaults to createdAt and --order to desc, so the default is newest
  first. Both defaults live on the SERVER: unset, the CLI sends neither.
  --include-test-runs IS ONLY NEEDED TO LIST A NODE TEST, never to address one.
  The id a node test returns resolves directly through "execution get", "poll",
  "diagnose", "node-result" and the rest, so recovering an id by reading the most
  recent row is not something you have to do — and never something to do while
  anything else is running, since two concurrent tests on one workflow make the
  newest row a coin flip. Check the TYPE column to tell the rows apart.
  nodeStatusCounts in --json counts nodes by status. status COMPLETED with
  nodeStatusCounts.completed == 0 means an execution row exists and NOTHING RAN.
  THE TYPE COLUMN IS "executionType" IN --json, NOT "type". Reading .type gets
  you undefined, and undefined is indistinguishable from a real run here — every
  row has an executionType, so a missing value means you read the wrong key:
    $ nexus execution list --json | jq -r '.data[] | "\\(.id) \\(.executionType)"'`;
