import type { BaselineLeaf, SurfaceBaseline } from "./cli-surface.baseline.model";
import type { SurfaceTier } from "./cli-surface.model";
import type { DeprecationRecord } from "./deprecations";

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
 */

/** What happened to a path the last release promised. */
export type RemovalVerdict = "present" | "aliased" | "moved" | "removed";

/** One baseline path, and what became of it. */
export interface RemovalFinding {
  /** The path as the last release shipped it. */
  readonly path: string;
  /** The tier that governed it AT THAT RELEASE. Never recomputed — see the docblock. */
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
  /** `CHANGELOG.md` split by released heading — see {@link changelogSections}. */
  readonly changelog: ReadonlyMap<string, string>;
}

/** `x.y.z` and nothing else. A version this cannot parse is refused, never guessed at. */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * DOES THIS CHANGELOG ENTRY ANNOUNCE **THIS** COMMAND?
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * `entry.includes(path)` IS WRONG, AND IT IS WRONG IN THE PERMISSIVE DIRECTION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 A COMMAND PATH IS A PREFIX AND A SUFFIX OF OTHER COMMAND PATHS. A bare
 * substring test spends a cycle on an entry that announced a DIFFERENT leaf:
 *
 *   `agent list-templates`   contains `agent list`
 *   `workflow agent list`    contains `agent list`
 *   `agent list templates`   contains `agent list`
 *
 * Each of those is a real announcement of a real command, and none of them says
 * anything about `agent list` — so each would discharge a deprecation nobody
 * announced. That is the whole gate walked around by a coincidence of spelling.
 *
 * ── THE ANCHOR, AND WHY IT IS THE CODE SPAN ─────────────────────────────────
 *
 * `CHANGELOG.md` names a command inside a code span, with or without the binary
 * name: `` `agent delete` ``, `` `nexus customer delete <id> | tee log` ``. So a
 * match must START the span — optionally after `nexus ` — which is what rules
 * out `workflow agent list`. And it must END the span or be followed by a FLAG
 * or an ARGUMENT PLACEHOLDER, which is what rules out both `list-templates`
 * (no space before the hyphen) and a further subcommand.
 *
 * ⚠️ A mention in plain prose, with no code span, does NOT count. That is
 * stricter than a human reader would be, and it is deliberate: every command
 * named in this package's changelog is already backticked, and the refusal
 * message says exactly what to write. A gate whose input is our own file, edited
 * by the same person adding the record, can afford to ask for one convention.
 */
export function changelogAnnounces(entry: string, path: string): boolean {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // ── `  or  `nexus     then the path, then the end of the span or a flag/arg.
  return new RegExp("`(?:nexus )?" + escaped + "(?=`| +[-<\\[])").test(entry);
}

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

/** Paths grouped by identity, so a collision is visible rather than assumed away. */
function byShape(leaves: readonly BaselineLeaf[]): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>();
  for (const leaf of leaves) {
    const group = index.get(leaf.shape);
    if (group === undefined) index.set(leaf.shape, [leaf.path]);
    else group.push(leaf.path);
  }
  return index;
}

