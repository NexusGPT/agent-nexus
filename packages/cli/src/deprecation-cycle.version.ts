/**
 * VERSION ARITHMETIC FOR THE DEPRECATION GATE.
 *
 * Both exports are shared: the removal audit compares an announcement against
 * the baseline, the record audit checks a record's own two fields, and
 * `skills-corpus/resolve.ts` reaches for the comparator directly.
 */

/** `x.y.z` and nothing else. A version this cannot parse is refused, never guessed at. */
export const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Compare two `x.y.z` strings numerically, or `null` when either is unparseable.
 *
 * 🚨 A STRING COMPARISON IS WRONG IN THE PERMISSIVE DIRECTION HERE, which is why
 * this is not `a <= b`. `"0.9.0" <= "0.26.0"` is FALSE lexicographically and
 * TRUE numerically, so a deprecation announced in 0.9.0 would be refused — the
 * safe error. But `"0.100.0" <= "0.26.0"` is TRUE lexicographically and false
 * numerically, so an announcement from a release that has not happened yet would
 * be ACCEPTED, and that is the whole gate walked around by a version number.
 * `null` on an unparseable input keeps the third state visible rather than
 * folding it into one of the two answers.
 */
export function compareVersions(left: string, right: string): number | null {
  const a = SEMVER.exec(left);
  const b = SEMVER.exec(right);
  if (a === null || b === null) return null;

  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}
