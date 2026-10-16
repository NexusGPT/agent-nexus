/**
 * What `skills/` may contain, and what a reader of the selection gets back.
 *
 * Every value here is a DECLARATION — a decision somebody wrote on purpose —
 * which is why they sit in a leaf of their own with no imports. The classifier
 * and the reporter both read them, and neither may re-derive one.
 *
 * ## Why the prefix is not, on its own, a decision
 *
 * The filter arrived with the first version of the generator (51d722bd5b), in a
 * multi-purpose commit that never mentions it, with no comment beside it and no
 * doc anywhere. At that moment every directory under `skills/` except `shared`
 * began with `nexus-`, and `shared` is collected two blocks later by its own
 * call. So the only thing the prefix has ever actually excluded is `shared` —
 * a directory the generator consumes anyway.
 *
 * A prefix classifies by NAME, which means upstream changes this repository's
 * behaviour by choosing a name, with nobody here deciding anything.
 * `NON_SKILL_DIRS` classifies by an entry somebody wrote on purpose, and an
 * undeclared name is REPORTED rather than absorbed. Same argument
 * `skills-bundle-drift.yml` makes in its own header about naming a directory
 * instead of a file: a rule that can fall behind its own contents in silence is
 * the rule that eventually does.
 */

/** The prefix every bundled skill directory carries upstream. */
export const BUNDLED_SKILL_PREFIX = "nexus-";

/**
 * The `skills/shared/` directory, named once so the declaration below and the
 * generator's own `collectFiles(path.join(skillsRoot, SHARED_DIR))` cannot
 * drift apart into "declared as consumed" and "no longer consumed".
 */
export const SHARED_DIR = "shared";

/**
 * Top-level directories under `skills/` that are deliberately NOT bundled as
 * skills, each with the reason it is not.
 *
 * A name here is a decision. A name absent from here and absent from the
 * prefix is a QUESTION, and `selectSkillDirs` asks it on stderr rather than
 * answering it silently.
 *
 * `skills/plain/` is deliberately NOT listed. Nothing establishes why it should
 * or should not ship — upstream's own exclusion mechanism (the `EXCLUDES` list
 * in `skills/shared/scripts/mirror-sync.sh`, which withholds `cue-retro` and
 * `hook-development` from the mirror) was NOT applied to it, so it reached the
 * mirror on purpose while reaching no user of this CLI by accident. Inventing a
 * reason to silence the warning would put this file back in the business the
 * prefix was already in: deciding by default. It stays reported until somebody
 * decides.
 */
export const NON_SKILL_DIRS: Readonly<Record<string, string>> = {
  [SHARED_DIR]:
    "collected separately into SHARED_FILES by the generator, and installed alongside " +
    "the skills rather than as one of them"
};

/** The shape of a `fs.readdirSync(dir, { withFileTypes: true })` entry, narrowed to what is read. */
export interface SkillsRootEntry {
  readonly name: string;
  isDirectory(): boolean;
}

export interface SkillDirSelection {
  /** Directories that will be bundled as skills, sorted. */
  readonly bundled: string[];
  /** Directories present upstream and declared in `NON_SKILL_DIRS`, sorted. */
  readonly consumedElsewhere: string[];
  /** Names declared in `NON_SKILL_DIRS` that are ABSENT upstream, sorted. */
  readonly missingDeclared: string[];
  /** Directories present upstream, not bundled and not declared — these reach nobody. */
  readonly skipped: string[];
  /** Non-directory entries at the top level of `skills/`, sorted. Never bundled. */
  readonly nonDirectories: string[];
}

/** Where a selection report is written. Injected so a test can read it back. */
export interface SelectionIo {
  log: (message: string) => void;
  warn: (message: string) => void;
}
