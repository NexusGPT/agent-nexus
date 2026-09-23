export interface SkillPreset {
  /** Skill name created on the agent. Also the sandbox directory name. */
  readonly name: string;
  /** Directory inside the source repo holding this skill's `SKILL.md`. */
  readonly repoPath: string;
  readonly description: string;
}

/**
 * The baseline skills a code-interpreter agent can be provisioned with, sourced
 * from Anthropic's public skills repository.
 *
 * **Fetched at run time rather than bundled into this package, deliberately.**
 * Each of these ships a `LICENSE.txt` reading "Use of these materials … is
 * governed by your agreement with Anthropic regarding use of Anthropic's
 * services" — they are Anthropic's materials, not ours to redistribute inside an
 * npm package. Fetching on demand also means `--ref` can pin or advance the
 * version without a CLI release, which matters for a set of skills that changes
 * upstream far more often than this CLI does.
 */
export const SKILL_PRESETS: Readonly<Record<string, SkillPreset>> = {
  "skill-creator": {
    name: "skill-creator",
    repoPath: "skills/skill-creator",
    description: "Design, validate, and package new Claude Code skills from inside the agent"
  },
  docx: {
    name: "docx",
    repoPath: "skills/docx",
    description: "Create, edit, and analyse Word documents"
  },
  pdf: {
    name: "pdf",
    repoPath: "skills/pdf",
    description: "Fill forms, merge, split, and extract from PDFs"
  },
  pptx: {
    name: "pptx",
    repoPath: "skills/pptx",
    description: "Build and edit PowerPoint decks"
  },
  xlsx: {
    name: "xlsx",
    repoPath: "skills/xlsx",
    description: "Read, write, and recalculate Excel workbooks"
  }
};

/** Aliases expanding to several presets. */
export const SKILL_PRESET_GROUPS: Readonly<Record<string, readonly string[]>> = {
  office: ["docx", "pdf", "pptx", "xlsx"],
  all: ["skill-creator", "docx", "pdf", "pptx", "xlsx"]
};

/** Default upstream source for the presets. */
export const DEFAULT_PRESET_REPO = "anthropics/skills";
