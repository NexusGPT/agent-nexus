import { refuse } from "../../../errors";
import type { SkillsCorpus } from "../../../skills-corpus/corpus";

/**
 * Narrow the corpus to the slugs the caller named, or refuse naming every slug
 * the corpus holds.
 *
 * 🚨 `undefined` MEANS REFUSED AND THE EXIT CODE IS ALREADY SET, never "no
 * selection". An empty array is not a legal answer here: a caller that named
 * nothing gets the whole `skillList` back, so a zero-length result could only
 * come from a corpus with no skills in it — a different fact, reported
 * elsewhere.
 *
 * The ORDER is the corpus's own, not the caller's argument order, so two
 * installs naming the same skills differently write the same files in the same
 * sequence.
 */
export function selectSlugs(
  skillArgs: string[],
  corpus: SkillsCorpus
): readonly string[] | undefined {
  const availableSlugs = new Set(corpus.skillList);
  if (skillArgs.length === 0) return corpus.skillList;

  const unknown = skillArgs.filter((s) => !availableSlugs.has(s));
  if (unknown.length > 0) {
    process.exitCode = refuse(
      `Unknown skill${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.\n\n` +
        `Available skills in skills commit ${corpus.commitSha.slice(0, 12)}:\n` +
        [...availableSlugs]
          .sort()
          .map((s) => `  ${s}`)
          .join("\n")
    );
    return undefined;
  }
  const requested = new Set(skillArgs);
  return corpus.skillList.filter((s) => requested.has(s));
}
