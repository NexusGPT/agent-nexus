import {
  BUNDLED_SKILL_PREFIX,
  NON_SKILL_DIRS,
  type SkillDirSelection
} from "./select-skill-dirs.declarations";

/**
 * Render the selection as report lines.
 *
 * Every category emits EXACTLY ONE line whether or not it has members, because
 * "nothing was skipped" and "the skip reporting stopped working" reaching the
 * same empty output is the defect this whole module exists to remove. The names
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
        `    (packages/cli/src/skills-corpus/select-skill-dirs.declarations.ts).\n` +
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