/** The single record for a shape, or `null` when there are none — or more than one. */
function soleRecord(
  records: readonly DeprecationRecord[],
  shape: string
): DeprecationRecord | null {
  const matches = records.filter((record) => record.shape === shape);
  return matches.length === 1 ? matches[0] : null;
}

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
function cycleUnserved(
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

/** Whether a tier owes a cycle at all. Transcribed from COMPATIBILITY.md. */
const OWES_A_CYCLE: Readonly<Record<SurfaceTier, boolean>> = {
  // "removing a command … is a break", and a break ships announced.
  STABLE: true,
  // "These may change in any release, without a changelog entry."
  UNSTABLE: false,
  // "No promise. … we will change them without telling anyone."
  INTERNAL: false
};

/** The sentence for a tier that owes nothing, so a green verdict still says why. */
const NO_PROMISE: Readonly<Record<SurfaceTier, string>> = {
  STABLE: "",
  UNSTABLE: "UNSTABLE — COMPATIBILITY.md permits a change in any release, without notice.",
  INTERNAL: "INTERNAL — COMPATIBILITY.md makes no promise about this leaf at all."
};

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

    // `moved` is only offered when the identity is unambiguous on BOTH sides. A
    // shape shared by several leaves cannot say which one turned up where, and
    // guessing would report a removal as a rename — the direction that lets a
    // break through.
    const here = baselineByShape.get(leaf.shape) ?? [];
    const there = currentByShape.get(leaf.shape) ?? [];
    const moved = here.length === 1 && there.length === 1 ? there[0] : null;

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
  });
}

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
    const at = (problem: string): void => {
      violations.push({ shape: record.shape, path: record.path, problem });
    };

    seen.set(record.shape, (seen.get(record.shape) ?? 0) + 1);

    for (const [field, value] of [
      ["announcedIn", record.announcedIn],
      ["removeIn", record.removeIn]
    ] as const) {
      if (!SEMVER.test(value)) at(`${field} is ${JSON.stringify(value)}, which is not x.y.z.`);
    }

    const cycleLength = compareVersions(record.removeIn, record.announcedIn);
    if (cycleLength !== null && cycleLength <= 0) {
      at(
        `removeIn ${record.removeIn} is not after announcedIn ${record.announcedIn}. ` +
          `A cycle is at least one release long.`
      );
    }

    // A record written TODAY normally names the release it is about to ship in,
    // which has no heading yet — that is the ordinary state and not a defect.
    // Once the heading exists, the ENTRY has to name the path, because that is
    // the announcement the removal gate later spends.
    const entry = input.changelog.get(record.announcedIn);
    if (entry !== undefined && !changelogAnnounces(entry, record.path)) {
      at(
        `the CHANGELOG.md entry for ${record.announcedIn} never announces ` +
          `\`${record.path}\`. Say what a script loses, by name, in a code span — the ` +
          `removal gate reads that entry, not only the heading above it, and a path ` +
          `that merely appears inside a LONGER command does not count.`
      );
    }

    const live = currentByShape.get(record.shape) ?? [];
    if (live.length > 1) {
      at(
        `shape ${record.shape} is shared by ${live.length} leaves (${live.join(", ")}), so ` +
          `a record cannot name one of them. Give the leaf a distinguishing description ` +
          `or flag first — the manifest's header lists every collision group.`
      );
    } else if (live.length === 1 && live[0] !== record.path) {
      at(
        `the record says \`${record.path}\` and the leaf with this shape is now ` +
          `\`${live[0]}\`. The runtime warning is wired onto the path, so it is ` +
          `currently attached to nothing. Update the path; the shape is the identity ` +
          `and does not change.`
      );
    } else if (live.length === 0 && !baselineShapes.has(record.shape)) {
      at(
        `this record names nothing: the leaf is absent from the surface AND from the ` +
          `baseline at ${input.baseline.version}, so its removal has already shipped. ` +
          `Delete the record.`
      );
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

/**
 * `CHANGELOG.md` split into one entry per released version.
 *
 * The body runs from a `## x.y.z` heading to the next one, so the section for a
 * version is exactly what that release told its readers. A heading with no
 * section under it maps to the empty string rather than being absent — an empty
 * entry and a missing version are different facts and the caller says different
 * things about them.
 */
export function changelogSections(changelog: string): ReadonlyMap<string, string> {
  const sections = new Map<string, string>();
  const headings = [...changelog.matchAll(/^## +(\d+\.\d+\.\d+)[^\n]*$/gm)];

  headings.forEach((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end =
      index + 1 < headings.length
        ? (headings[index + 1].index ?? changelog.length)
        : changelog.length;
    sections.set(heading[1], changelog.slice(start, end));
  });

  return sections;
}

/**
 * Build the next baseline from a projected surface. Pure — the refusal lives in
 * the caller.
 *
 * 🚨 A RECORD IS CARRIED FORWARD ONLY WHILE ITS LEAF IS STILL PROMISED, AND
 * DROPPING THAT FILTER DEADLOCKS THE RELEASE AFTER EVERY SUCCESSFUL REMOVAL.
 *
 * Carrying every declared record would re-capture the TOMBSTONE of a leaf that
 * has just been removed. Then: `auditDeprecationRecords` demands the spent record
 * be deleted, because its shape is in neither the surface nor the baseline's
 * leaves — and deleting it makes the committed baseline disagree with this
 * function, while keeping it leaves a permanent violation. Neither order reaches
 * a green tree.
 *
 * A deprecation set is a statement about leaves this baseline PROMISES. A record
 * whose leaf is gone has been spent; it is not re-promised, and the hygiene rule
 * then asks for its deletion exactly once, at the one moment deleting it is safe.
 */
export function nextBaseline(input: {
  readonly version: string;
  readonly leaves: readonly BaselineLeaf[];
  readonly records: readonly DeprecationRecord[];
}): SurfaceBaseline {
  const promised = new Set(input.leaves.map((leaf) => leaf.shape));

  return {
    version: input.version,
    leaves: [...input.leaves]
      .map((leaf) => ({ path: leaf.path, shape: leaf.shape, tier: leaf.tier }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    deprecations: [
      ...new Set(input.records.map((record) => record.shape).filter((shape) => promised.has(shape)))
    ].sort()
  };
}

/** Pad a section heading out to the 79th column, as every other header here does. */
function rule(label: string): string {
  return "\u2500".repeat(Math.max(3, 79 - " * -- THE SURFACE AT  ".length - label.length));
}

/** The generated module's text. One function, so the writer and its gate share it. */
export function renderBaselineModule(baseline: SurfaceBaseline): string {
  const tiers = new Map<string, number>();
  for (const leaf of baseline.leaves) tiers.set(leaf.tier, (tiers.get(leaf.tier) ?? 0) + 1);
  const tally = [...tiers.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tier, count]) => `${count} ${tier}`)
    .join(", ");

  return `import type { SurfaceBaseline } from "./cli-surface.baseline.model";

/**
 * GENERATED by \`scripts/generate-cli-surface-baseline.ts\`. DO NOT EDIT.
 *
 * THE PUBLIC SURFACE OF THE LAST RELEASED \`nexus\` BINARY. It is what
 * \`deprecation-cycle.test.ts\` compares the working tree against, so that a leaf
 * cannot stop answering without either an alias or a served deprecation cycle.
 *
 * Regenerate it AT A RELEASE, never during ordinary work — the generator
 * refuses to drop a leaf whose cycle has not been served, which is the mechanism
 * rather than a convention. See \`cli-surface.baseline.model.ts\` for what each
 * field is for and for the one thing this file cannot defend against.
 *
 * ── THE SURFACE AT ${baseline.version} ${rule(baseline.version)}
 *
 * ${baseline.leaves.length} promised paths — ${tally}.
 * ${baseline.deprecations.length} declared deprecation${baseline.deprecations.length === 1 ? "" : "s"} carried into this release.
 */
export const CLI_SURFACE_BASELINE: SurfaceBaseline = {
  version: ${JSON.stringify(baseline.version)},
  leaves: [
${baseline.leaves
  .map(
    (leaf) =>
      `    { path: ${JSON.stringify(leaf.path)}, shape: ${JSON.stringify(leaf.shape)}, tier: ${JSON.stringify(leaf.tier)} }`
  )
  .join(",\n")}
  ],
  deprecations: [${baseline.deprecations.length === 0 ? "" : `\n${baseline.deprecations.map((shape) => `    ${JSON.stringify(shape)}`).join(",\n")}\n  `}]
};
`;
}
