import type { BaselineLeaf } from "./cli-surface.baseline.model";
import { cycleUnserved } from "./deprecation-cycle.cycle-served";
import type { RemovalAuditInput, RemovalFinding, RemovalVerdict } from "./deprecation-cycle.model";
import { byShape } from "./deprecation-cycle.shape";
import { NO_PROMISE, OWES_A_CYCLE } from "./deprecation-cycle.tier";

/**
 * THE REMOVAL AUDIT: one verdict per path the last release promised.
 *
 * `deprecation-cycle.ts` carries the rule — the four verdicts, why the tier is
 * read off the baseline row, and what this cannot see. This file is that rule
 * applied leaf by leaf.
 */

/**
 * EVERY PATH THE LAST RELEASE PROMISED, AND WHAT BECAME OF IT.
 *
 * Returns one finding per BASELINE leaf, including the ones that are fine — a
 * caller that wants only the breaks filters on `permitted`. Reporting the whole
 * population is deliberate: a gate that only ever sees its own failures has no
 * way to notice that it stopped seeing anything at all.
 */
export function auditSurfaceRemovals(input: RemovalAuditInput): readonly RemovalFinding[] {
  const currentPaths = new Set(input.current.map((leaf) => leaf.path));
  const currentByShape = byShape(input.current);
  const baselineByShape = byShape(input.baseline.leaves);

  return input.baseline.leaves.map((leaf): RemovalFinding => {
    const surviving = survivingFinding(leaf, input, currentPaths);
    if (surviving !== null) return surviving;

    // `moved` is only offered when the identity is unambiguous on BOTH sides. A
    // shape shared by several leaves cannot say which one turned up where, and
    // guessing would report a removal as a rename — the direction that lets a
    // break through.
    const here = baselineByShape.get(leaf.shape) ?? [];
    const there = currentByShape.get(leaf.shape) ?? [];
    const moved = here.length === 1 && there.length === 1 ? there[0] : null;

    return goneFinding(leaf, input, moved);
  });
}

/** The two verdicts that are not removals at all, or `null` when the path is gone. */
function survivingFinding(
  leaf: BaselineLeaf,
  input: RemovalAuditInput,
  currentPaths: ReadonlySet<string>
): RemovalFinding | null {
  if (currentPaths.has(leaf.path)) {
    return {
      path: leaf.path,
      tier: leaf.tier,
      verdict: "present",
      movedTo: null,
      permitted: true,
      reason: "still a leaf under the same spelling."
    };
  }

  if (input.resolves(leaf.path)) {
    return {
      path: leaf.path,
      tier: leaf.tier,
      verdict: "aliased",
      movedTo: null,
      permitted: true,
      reason:
        "no longer the canonical spelling, and it still resolves through an alias — " +
        "the rename COMPATIBILITY.md sanctions."
    };
  }

  return null;
}

/** The path stopped resolving: `moved` when its identity turned up elsewhere, else `removed`. */
function goneFinding(
  leaf: BaselineLeaf,
  input: RemovalAuditInput,
  moved: string | null
): RemovalFinding {
  const verdict: RemovalVerdict = moved === null ? "removed" : "moved";

  if (!OWES_A_CYCLE[leaf.tier]) {
    return {
      path: leaf.path,
      tier: leaf.tier,
      verdict,
      movedTo: moved,
      permitted: true,
      reason: NO_PROMISE[leaf.tier]
    };
  }

  const unserved = cycleUnserved(leaf.shape, input.baseline, input.records, input.changelog);

  if (unserved === null) {
    return {
      path: leaf.path,
      tier: leaf.tier,
      verdict,
      movedTo: moved,
      permitted: true,
      reason: "the deprecation cycle for this leaf has been served."
    };
  }

  const preamble =
    moved === null
      ? `STABLE leaf \`nexus ${leaf.path}\` no longer exists`
      : `STABLE leaf \`nexus ${leaf.path}\` was renamed to \`nexus ${moved}\` with no ` +
        `alias, so the old line stops working. Adding \`.alias("${leaf.path.split(" ").pop() ?? ""}")\` ` +
        `to the new command is the cheap cure and needs no cycle at all. Otherwise`;

  return {
    path: leaf.path,
    tier: leaf.tier,
    verdict,
    movedTo: moved,
    permitted: false,
    reason: `${preamble}: ${unserved}`
  };
}
