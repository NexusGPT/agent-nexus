import type { Command } from "commander";

import { platformIo, resolveCorpusForCommand, withCorpusFlags } from "../../skills-corpus/command";
import { confirmable } from "../../util/confirm";
import { refusedBeforeCorpus } from "./_shared/refused-before-corpus";
import type { SkillsInstallOpts } from "./_shared/skills-install.types";
import { CLAUDE_CODE_INSTALL_NOTES } from "./copy/install-notes";
import { runSkillsInstall } from "./install/run-install";

/**
 * `nexus claude-code install`
 *
 * Writes the selected skills from the corpus `resolveCorpusForCommand` picks:
 * the platform's latest by default, the bundle compiled into this CLI as the
 * fallback. No API key either way (NEX-5177).
 *
 * This is the original entry point; `nexus skills update` (skills.ts) wraps
 * the same machinery with project-root auto-detection. Kept for back-compat.
 */
export function registerClaudeCodeInstallCommand(cc: Command): void {
  withCorpusFlags(confirmable(cc.command("install")))
    .description("Install the Nexus Claude Code skills into your project")
    .argument("[skills...]", "Skill slugs to install (omit for all)")
    .option("--dir <path>", "Target directory", ".claude/skills")
    .option("--force", "Replace files this CLI did not write (see Notes) without prompting")
    .option("--dry-run", "Show what would be installed without writing")
    .option("--no-claude-md", "Skip writing the CLAUDE.md system prompt to the project root")
    .option(
      "--no-settings",
      "Skip writing .claude/settings.json + .claude/hooks (permission posture)"
    )
    .addHelpText("after", CLAUDE_CODE_INSTALL_NOTES)
    .action(
      async (
        skillArgs: string[],
        opts: SkillsInstallOpts & { dir: string; bundled?: boolean; skillsRef?: string },
        command: Command
      ) => {
        if (await refusedBeforeCorpus(opts)) return;
        const io = platformIo(command);
        const resolved = await resolveCorpusForCommand(opts, io);
        if (!resolved) return;
        await runSkillsInstall(skillArgs, opts, resolved, io);
      }
    );
}
