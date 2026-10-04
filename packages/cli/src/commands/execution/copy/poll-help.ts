/** Appended to `nexus execution poll`. */
export const EXECUTION_POLL_HELP = `
Examples:
  $ nexus execution poll 11111111-1111-4111-8111-111111111111
  $ nexus execution poll --token tok-abc
  $ nexus execution poll 11111111-1111-4111-8111-111111111111 --watch
  $ nexus execution poll 11111111-1111-4111-8111-111111111111 --watch --interval 5000

Notes:
  The lightest read there is: {executionId, status, outputData, createdAt,
  finishedAt}. For per-node detail use "execution diagnose" or "execution follow".
  --token takes the pollingToken from "execution get --json" and is the way to
  watch a run without holding its id — pass one or the other, not neither.
  ONLY A PRODUCTION WEBHOOK RUN HAS A pollingToken. Every other run — workflow
  test, schedule, agent call, this API — stores null there, so --token has
  nothing to take and polling by id is the only route. A token that matches no
  run is a 404, indistinguishable from a token that was never minted.
  --watch stops at COMPLETED, FAILED or CANCELLED and does not time out, so a run
  wedged in RUNNING polls forever. --interval is floored at 500 ms.
  outputData is null until the run finishes, AND STAYS NULL ON A FINISHED RUN
  WHOSE GRAPH WROTE NOTHING. It is filled from the outputNode's own result, so a
  workflow with no outputNode, or one whose outputNode has no data.instructions
  to render, completes with outputData empty and no error on the run. That second
  case is now visible BEFORE the run: the node reports configStatus incomplete
  with missingFields ["instructions"]. Read the node results with "execution
  diagnose" when a COMPLETED run polls back empty.
  THE EXIT CODE CARRIES status, WITH OR WITHOUT --watch. A COMPLETED run exits 0
  and a FAILED one exits non-zero. CANCELLED exits non-zero under the UNMEASURED
  category — --watch treats it as terminal, and it is NOT a failure: somebody
  stopped the run before the platform judged it. A one-shot poll of a run still
  PENDING or RUNNING is UNMEASURED too, which makes
  "until nexus execution poll <id>; do sleep 5; done" a wait loop that can tell
  the three apart. "nexus --help" holds the code table.`;
