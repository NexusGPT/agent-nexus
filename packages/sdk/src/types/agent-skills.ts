// ============================================================================
// Agent skills — Claude Code skill bundles attached to a code-interpreter agent
// ============================================================================

/**
 * One Claude Code skill attached to an agent: a ZIP whose root holds a
 * `SKILL.md` plus its supporting files, unpacked into the agent's sandbox at
 * session start.
 */
export interface AgentSkill {
  /** Skill UUID. */
  id: string;
  /** Directory name inside the sandbox — lowercase alphanumerics and hyphens. */
  name: string;
  /** Free-text description, or null. */
  description?: string | null;
  /** Number of files in the stored bundle. */
  fileCount: number;
  /** Total uncompressed size of the bundle, in bytes. */
  sizeBytes: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt: string;
}

/** Every skill attached to one agent, plus rollups. */
export interface ListAgentSkillsResponse {
  skills: AgentSkill[];
  totalCount: number;
  totalSizeBytes: number;
}

/** Fields accepted when attaching a skill. The ZIP is passed separately. */
export interface CreateAgentSkillBody {
  /**
   * Lowercase alphanumerics and hyphens, 2–100 chars, starting and ending on an
   * alphanumeric — it becomes a directory name in the sandbox.
   */
  name: string;
  description?: string;
}

/** At least one field is required. */
export interface UpdateAgentSkillBody {
  name?: string;
  description?: string;
}

/** Result of replacing a skill's bundle. */
export interface UploadAgentSkillZipResponse {
  id: string;
  fileCount: number;
  sizeBytes: number;
  updatedAt: string;
}

/** Short-lived presigned URL for a skill's ZIP. */
export interface AgentSkillDownloadUrl {
  url: string;
}

/** Result of removing a skill from an agent. */
export interface DeleteAgentSkillResponse {
  success: boolean;
  message: string;
}
