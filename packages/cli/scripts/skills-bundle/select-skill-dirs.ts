/**
 * Decide which top-level entries under the upstream `skills/` tree get bundled,
 * and SAY OUT LOUD what the decision left behind.
 *
 * ## The hole this closes
 *
 * `bundle-skills.ts` selected skill directories with
 * `d.name.startsWith("nexus-")` and printed `Found N skill directories`. That
 * line is TRUE about the N it kept and says nothing whatever about what it
 * dropped, so a directory added upstream that does not match the prefix is
 * collected by nothing, installed for nobody, and mentioned in no log, forever.
 *
 * That is exactly what happened. Upstream gained `skills/plain/` between
 * `d28e9180e301d351608b3e2bc87d667a23db39fd` and
 * `bc52b93c42b6d9cda80746e5ef43856984d96c57`. Nothing here noticed, and nothing
 * here COULD: it was found only because a reader predicted a bundled-surface
 * count from the upstream tree, measured one fewer, and chased the difference.
 *
 * The defect is not the skip. A skip can be correct. The defect is that a
 * correct skip and a silent regression were the same output.
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
 * behaviour by choosing a name, with nobody here deciding anything. The
 * declaration below classifies by an entry somebody wrote on purpose, and an
 * undeclared name is REPORTED rather than absorbed. Same argument
 * `skills-bundle-drift.yml` makes in its own header about naming a directory
 * instead of a file: a rule that can fall behind its own contents in silence is
 * the rule that eventually does.
 *
 * ## Why this WARNS and does not fail the build
 *
 * `scripts/postinstall.sh` step 4 runs `pnpm run gen:skills` on every install,
 * through `run_step … || exit 1`, and `tryResolveToken()` in `bundle-skills.ts`
 * falls back to `gh auth token` — so on a developer machine with gh-cli authed,
 * `pnpm install` really does execute this code path against the real upstream
 * tree. A hard failure on an undeclared directory would therefore break
 * `pnpm install`, in every worktree at once, caused by a commit in a DIFFERENT
 * repository that nobody here made and nobody here can revert. A gate that
 * breaks a correct tree for somebody else's commit is uninstalled within a day,
 * and then the silence is back with the gate's name still on it.
 *
 * The loud line costs nothing and is read by the one person who can act on it:
 * whoever just ran `gen:skills` in order to bump the pin.
 *
 * ## Why the report is emitted from INSIDE the selector
 *
 * `selectSkillDirs` reports and returns in one call, so there is no way to
 * obtain the bundled list without the report being emitted. Reporting from the
 * caller would leave one deletable line between the classification and the
 * warning — which is the shape the original defect already had.
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

/**
 * Partition the top level of `skills/` into every category, with nothing
 * falling off the end. `bundled + consumedElsewhere + skipped + nonDirectories`
 * accounts for every entry handed in; `missingDeclared` is the one field that
 * describes an absence rather than an entry.
 */
export function classifySkillsRoot(entries: readonly SkillsRootEntry[]): SkillDirSelection {
  const bundled: string[] = [];
  const consumedElsewhere: string[] = [];
  const skipped: string[] = [];
  const nonDirectories: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      nonDirectories.push(entry.name);
      continue;
    }
    if (entry.name.startsWith(BUNDLED_SKILL_PREFIX)) {
      bundled.push(entry.name);
    } else if (Object.prototype.hasOwnProperty.call(NON_SKILL_DIRS, entry.name)) {
      consumedElsewhere.push(entry.name);
    } else {
      skipped.push(entry.name);
    }
  }

  const present = new Set(consumedElsewhere);
  const missingDeclared = Object.keys(NON_SKILL_DIRS).filter((name) => !present.has(name));

  return {
    bundled: bundled.sort(),
    consumedElsewhere: consumedElsewhere.sort(),
    missingDeclared: missingDeclared.sort(),
    skipped: skipped.sort(),
    nonDirectories: nonDirectories.sort()
  };
}

/**
 * Render the selection as report lines.
 *
 * Every category emits EXACTLY ONE line whether or not it has members, because
 * "nothing was skipped" and "the skip reporting stopped working" reaching the
 * same empty output is the defect this whole file exists to remove. The names
 * are always printed; a count alone is what the old `Found N skill directories`
 * already was.
 */
export function formatSkillDirReport(selection: SkillDirSelection): {
  log: string[];
  warn: string[];
} {
  const log: string[] = [
    `Found ${selection.bundled.length} skill directories under skills/ ` +
      `(name starts with "${BUNDLED_SKILL_PREFIX}")`
  ];
  const warn: string[] = [];

  log.push(
    selection.consumedElsewhere.length === 0
      ? `  not bundled as skills but consumed elsewhere: none`
      : `  not bundled as skills but consumed elsewhere: ${selection.consumedElsewhere
          .map((name) => `skills/${name}/ (${NON_SKILL_DIRS[name]})`)
          .join("; ")}`
  );

  log.push(
    selection.nonDirectories.length === 0
      ? `  non-directory entries at the top level of skills/: none`
      : `  non-directory entries at the top level of skills/, never bundled: ${selection.nonDirectories
          .map((name) => `skills/${name}`)
          .join(", ")}`
  );

  if (selection.skipped.length === 0) {
    log.push(
      `  SKIPPED NOTHING: every directory under skills/ is either bundled or declared ` +
        `in NON_SKILL_DIRS.`
    );
  } else {
    warn.push(
      `⚠️  SKIPPED ${selection.skipped.length} top-level ` +
        `director${selection.skipped.length === 1 ? "y" : "ies"} under skills/ — ` +
        `bundled by nothing, installed for nobody:\n` +
        selection.skipped.map((name) => `      skills/${name}/`).join("\n") +
        `\n    Not matched by the "${BUNDLED_SKILL_PREFIX}" prefix and not declared in ` +
        `NON_SKILL_DIRS\n` +
        `    (packages/cli/scripts/skills-bundle/select-skill-dirs.ts).\n` +
        `    Decide: rename it upstream, declare it there with the reason it must not ship, ` +
        `or widen\n` +
        `    the selector. This warning is not the problem — it is the first time anyone ` +
        `has been told.`
    );
  }

  if (selection.missingDeclared.length > 0) {
    warn.push(
      `⚠️  DECLARED BUT ABSENT upstream: ` +
        selection.missingDeclared.map((name) => `skills/${name}/`).join(", ") +
        `\n    NON_SKILL_DIRS says the generator consumes ${
          selection.missingDeclared.length === 1 ? "it" : "them"
        } elsewhere, and ` +
        `the directory is not there.\n` +
        `    Whatever collects it is collecting nothing, and collectFiles() returns [] for a ` +
        `missing\n    directory rather than failing. Check whether it was renamed upstream.`
    );
  }

  return { log, warn };
}

/**
 * Classify, report, and return the directories to bundle.
 *
 * Reporting is not separable from selection on purpose — see this file's
 * header. A caller cannot obtain the list without emitting the report.
 */
export function selectSkillDirs(entries: readonly SkillsRootEntry[], io: SelectionIo): string[] {
  const selection = classifySkillsRoot(entries);
  const report = formatSkillDirReport(selection);
  for (const line of report.log) io.log(line);
  for (const line of report.warn) io.warn(line);
  return selection.bundled;
}
