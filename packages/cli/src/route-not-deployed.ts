import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * IS THIS REFUSAL THE DECLARED ROUTE BEING ABSENT FROM THE DEPLOYED API — asked
 * of the SHELL matcher, never re-expressed here.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 TWO SWEEPS NEED THIS ANSWER AND THE PATTERN MUST NOT EXIST TWICE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `scripts/sweep.sh` asks it of a leaf it executed directly. `scripts/id-thread-sweep.ts`
 * asks it of a PRODUCER whose failure blocks every consumer threading from it.
 * Both are the same question about the same sentence, and the sentence is owned
 * by `scripts/route-not-deployed.sh`, which carries the argument for every
 * refused broadening.
 *
 * A TypeScript twin of that regex would be a second place to drift, and a reword
 * would unbind one copy while the other kept reporting — silently, in the
 * direction that keeps a gate green. So this module obtains the VERDICT by
 * EXECUTING the one definition.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 AND SHARING THE PATTERN AS A STRING IS NOT MERELY UNTIDY — IT IS WRONG, AND
 * WRONG SILENTLY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The pattern is POSIX ERE and carries `[[:space:]]`. JavaScript's `RegExp` has
 * no POSIX character classes: it parses `[[:space:]` as a character class
 * containing `[ : s p a c e` and then a LITERAL `]`, so the construct demands two
 * characters where ERE allows optional whitespace. Measured on node 24:
 *
 *   new RegExp('"message":[[:space:]]*"Not found: Cannot [A-Z]+ /api/x"')
 *     .test('"message": "Not found: Cannot GET /api/x"')   // => false
 *   /^[[:space:]]$/.test(" ")                               // => false
 *
 * It throws nothing. A reader who moved the literal into TS would get a regex
 * that compiles, reads correctly, and matches no real document — which is the
 * exact shape of the hole the matcher exists to close. So the dialect boundary,
 * not taste, is why this file spawns a shell.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THREE VERDICTS, AND `unmeasured` IS NOT `other`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   absent      the refusal IS this exact path being absent
 *   other       it is not — the caller scores the failure on its own merits
 *   unmeasured  the declared path is not a literal path, so nothing was asked
 *
 * Collapsing `unmeasured` into `other` would turn a typo in a declaration into a
 * leaf failing for a reason nobody can read. Collapsing it into `absent` would
 * splice an unvalidated string into a regular expression.
 *
 * ⚠️ IT SPAWNS, SO IT IS NOT PURE — which is why `planThread` does not call it.
 * That function is pure on purpose (its own header says why), so the runner asks
 * this once per broken producer and hands `planThread` the answer.
 */

/** What the shell matcher said about one transcript and one declared path. */
export type RouteAbsenceVerdict = "absent" | "other" | "unmeasured";

const MATCHER = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "route-not-deployed.sh"
);

/**
 * 99 is the harness's own refusal and can never be a matcher verdict: a file
 * that failed to source would otherwise leave every function undefined and every
 * call non-zero, which reads exactly like `other` — "not a route absence" — and
 * would quietly turn every declared absence back into a failure.
 */
const COULD_NOT_SOURCE = 99;

/**
 * Ask the shell matcher.
 *
 * `bash -c <script> <name> <args…>` binds `$1`/`$2`/`$3` with no interpolation of
 * a transcript into a script body — a transcript carries JSON, quotes and the odd
 * em dash, and splicing one into source would make this reader the thing under
 * test.
 *
 * @param transcript the CLI's combined output for the failed call
 * @param route the path declared for it in `SWEEP_ROUTES_PENDING_DEPLOY`
 */
export function routeAbsenceVerdict(transcript: string, route: string): RouteAbsenceVerdict {
  const result = spawnSync(
    "bash",
    [
      "-c",
      `. "$1" || exit ${COULD_NOT_SOURCE}; is_route_not_deployed "$2" "$3"`,
      "route-absence-reader",
      MATCHER,
      transcript,
      route
    ],
    { encoding: "utf8" }
  );

  if (result.error !== undefined) throw result.error;
  if (result.status === COULD_NOT_SOURCE) {
    throw new Error(
      `could not source ${MATCHER} — refusing to guess at a route absence. ${result.stderr}`
    );
  }

  switch (result.status) {
    case 0:
      return "absent";
    case 2:
      return "unmeasured";
    default:
      // 🚨 THE DEFAULT IS `other`, THE LOUD DIRECTION. Anything the matcher did
      // not positively call an absence leaves the caller scoring the failure as
      // the regression it may well be. A default of `absent` would excuse an
      // outage on any declared leaf.
      return "other";
  }
}
