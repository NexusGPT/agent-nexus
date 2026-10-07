import type { RouteAbsenceVerdict } from "./route-not-deployed";
import type { SweepPendingDeployRoute } from "./sweep-routes-pending-deploy";

/**
 * WHICH BROKEN PRODUCERS ARE A DECLARED ROUTE ABSENCE — the runner's decision,
 * extracted so a spec can reach it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS IN `src/` AND NOT IN THE RUNNER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `scripts/id-thread-sweep.ts` ends in `main()`, so importing it RUNS the sweep
 * and nothing in it can be reached by a spec. Every piece of this harness's
 * decision-making has had to move out for that reason — the refusal parser, the
 * outcome mapping, the race verdict, the thread plan — and each moved only after
 * the branch it held had gone unproven. This is the fifth, moved before rather
 * than after.
 *
 * It was eight lines of glue in the runner's loop, and those eight lines hold the
 * one decision that decides whether a producer failure is EXCUSED. A branch with
 * that consequence does not belong somewhere no test can see it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE VERDICT IS INJECTED, AND THAT IS NOT A TESTING CONVENIENCE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The sentence is owned by `scripts/route-not-deployed.sh` — one definition, in
 * POSIX ERE, which JavaScript's `RegExp` cannot read (`src/route-not-deployed.ts`
 * carries the measurement). Reading it requires spawning a shell, which would
 * make this function impure and its spec dependent on a subprocess per case.
 *
 * So the ASKING is a parameter and the DECIDING is here. The runner passes the
 * real reader; a spec passes a stub and scores the decision. Neither re-expresses
 * the pattern, which is the property that matters.
 */

/** Asks whether one transcript is one declared path being absent. */
export type RouteAbsenceReader = (transcript: string, route: string) => RouteAbsenceVerdict;

/**
 * The producers whose CURRENT failure is the exact absence declared for them.
 *
 * 🚨 ONLY A POSITIVE `absent` ADMITS ONE, and the two rejected verdicts are
 * rejected for different reasons:
 *
 *   `other`       a real failure on a declared producer — a 401 from an expired
 *                 key, a 500, a 404 naming another path. The declaration is not
 *                 an amnesty, and ONE producer blocks SEVERAL consumers, so
 *                 excusing this turns a whole fan-out green at once.
 *   `unmeasured`  the declared path is not a literal path, so nothing was asked.
 *                 Nothing may be excused on a question nobody put.
 *
 * ⚠️ A PRODUCER NOBODY DECLARED IS NEVER ASKED AT ALL. The declaration is the
 * key, never the shape of the refusal — a branch keyed on the sentence would
 * excuse every absent route including the ones nobody has accepted.
 *
 * @param producerBroke producer leaf → the transcript of its failure
 * @param declaration `SWEEP_ROUTES_PENDING_DEPLOY`, keyed by leaf path
 * @param readVerdict the shell matcher's reader
 * @returns producer leaf → the declared path, for the confirmed absences only
 */
export function resolvePendingDeployProducers(
  producerBroke: ReadonlyMap<string, string>,
  declaration: Readonly<Record<string, SweepPendingDeployRoute>>,
  readVerdict: RouteAbsenceReader
): Map<string, string> {
  const pending = new Map<string, string>();

  for (const [producer, transcript] of producerBroke) {
    const declared = declaration[producer];
    if (declared === undefined) continue;
    if (readVerdict(transcript, declared.route) === "absent") {
      pending.set(producer, declared.route);
    }
  }

  return pending;
}
