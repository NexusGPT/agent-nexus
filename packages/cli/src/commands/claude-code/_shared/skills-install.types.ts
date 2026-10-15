/**
 * The option bag both entry points into the skills installer share.
 *
 * `nexus claude-code install` passes its own flags; `nexus skills update`
 * (commands/skills.ts) passes its own and resolves the target itself. Declaring
 * it once is what keeps the two from drifting into two slightly different
 * installs.
 */
export interface SkillsInstallOpts {
  dir?: string;
  global?: boolean;
  here?: boolean;
  force?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  claudeMd?: boolean;
  /** When false (`--no-settings`), skip .claude/settings.json + .claude/hooks. */
  settings?: boolean;
}
