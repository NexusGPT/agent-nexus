/**
 * EVERY LEAF OF THE `nexus` BINARY THAT IS ON ITS WAY OUT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `COMPATIBILITY.md` promises a deprecation cycle — "the old form keeps working,
 * `--help` and the changelog say it is going, and it is removed no sooner than
 * the release after the one that announced it" — and until this file there was
 * no way to PERFORM one. A command could only be kept or deleted. So a removal
 * was argued rather than served: fifteen hidden aliases went in one release, and
 * the argument that made it legal was that INTERNAL promises nothing. That
 * argument does not reach a STABLE leaf, and there was nothing else.
 *
 * A record here is the announcement. It does three things, and they are three
 * separate mechanisms rather than three readings of this list:
 *
 *   1. `deprecation-notice.ts` puts a line on the leaf's `--help` and a warning
 *      on STDERR when it is invoked. That is the half a user sees.
 *   2. `deprecation-cycle.ts` lets the leaf be REMOVED once the record has
 *      served its cycle, and refuses the removal until then. That is the half
 *      a pull request sees.
 *   3. Nothing else may remove a STABLE leaf. A deletion with no record here is
 *      a red build, not a review comment.
 *
 * ── THE KEY IS THE SHAPE, AND THAT IS THE WHOLE DESIGN ──────────────────────
 *
 * A record is keyed by the leaf's `shape` from `cli-surface.generated.ts` — 12
 * hex characters of module, flags, arguments and description, WITHOUT the path.
 * Keying on the path instead would let a rename DISCHARGE a deprecation: move
 * `agent get` to `agent show`, and a path-keyed record stops naming anything
 * while the leaf it was about is still there. The shape survives the rename, so
 * the record keeps pointing at the same leaf however it is spelled.
 *
 * `path` is here as well, and it is NOT the identity — it is what the runtime
 * wires the warning onto, and what a human reads. `deprecation-cycle.ts`
 * asserts the two agree for as long as the leaf exists, so a record cannot
 * drift into naming a path that moved.
 *
 * ── WHY `announcedIn` IS THE ENFORCED FIELD AND `removeIn` IS NOT ────────────
 *
 * The contract is "no sooner than the release AFTER the one that announced it".
 * Both halves of that are checkable against `announcedIn`:
 *
 *   - the announcement SHIPPED — `announcedIn` is a released heading in
 *     `CHANGELOG.md`, and the record was captured into
 *     `cli-surface.baseline.generated.ts` at that release;
 *   - the removal lands LATER — a removal on `staging` today ships in the next
 *     release, which is strictly after the baseline's version.
 *
 * `removeIn` cannot be enforced against the release that actually ships the
 * removal, because that version does not exist yet: changesets decides it in
 * the release pull request, long after this gate has run. So `removeIn` is the
 * announced INTENT — printed in the warning, printed on `--help`, and checked
 * only for internal consistency (it must name a later release than
 * `announcedIn`). Saying that plainly is better than a check that pretends to
 * know a version number nobody has chosen yet.
 *
 * ── ADDING A RECORD ─────────────────────────────────────────────────────────
 *
 *   1. Find the leaf's row in `src/cli-surface.generated.ts`. Copy its `shape`
 *      and its `path`.
 *   2. Add a record below. `announcedIn` is the version this announcement will
 *      SHIP in — normally the next release, which means the removal itself is
 *      legal one release after that.
 *   3. Write the `CHANGELOG.md` entry, and NAME THE PATH in it. The removal gate
 *      reads that entry, not only the version heading above it.
 *   4. Regenerate the documentation. A record puts a line on the leaf's rendered
 *      `--help`, and the generated pages EMBED that text — so `content/docs/cli`
 *      goes stale and `cli-docs-are-generated.test.ts` reds until you run it:
 *
 *          pnpm exec tsx packages/cli/scripts/generate-cli-docs.ts \
 *            --out content/docs/cli/commands
 *
 *      From the REPO ROOT. That `--out` is resolved against the working
 *      directory, and the wrong one writes pages into a tree nobody reads while
 *      reporting success.
 *   5. Leave the command in place. This release announces; it does not remove.
 *
 * `src/cli-surface.generated.ts` does NOT move — the manifest records paths,
 * flags and arguments, and a deprecation changes none of them.
 *
 * Removing the leaf is a later, separate pull request. `deprecation-cycle.ts`
 * says when.
 */

/**
 * ONE ANNOUNCED REMOVAL.
 *
 * Every field is DECLARED, and that is deliberate — intent is the one thing a
 * derivation cannot supply. `cli-surface.generated.ts` can say a leaf vanished;
 * only a person can say it was meant to.
 */
export interface DeprecationRecord {
  /**
   * The leaf's rename-stable identity, copied from `cli-surface.generated.ts`.
   *
   * ⚠️ NOT GUARANTEED UNIQUE ACROSS LEAVES. The manifest's generated header
   * names every colliding group; a leaf inside one cannot be deprecated by
   * shape alone, and `deprecation-cycle.ts` refuses rather than guessing.
   */
  readonly shape: string;
  /** The path as a caller types it TODAY. Wires the warning; never the identity. */
  readonly path: string;
  /** The released version whose `CHANGELOG.md` announced this. Checked against that file. */
  readonly announcedIn: string;
  /** The earliest release this may vanish in. Announced intent — see the module docblock. */
  readonly removeIn: string;
  /** What to use instead, as a command line, or `null` when nothing replaces it. */
  readonly replacement: string | null;
  /** One sentence, for the user reading the warning. Why this is going. */
  readonly reason: string;
}

/**
 * THE DECLARED DEPRECATIONS. Empty today, and an EMPTY LIST IS A LEGITIMATE
 * STATE — a release that retires nothing is the normal release.
 *
 * 🚨 SO NOTHING MAY ASSERT THIS IS POPULATED, and no test may take its
 * behaviour from these rows. Every gate over this mechanism drives INJECTED
 * records instead, for exactly the reason `cli-surface.codegen.test.ts` drives
 * `tierOf()` on synthetic input: a rule tested only against the live tree stops
 * being tested the day the tree empties, and reads green while it does.
 */
export const DEPRECATIONS: readonly DeprecationRecord[] = [];

/** The stable half of the `--help` line and of the warning, so a gate asserts one copy. */
export const DEPRECATION_HEADING = "DEPRECATED:";

/**
 * The sentence a user gets — on `--help`, and on stderr when they invoke it.
 *
 * ONE renderer for both surfaces. Two would be two things to reword, and the
 * one that gets reworded is never the one the reader is looking at.
 */
export function deprecationNotice(record: DeprecationRecord): string {
  const replacement =
    record.replacement === null ? "Nothing replaces it." : `Use \`${record.replacement}\` instead.`;
  return (
    `${DEPRECATION_HEADING} \`nexus ${record.path}\` is going away. ` +
    `${record.reason} ${replacement} ` +
    `Announced in ${record.announcedIn}; removed in ${record.removeIn} or later.`
  );
}
