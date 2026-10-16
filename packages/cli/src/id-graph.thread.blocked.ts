import type { ParamSource } from "./id-graph.model";
import type { BlockedThread } from "./id-graph.thread.plan";

/**
 * THE TWO REASONS ONE SOURCE STOPS A LEAF, AND THE DISCRIMINATOR INSIDE EACH.
 *
 * Both are a single `blocked` plan to the planner and four different FACTS to a
 * reader of the sweep's output, which is why each one's discriminator carries
 * more prose than code. They live here rather than inline in `planThread` so the
 * loop that threads ids reads as a loop, and so the reasoning below sits beside
 * the branch it is about instead of under three levels of indentation.
 */

/** The source arm these refusals are about: a param served by a producer leaf. */
type ProducerSource = Extract<ParamSource, { kind: "producer-leaf" }>;

/**
 * The producer this source needs did not answer. PENDING_DEPLOY or FAILED.
 *
 * `pendingRoute` is the path `SWEEP_ROUTES_PENDING_DEPLOY` declares absent, for
 * a producer whose CURRENT failure the shell matcher confirmed IS that absence,
 * or `undefined` for every other reason a producer can break.
 */
export function blockedByBrokenProducer(
  source: ProducerSource,
  broke: string,
  pendingRoute: string | undefined
): BlockedThread {
  // 🚨 BEFORE THE FAILED BRANCH, AND ONLY ON A POSITIVE ANSWER. The runner
  // has already asked the shell matcher whether THIS producer's refusal is
  // the exact path `SWEEP_ROUTES_PENDING_DEPLOY` declares absent; a defined
  // `pendingRoute` IS that answer. A producer that broke for any other reason — a
  // 401, a 500, a 404 naming a different path — arrives here with `undefined` and
  // falls through to FAILED, which is the loud direction and the default.
  //
  // Why the consumer is not simply FAILED: `cli-sweep` builds the CLI from
  // the PR's own sources and runs it against the DEPLOYED API, so a branch
  // adding a noun AND the route it calls cannot serve its own producer yet.
  // That is not a defect in the consumer, and no code change clears it.
  //
  // It cannot go STALE. This fires only while the producer is FAILING right
  // now, so the day the route deploys the producer answers, this branch is
  // never reached, and the consumer is threaded and actually tested. The
  // DECLARATION outliving its reason is caught by `sweep.sh`, which executes
  // the producer leaf directly and reds with STALE PENDING-DEPLOY — in this
  // same job. One stale detector, not two.
  if (pendingRoute !== undefined) {
    return {
      kind: "blocked",
      status: "PENDING_DEPLOY",
      note:
        `producer \`${source.leaf}\` cannot be served yet — DECLARED ` +
        `pending-deploy: ${pendingRoute} is absent from the deployed API`
    };
  }

  // A producer that ERRORED is not a producer that is EMPTY. Conflating them
  // would report a broken list route as "nothing to test with", which is the
  // exact substitution this harness exists to refuse.
  return {
    kind: "blocked",
    status: "FAILED",
    note: `producer \`${source.leaf}\` failed: ${broke}`
  };
}

/**
 * The producer answered and left this leaf with no id it may use.
 * SKIPPED_ID_VANISHED or SKIPPED_NO_ID.
 *
 * `lostCount` is how many of this producer's rows this leaf has already proven
 * were deleted underneath it; `offeredCount` is how many its fresh body still
 * lists.
 */
export function blockedByNoUsableId(
  source: ProducerSource,
  lostCount: number,
  offeredCount: number
): BlockedThread {
  // 🚨 TWO REASONS, TWO STATUSES, AND THE DISCRIMINATOR IS `lostCount` — NEVER
  // `offeredCount`. "The producer has no rows" and "every row it had was
  // deleted underneath this leaf" are different facts, and reporting the
  // second under the first's wording hides a live race behind a sentence
  // that is simply untrue.
  //
  // 🔴 READING IT OFF `offeredCount` GETS THE RACE-AT-FULL-STRENGTH CASE
  // EXACTLY BACKWARDS, which is the bug this branch shipped with. When the
  // re-read that PROVED the deletion also comes back EMPTY — the producer's
  // last row was the one that vanished — `offeredCount === 0` is true and
  // the old test called it "returned zero rows". That is the single case the
  // fifth outcome exists for, rendered as the ordinary skip a reader scrolls
  // past. `lostCount` is non-zero exactly when this producer lost a row we
  // used, whether or not anything survived it.
  //
  // ⚠️ And it is per-producer for the other direction: a leaf threading two
  // producers, where A raced and B is legitimately empty, must still report
  // B as SKIPPED_NO_ID. A flat "has anything vanished" set answers that one
  // wrong too, in the opposite direction.
  if (lostCount > 0) {
    return {
      kind: "blocked",
      status: "SKIPPED_ID_VANISHED",
      note:
        `every \`${source.param}\` producer \`${source.leaf}\` offered was deleted ` +
        `mid-sweep (${lostCount} proven gone, ${offeredCount} still listed)`
    };
  }

  return {
    kind: "blocked",
    status: "SKIPPED_NO_ID",
    note: `no \`${source.param}\` existed - producer \`${source.leaf}\` returned zero rows`
  };
}
