import type { SurfaceBaseline } from "./cli-surface.baseline.model";
import { changelogAnnounces } from "./deprecation-cycle.changelog";
import { soleRecord } from "./deprecation-cycle.shape";
import { compareVersions } from "./deprecation-cycle.version";
import type { DeprecationRecord } from "./deprecations";

/**
 * Has the cycle been SERVED for this shape? Returns `null` when it has, and the
 * sentence that says why not when it has not.
 *
 * ── THE FOUR CONDITIONS, AND WHY EACH ONE IS THERE ──────────────────────────
 *
 *   1. exactly one record names the shape — zero is an undeclared removal, and
 *      more than one is ambiguous about which cycle is being spent;
 *   2. the shape is in the BASELINE's deprecation set — the announcement
 *      survived a release, which is the condition that cannot be satisfied by
 *      text written in the same commit as the removal;
 *   3. the `CHANGELOG.md` section for `announcedIn` NAMES THE PATH — the
 *      document promises the announcement lands in the changelog, so the gate
 *      reads the entry rather than only the version heading above it;
 *   4. `announcedIn` is at or before the baseline's version — so the removal,
 *      which ships in the release AFTER the baseline, lands strictly later than
 *      the announcement. That is the contract's sentence, restated as a check.
 *
 * 🚨 CONDITION 3 IS WHY THE HEADING ALONE IS NOT ENOUGH. A version heading is a
 * string that already exists for every past release, so a record claiming an old
 * `announcedIn` satisfies a heading test with no announcement behind it. Reading
 * the SECTION means the only way to satisfy it dishonestly is to edit the
 * changelog entry of a release that already shipped — which is a diff nobody
 * writes by accident.
 *
 * ⚠️ It matches on the record's CURRENT path. A leaf renamed between its
 * announcement and its removal has an entry naming the old spelling, and this
 * will refuse until the entry names the new one too. Naming both is the fix, and
 * it is what a reader of that entry needs anyway.
 *
 * Plus one consistency check on the record's own claim: `removeIn` must name a
 * later release than `announcedIn`. See `deprecations.ts` for why `removeIn`
 * cannot be checked against the release that actually ships the removal.
 */
export function cycleUnserved(
  shape: string,
  baseline: SurfaceBaseline,
  records: readonly DeprecationRecord[],
  changelog: ReadonlyMap<string, string>
): string | null {
  const duplicates = records.filter((record) => record.shape === shape);
  if (duplicates.length > 1) {
    return (
      `${duplicates.length} deprecation records name shape ${shape} — which cycle is ` +
      `being spent is undecidable. Keep one record per shape.`
    );
  }

  const record = soleRecord(records, shape);
  if (record === null) {
    return (
      `no deprecation record names shape ${shape}. Removing a STABLE leaf needs one: ` +
      `add it to DEPRECATIONS in src/deprecations.ts, ship that release, and remove ` +
      `the command in a later one.`
    );
  }

  if (!baseline.deprecations.includes(shape)) {
    return (
      `the deprecation of shape ${shape} was never captured into a release. The ` +
      `baseline at ${baseline.version} does not carry it, so the announcement and ` +
      `the removal are landing in the same release — which is the one thing a ` +
      `deprecation cycle forbids. Ship the announcement first.`
    );
  }

  return announcementUnserved(record, baseline, changelog);
}

/**
 * The three conditions that are about the RECORD rather than about the baseline's
 * deprecation set: the changelog entry exists, it names the path, and the two
 * versions the record declares are in the right order relative to each other and
 * to the last release.
 *
 * Split out of {@link cycleUnserved} for length alone — the four conditions its
 * docblock enumerates are one rule, and this is conditions 3 and 4 plus the
 * record's own consistency check.
 */
function announcementUnserved(
  record: DeprecationRecord,
  baseline: SurfaceBaseline,
  changelog: ReadonlyMap<string, string>
): string | null {
  const entry = changelog.get(record.announcedIn);
  if (entry === undefined) {
    return (
      `the record says it was announced in ${record.announcedIn}, and CHANGELOG.md ` +
      `carries no released heading for that version. COMPATIBILITY.md promises the ` +
      `announcement lands in the changelog, so this gate reads it.`
    );
  }
  if (!changelogAnnounces(entry, record.path)) {
    return (
      `the CHANGELOG.md entry for ${record.announcedIn} never announces ` +
      `\`${record.path}\`. A version heading is not an announcement — the entry has ` +
      `to say what a script loses, by name, in a code span: \`${record.path}\` or ` +
      `\`nexus ${record.path}\`. A path that merely appears inside a LONGER command ` +
      `does not count.`
    );
  }

  const announcedVsBaseline = compareVersions(record.announcedIn, baseline.version);
  if (announcedVsBaseline === null) {
    return (
      `cannot compare announcedIn ${JSON.stringify(record.announcedIn)} with the ` +
      `baseline version ${JSON.stringify(baseline.version)} — both must be x.y.z.`
    );
  }
  if (announcedVsBaseline > 0) {
    return (
      `the record says it was announced in ${record.announcedIn}, which is after the ` +
      `last release (${baseline.version}). The announcement has not shipped yet, so ` +
      `the removal cannot be a release later than it.`
    );
  }

  const cycleLength = compareVersions(record.removeIn, record.announcedIn);
  if (cycleLength === null || cycleLength <= 0) {
    return (
      `the record declares removeIn ${JSON.stringify(record.removeIn)}, which is not ` +
      `a release after announcedIn ${JSON.stringify(record.announcedIn)}. A cycle is ` +
      `at least one release long.`
    );
  }

  return null;
}
