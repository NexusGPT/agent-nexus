/**
 * THE RULE THAT DECIDES WHETHER A LEAF WAS ALLOWED TO DISAPPEAR.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `cli-surface.generated.ts` made a change to the public surface into a DIFF.
 * It did not make any change WRONG — a deleted command is a clean regeneration
 * and a green build, and the reviewer who has to notice is the same reviewer
 * who would have had to notice before. This module is the half that refuses.
 *
 * It compares the surface of the LAST RELEASE against the surface of the tree
 * as it stands, and reports every leaf that stopped answering. Then, for each,
 * it asks the only question `COMPATIBILITY.md` cares about: was this permitted?
 *
 * ── FOUR VERDICTS, BECAUSE THREE OF THEM ARE NOT REMOVALS ───────────────────
 *
 * Collapsing these into "gone / not gone" is what makes a removal gate refuse
 * correct work, and a gate that refuses correct work gets uninstalled:
 *
 *   `present`  the path is still a leaf under the same spelling. Nothing to ask.
 *   `aliased`  the path is not the canonical spelling any more, and it STILL
 *              RESOLVES — a `.alias()` catches it. `COMPATIBILITY.md` names this
 *              as the correct way to rename something, so it is never a break.
 *   `moved`    the path stopped resolving and the leaf's identity turned up
 *              somewhere else. A rename with NO alias. The document is explicit
 *              that this IS a break of STABLE: "renaming it without keeping the
 *              old name as an alias". The finding names the alias as the cheap
 *              cure, because it usually is one.
 *   `removed`  the path stopped resolving and the identity is gone with it.
 *
 * ── THE TIER DECIDES WHETHER A CYCLE IS OWED ────────────────────────────────
 *
 * Transcribed from the document rather than re-decided here:
 *
 *   STABLE    "removing a command … is a break". Full cycle.
 *   UNSTABLE  "these may change in any release, without a changelog entry".
 *   INTERNAL  "No promise. … we will change them without telling anyone."
 *
 * 🚨 THE TIER IS READ OFF THE BASELINE ROW, NEVER RECOMPUTED. The leaf is gone,
 * so it has no tier today — and the promise that matters is the one that was
 * MADE, not the one that would apply now. A leaf that was STABLE last release
 * and would be INTERNAL today (because someone hid it in the same commit that
 * deleted it) must not launder its way out through the recomputation.
 *
 * ── WHAT THIS CANNOT SEE, STATED RATHER THAN IMPLIED ────────────────────────
 *
 *  - A rename that lands in the SAME commit as a flag or description change
 *    moves the path AND the shape, so it reads as `removed`. That is a limit of
 *    any derived identity and `cli-surface.model.ts` documents it at the source.
 *    The honest remedy is the one the document already names: keep the old name
 *    as an alias, and the verdict becomes `aliased` whatever the shape did.
 *  - A leaf inside a SHAPE COLLISION GROUP cannot be tracked by identity, so
 *    `moved` is not offered for one — it degrades to `removed`, which is the
 *    conservative direction. The manifest's generated header names every group.
 *  - Arguments, flags and `--json` shapes are not compared here at all. Those
 *    are EVOLVING and UNSTABLE surfaces with their own gates; this module is
 *    about a path continuing to answer.
 *
 * ── WHERE EACH PART LIVES ───────────────────────────────────────────────────
 *
 * This file is the entry point and declares no behaviour of its own, so that
 * every importer keeps one import path while each concern stays its own module:
 *
 *   `.model.ts`         the finding and violation shapes, and the audit's input
 *   `.version.ts`       `x.y.z` parsing and numeric comparison
 *   `.changelog.ts`     splitting CHANGELOG.md, and what counts as an announcement
 *   `.shape.ts`         grouping paths by identity, and finding the sole record
 *   `.tier.ts`          what each tier promises, transcribed from the document
 *   `.cycle-served.ts`  whether a shape's cycle has actually been spent
 *   `.removals.ts`      one verdict per promised path — the audit above
 *   `.records.ts`       defects in the declared records themselves
 *   `.baseline.ts`      the next baseline, and the document figure derived from it
 *   `.render.ts`        the generated module's text
 */

export { nextBaseline, retargetCompatibilityFigures } from "./deprecation-cycle.baseline";
export { changelogAnnounces, changelogSections } from "./deprecation-cycle.changelog";
export type {
  RecordViolation,
  RemovalAuditInput,
  RemovalFinding,
  RemovalVerdict
} from "./deprecation-cycle.model";
export { auditDeprecationRecords } from "./deprecation-cycle.records";
export { auditSurfaceRemovals } from "./deprecation-cycle.removals";
export { renderBaselineModule } from "./deprecation-cycle.render";
export { compareVersions } from "./deprecation-cycle.version";
