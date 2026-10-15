import { Command } from "commander";

import { registerClaudeCodeInstallCommand } from "./claude-code/install.command";
import { registerClaudeCodeListCommand } from "./claude-code/list.command";

export function registerClaudeCodeCommands(program: Command): void {
  const cc = program
    .command("claude-code")
    .description("Install the Nexus Claude Code skills into your project");

  registerClaudeCodeListCommand(cc);
  registerClaudeCodeInstallCommand(cc);
}

// ── The shared install machinery, re-exported from where it has always lived ──
//
// 🔴 THIS MODULE IS TWO THINGS AND ALWAYS WAS: a registrar for `nexus
// claude-code`, and the install runner `nexus skills update` drives. The runner
// is not a subcommand of anything, so it did not move to a `*.command.ts` — it
// now lives under `claude-code/install/` and `claude-code/_shared/`, and these
// re-exports are what keep `commands/skills.ts` and any other importer pointed
// at the same names.
export { refusedBeforeCorpus } from "./claude-code/_shared/refused-before-corpus";
export type { SkillsInstallOpts } from "./claude-code/_shared/skills-install.types";
export { runSkillsInstall, runSkillsInstallToTarget } from "./claude-code/install/run-install";

// Re-exported for back-compat with any importer expecting these here.
export type { InstallableSkill } from "../util/skills-install.installable";
