import {
  BUNDLED_SKILL_PREFIX,
  NON_SKILL_DIRS,
  type SkillDirSelection,
  type SkillsRootEntry
} from "./select-skill-dirs.declarations";

/**
 * Partition the top level of `skills/` into every category, with nothing
 * falling off the end. `bundled + consumedElsewhere + skipped + nonDirectories`
 * accounts for every entry handed in; `missingDeclared` is the one field that
 * describes an absence rather than an entry.
 *
 * The partition is TOTAL on purpose. A classifier that only collected the
 * entries it recognised would have no category for the one case this whole
 * module exists to surface — a directory matched by nothing — so there would be
 * nothing for the reporter to warn about.
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
