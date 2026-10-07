/**
 * THE ROUTES THIS BRANCH INTRODUCES THAT THE DEPLOYED API CANNOT SERVE YET —
 * its own module, so a reader of it does not load the command table.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY IT IS NOT IN `command-universe.ts` WITH ITS TWO SIBLINGS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It was, and the argument for keeping the three sweep declarations together was
 * coherence: one derivation and one bash face read them, so a reader hunting "what
 * the sweep accepts" finds all three in one place. That argument is sound and it
 * lost to a measurement.
 *
 * `scripts/id-thread-sweep.ts` needs THIS declaration and nothing else from that
 * module, and `test/id-thread/id-thread-sweep.test.ts` spawns that runner 84 times
 * — once per case. Importing `command-universe.ts` drags `COMMAND_CLASSIFICATION`,
 * a ~470-row table with per-row reasoning, through type-stripping and parsing on
 * every one of those spawns. Measured on this tree: about 0.1s per spawn over the
 * runner's prior import graph, so roughly 8 seconds across the file.
 *
 * ⚠️ 8 OF 312 SECONDS, AND SAYING SO IS THE POINT. That file's CI duration was
 * 312s and this is not the cure for it — the cure was bounding eleven concurrent
 * real sweeps in one `vitest run`. A reader who finds this split and concludes the
 * duration problem was an import cost would stop looking at the thing that
 * actually mattered. It is 2.6% of it, removed because it is free to remove.
 *
 * `command-universe.ts` RE-EXPORTS both symbols, so the coherence the sibling
 * argument was about survives: a reader who looks where the other two
 * declarations live still finds this one, and every existing importer is
 * unchanged.
 */

/**
 * One leaf's route that the DEPLOYED API cannot serve yet.
 *
 * Two fields rather than one string, because the sweep needs both and they are
 * read by different things: {@link route} is spliced into an ERE by
 * `scripts/route-not-deployed.sh`, and {@link cause} is printed for a human.
 * Carrying them in one sentence would mean parsing prose to recover the path,
 * and a reword would then silently unbind the matcher.
 */
export interface SweepPendingDeployRoute {
  /**
   * The request path EXACTLY as the deployed API's own 404 spells it, `/api`
   * prefix included — `/api/public/v1/<noun>`. A LIVE noun is the wrong
   * illustration here however convenient it reads: any concrete one deploys and
   * takes the sentence false with it, which is the decay this whole module
   * exists to make loud rather than to carry in its own prose.
   *
   * 🚨 NOT as the generated contract spells it (`/public/v1/<noun>`). The
   * matcher binds to the MESSAGE, so declaring the contract's form would need a
   * prefix transformation nothing checks — and {@link DriftReport} refuses a
   * v1-contract binding in this module on purpose.
   *
   * It is spliced into a regular expression, so it must be a literal path. The
   * matcher REFUSES anything outside `/[A-Za-z0-9/_.~-]+`, and so does
   * `scripts/command-universe.ts` before the sweep executes a single leaf — a
   * declaration reading `.*` would match every 404 there is.
   */
  readonly route: string;
  /** Why the route is absent, in one sentence. Printed in the sweep's report. */
  readonly cause: string;
}

