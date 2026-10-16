import type { BaselineLeaf, SurfaceBaseline } from "./cli-surface.baseline.model";
import type { SurfaceTier } from "./cli-surface.model";
import type { DeprecationRecord } from "./deprecations";

/**
 * WHAT THE REMOVAL AUDIT REPORTS, AND WHAT IT HAS TO BE HANDED.
 *
 * Types only — `deprecation-cycle.ts` carries the rule these shapes exist for,
 * including why there are FOUR verdicts and why the tier is read off the
 * baseline row rather than recomputed.
 */

/** What happened to a path the last release promised. */
export type RemovalVerdict = "present" | "aliased" | "moved" | "removed";

/** One baseline path, and what became of it. */
export interface RemovalFinding {
  /** The path as the last release shipped it. */
  readonly path: string;
  /** The tier that governed it AT THAT RELEASE. Never recomputed — see `deprecation-cycle.ts`. */
  readonly tier: SurfaceTier;
  readonly verdict: RemovalVerdict;
  /** Where the identity turned up, on a `moved` verdict. */
  readonly movedTo: string | null;
  /** Whether `COMPATIBILITY.md` permits this. `true` for everything not a break. */
  readonly permitted: boolean;
  /** Why — a whole sentence, naming the remedy when it is refused. */
  readonly reason: string;
}

/** Something wrong with a declared record itself, independent of any removal. */
export interface RecordViolation {
  readonly shape: string;
  readonly path: string;
  readonly problem: string;
}

export interface RemovalAuditInput {
  /** The surface of the last release. */
  readonly baseline: SurfaceBaseline;
  /** The surface of the tree as it stands, from `cli-surface.generated.ts`. */
  readonly current: readonly BaselineLeaf[];
  /**
   * Does this path still RUN something in the live tree, aliases included?
   *
   * 🚨 THE CALLER MUST PASS `resolvesToInvocableLeaf`, NOT `resolveCommandPath`.
   * The second answers "is there a node here", and a leaf turned into a
   * NAMESPACE still has one — it just prints a help screen instead of acting. A
   * gate reading that would call a real break the sanctioned rename. The
   * distinction and its cost are documented at the source, in `command-path.ts`.
   *
   * Injected rather than derived here, because answering it needs commander and
   * this module must stay loadable by anything that only wants the rule.
   */
  readonly resolves: (path: string) => boolean;
  /** The declared deprecations, today. */
  readonly records: readonly DeprecationRecord[];
  /** `CHANGELOG.md` split by released heading — see `changelogSections` in
   *  `deprecation-cycle.changelog.ts`. */
  readonly changelog: ReadonlyMap<string, string>;
}
