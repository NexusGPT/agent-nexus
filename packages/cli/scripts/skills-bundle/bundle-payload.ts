import type { SkillEntry, SkillFile } from "../../src/skills-content.generated";
import type { SkillsCorpus } from "../../src/skills-corpus/corpus";

/**
 * The document `bundle-skills.ts` writes to `skills-content.generated.json`, and
 * the generated module parses back. Field names are the asset's wire format:
 * renaming one strands every committed bundle.
 */
export interface BundlePayload {
  sha: string;
  SKILLS: Record<string, SkillEntry>;
  SKILL_LIST: string[];
  CLAUDE_MD: string;
  SHARED_FILES: SkillFile[];
  SETTINGS_JSON: string;
  HOOK_FILES: SkillFile[];
  AGENT_FILES: SkillFile[];
}

/** One corpus, in the asset's shape. */
export function toBundlePayload(corpus: SkillsCorpus): BundlePayload {
  return {
    sha: corpus.commitSha,
    SKILLS: { ...corpus.skills },
    SKILL_LIST: [...corpus.skillList],
    CLAUDE_MD: corpus.claudeMd,
    SHARED_FILES: [...corpus.sharedFiles],
    SETTINGS_JSON: corpus.settingsJson,
    HOOK_FILES: [...corpus.hookFiles],
    AGENT_FILES: [...corpus.agentFiles]
  };
}