/**
 * ROUTES THIS BRANCH INTRODUCES THAT THE DEPLOYED API CANNOT SERVE YET.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE SWEEP RUNS TWO DIFFERENT TREES AGAINST EACH OTHER, BY DESIGN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The `cli-sweep` job builds the CLI from the PULL REQUEST's own sources and
 * sweeps it against the DEPLOYED staging API. So a branch that adds a CLI noun
 * AND the route it calls is red from the moment it opens until it merges and
 * deploys: the leaf is genuinely `safe`, the command is correct, and the
 * environment has no such route. Nothing about that is a CLI defect, and nothing
 * a code change can do will clear it.
 *
 * An entry here says the sweep accepts ONE named absence, for ONE named leaf:
 *
 *   - the leaf's refusal IS that path being absent  → PENDING, counted toward
 *     no exit code, printed with its cause and its denominator;
 *   - the leaf fails for any OTHER reason           → FAIL. A declaration is not
 *     an amnesty: a 401 or a 500 on a declared leaf is the same regression it
 *     always was;
 *   - the leaf ANSWERS                              → FAIL, naming this entry.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE THIRD BULLET IS THE POINT OF THE WHOLE MECHANISM, AND THE DIRECTION IS
 * DELIBERATE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A route going live is GOOD NEWS, and {@link SWEEP_EXPECTED_SKIPS} reports its
 * own good news as STALE and fails nothing — on the stated grounds that a gate
 * reddening on good news gets its declarations deleted rather than its news
 * read. This one FAILS instead, and the asymmetry is the argument for it:
 *
 *   - an expected SKIP is about an ENVIRONMENT that may lift at any time, by
 *     somebody else's hand, repeatedly. Reddening on that is reddening on
 *     weather nobody in this repository controls;
 *   - a pending-deploy entry is about THIS BRANCH's own undeployed diff. It
 *     expires exactly once, at the deploy, and the person who put it there is
 *     the person whose change deployed. There is no weather.
 *
 * And the cost of the other direction is measured in this tree. `tracks list`
 * is parked at `registration-only` behind a block comment naming the probe that
 * would promote it — a comment with no arm. Measured 2026-10-07 against the
 * deployed staging API: `/api/public/v1/tracks` answers **401**, while a path
 * nobody has registered answers **404**. So the route is REGISTERED, where the
 * `CLI: Sweep` run that parked the leaf had it answering `Cannot GET
 * /api/public/v1/tracks`; it deployed, the leaf is still unswept, and nothing
 * anywhere went red — which is what that comment itself predicted of a
 * declaration with no mechanism behind it. An entry here cannot do that.
 *
 * ⚠️ `401` IS NOT THAT COMMENT'S PROMOTION CONDITION, AND THE TWO ARE EASY TO
 * RUN TOGETHER. An unauthenticated 401 answers *is this route registered*; the
 * probe that block specifies is an AUTHENTICATED `api GET /public/v1/tracks` and
 * its condition is a **200**, which a registered route can still miss with a 403
 * or a 500. Nobody has run it, and nothing here claims otherwise — the argument
 * above needs only that the route stopped 404ing with no arm watching.
 *
 * ⚠️ IT IS NOT A DISPOSITION AND MUST NEVER BECOME ONE, for the reason
 * {@link SWEEP_EXPECTED_SKIPS} gives: the leaf stays `safe`, so the sweep keeps
 * executing it, so the deploy is noticed by the gate rather than by somebody
 * remembering. Parking the leaf as `registration-only` instead — the move the
 * tree makes by hand today — buys a green sweep and costs the leaf's live
 * coverage permanently, because nothing is watching for the day it could come
 * back.
 *
 * THE REMEDY, WHEN THE FAIL ARRIVES: delete the entry. That is the whole of it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 EMPTY IS THE RESTING STATE, NOT A GAP — AND IT IS WHAT WORKING LOOKS LIKE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * An entry fires exactly once, at a deploy, and the remedy for its own good news
 * is to delete it. So a reader finding `{}` is looking at every declaration this
 * repository has ever made having retired on schedule — the mechanism idle, not
 * absent. Do not reach for a self-test entry to make the table look alive: a
 * declaration for a leaf the sweep does not execute is reported as drift by
 * `stalePendingDeploy`, which is that guard working.
 *
 * ⚠️ IT IS NOT COST-FREE, and the cost is stated where it is paid:
 * `sweep-routes-pending-deploy-self-retire.test.ts` carries which of its arms go
 * dormant with no entry to drive, why the sweep's own derivation leaves no seam
 * to inject one, and what that dormancy misses.
 */
export const SWEEP_ROUTES_PENDING_DEPLOY: Readonly<Record<string, SweepPendingDeployRoute>> = {};
