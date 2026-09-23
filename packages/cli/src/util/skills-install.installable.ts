import type { SkillEntry, SkillFile } from "../skills-content.generated";
import type { SkillsCorpus } from "../skills-corpus/corpus";

export interface InstallableSkill {
  slug: string;
  files: { path: string; content: Buffer }[];
}

// Every builder below takes the corpus it reads, and none has a default. The
// corpus is either the one bundled into this CLI or the one the platform served
// (`skills-corpus/resolve.ts`), and one install must read every file from the
// SAME one: a builder that fell back to the bundle on its own would mix two
// commits into one tree with nothing to notice it.
//
// The corpus stores file contents as UTF-8 strings and `writeSkillFiles` writes
// raw buffers, so the round-trip is lossless exactly while every file is valid
// UTF-8. Both sources enforce that before a corpus exists: `bundle-skills.ts`
// fails the build, and the platform refuses the upload.
function corpusTreeToInstallable(slug: string, files: readonly SkillFile[]): InstallableSkill {
  return {
    slug,
    files: files.map((f) => ({
      path: f.path,
      content: Buffer.from(f.content, "utf-8")
    }))
  };
}

/**
 * Convert the corpus into the byte-shaped form `writeSkillFiles` expects,
 * for the skills the user selected.
 */
export function bundleToInstallables(
  corpus: SkillsCorpus,
  slugs: readonly string[]
): InstallableSkill[] {
  return slugs.map((slug) => {
    const entry: SkillEntry = corpus.skills[slug];
    return corpusTreeToInstallable(entry.slug, entry.files);
  });
}

/**
 * The `shared/` directory holds the api-client + helpers every skill's example
 * scripts import via `../../shared/...`. It ships alongside the skills under
 * `.claude/skills/shared` whenever any skill is installed, otherwise those
 * imports dangle.
 */
export function sharedInstallable(corpus: SkillsCorpus): InstallableSkill {
  return corpusTreeToInstallable("shared", corpus.sharedFiles);
}

/**
 * The `hooks/` tree (Python firewall + lifecycle scripts, their `lib/`, and
 * docs) that `settings.json` invokes. Namespaced under `.claude/hooks`, so —
 * like the skill files — it is Nexus-owned and refreshed in place on every
 * install rather than preserved.
 */
export function hookInstallables(corpus: SkillsCorpus): InstallableSkill {
  return corpusTreeToInstallable("hooks", corpus.hookFiles);
}

/**
 * The `agents/` tree — the Nexus-owned subagent definitions (flat `.md` files
 * Claude Code auto-discovers under `.claude/agents`). Like the skill files they
 * are Nexus-owned and refreshed in place on every install rather than
 * preserved. Unlike settings.json + hooks, they resolve fine at any scope, so
 * they install for both project and `--global` targets.
 */
export function agentInstallables(corpus: SkillsCorpus): InstallableSkill {
  return corpusTreeToInstallable("agents", corpus.agentFiles);
}
