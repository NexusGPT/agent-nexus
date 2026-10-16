import type { BaselineLeaf, SurfaceBaseline } from "./cli-surface.baseline.model";
import { changelogAnnounces } from "./deprecation-cycle.changelog";
import type { RecordViolation } from "./deprecation-cycle.model";
import { byShape } from "./deprecation-cycle.shape";
import { compareVersions, SEMVER } from "./deprecation-cycle.version";
import type { DeprecationRecord } from "./deprecations";

/**
 * WHAT IS WRONG WITH THE DECLARED RECORDS THEMSELVES.
 *
 * Separate from the removal audit on purpose: these are defects in the
 * BOOKKEEPING, and they show up while the leaf is still perfectly present. A
 * record whose `path` drifted wires the runtime warning onto nothing, and the
 * only symptom is silence — which is why it is checked rather than trusted.
 */
export function auditDeprecationRecords(input: {
  readonly baseline: SurfaceBaseline;
  readonly current: readonly BaselineLeaf[];
  readonly records: readonly DeprecationRecord[];
  readonly changelog: ReadonlyMap<string, string>;
}): readonly RecordViolation[] {
  const violations: RecordViolation[] = [];
  const currentByShape = byShape(input.current);
  const baselineShapes = new Set(input.baseline.leaves.map((leaf) => leaf.shape));
  const seen = new Map<string, number>();

  for (const record of input.records) {
    seen.set(record.shape, (seen.get(record.shape) ?? 0) + 1);

    const problems = declarationProblems(record, input.changelog);
    const target = targetProblem(record, currentByShape, baselineShapes, input.baseline.version);
    if (target !== null) problems.push(target);

    for (const problem of problems) {
      violations.push({ shape: record.shape, path: record.path, problem });
    }
  }

  for (const [shape, count] of seen) {
    if (count > 1) {
      violations.push({
        shape,
        path: "(several)",
        problem: `${count} records name shape ${shape}. Keep exactly one per shape.`
      });
    }
  }

  return violations;
}

/** Defects in what the record CLAIMS — its two versions, and the entry it points at. */
function declarationProblems(
  record: DeprecationRecord,
  changelog: ReadonlyMap<string, string>
): string[] {
  const problems: string[] = [];

  for (const [field, value] of [
    ["announcedIn", record.announcedIn],
    ["removeIn", record.removeIn]
  ] as const) {
    if (!SEMVER.test(value)) {
      problems.push(`${field} is ${JSON.stringify(value)}, which is not x.y.z.`);
    }
  }

  const cycleLength = compareVersions(record.removeIn, record.announcedIn);
  if (cycleLength !== null && cycleLength <= 0) {
    problems.push(
      `removeIn ${record.removeIn} is not after announcedIn ${record.announcedIn}. ` +
        `A cycle is at least one release long.`
    );
  }

  // A record written TODAY normally names the release it is about to ship in,
  // which has no heading yet — that is the ordinary state and not a defect.
  // Once the heading exists, the ENTRY has to name the path, because that is
  // the announcement the removal gate later spends.
  const entry = changelog.get(record.announcedIn);
  if (entry !== undefined && !changelogAnnounces(entry, record.path)) {
    problems.push(
      `the CHANGELOG.md entry for ${record.announcedIn} never announces ` +
        `\`${record.path}\`. Say what a script loses, by name, in a code span — the ` +
        `removal gate reads that entry, not only the heading above it, and a path ` +
        `that merely appears inside a LONGER command does not count.`
    );
  }

  return problems;
}

/** Whether the record still names a leaf, and the right one. At most one problem. */
function targetProblem(
  record: DeprecationRecord,
  currentByShape: ReadonlyMap<string, readonly string[]>,
  baselineShapes: ReadonlySet<string>,
  baselineVersion: string
): string | null {
  const live = currentByShape.get(record.shape) ?? [];

  if (live.length > 1) {
    return (
      `shape ${record.shape} is shared by ${live.length} leaves (${live.join(", ")}), so ` +
      `a record cannot name one of them. Give the leaf a distinguishing description ` +
      `or flag first — the manifest's header lists every collision group.`
    );
  }
  if (live.length === 1 && live[0] !== record.path) {
    return (
      `the record says \`${record.path}\` and the leaf with this shape is now ` +
      `\`${live[0]}\`. The runtime warning is wired onto the path, so it is ` +
      `currently attached to nothing. Update the path; the shape is the identity ` +
      `and does not change.`
    );
  }
  if (live.length === 0 && !baselineShapes.has(record.shape)) {
    return (
      `this record names nothing: the leaf is absent from the surface AND from the ` +
      `baseline at ${baselineVersion}, so its removal has already shipped. ` +
      `Delete the record.`
    );
  }

  return null;
}
