import {
  getAgentFiles,
  getClaudeMd,
  getHookFiles,
  getSettingsJson,
  getSharedFiles,
  getSkillList,
  getSkills,
  type SkillEntry,
  type SkillFile,
  SKILLS_NEXUS_SHA
} from "../skills-content.generated";

/**
 * Everything one install writes, from one skills commit.
 *
 * Two sources produce it: the corpus bundled into this CLI at build time, and
 * the latest corpus the platform serves. They go through the same selection
 * (`buildCorpusFromFiles`), so the same commit installs the same files whichever
 * one it came from.
 */
export interface SkillsCorpus {
  /** The skills repository commit these files were cut from. */
  readonly commitSha: string;
  readonly skills: Readonly<Record<string, SkillEntry>>;
  /** Every installable skill slug, sorted. */
  readonly skillList: readonly string[];
  readonly claudeMd: string;
  readonly sharedFiles: readonly SkillFile[];
  readonly settingsJson: string;
  readonly hookFiles: readonly SkillFile[];
  readonly agentFiles: readonly SkillFile[];
}

/** The corpus compiled into this CLI. Read lazily, like the payload it wraps. */
export function bundledCorpus(): SkillsCorpus {
  return {
    commitSha: SKILLS_NEXUS_SHA,
    skills: getSkills(),
    skillList: getSkillList(),
    claudeMd: getClaudeMd(),
    sharedFiles: getSharedFiles(),
    settingsJson: getSettingsJson(),
    hookFiles: getHookFiles(),
    agentFiles: getAgentFiles()
  };
}
