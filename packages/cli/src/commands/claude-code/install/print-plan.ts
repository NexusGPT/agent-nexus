import { color } from "../../../output";
import { describeCorpus } from "../../../skills-corpus/command";
import type { PlatformIo } from "../../../skills-corpus/platform";
import type { ResolvedCorpus } from "../../../skills-corpus/resolve";
import type { ClaudeTarget } from "../../../util/claude-target";
import type { InstallPlan } from "./build-plan";

/** The human-readable plan, printed before anything is written. */
export function printInstallPlan(
  plan: InstallPlan,
  target: ClaudeTarget,
  resolved: ResolvedCorpus,
  io: PlatformIo
): void {
  const { selected } = plan;
  console.log(color.dim(describeCorpus(resolved, io)));
  console.log(
    color.bold(
      `\nInstalling ${selected.length} Claude Code skill${selected.length === 1 ? "" : "s"} to ${target.skillsDir}\n`
    )
  );
  for (const skill of plan.skillInstallables) {
    console.log(
      `  ${color.cyan(skill.slug.padEnd(32))} ${color.dim(`${skill.files.length} files`)}`
    );
  }
  if (plan.installClaudeMd) {
    console.log(`  ${color.cyan("CLAUDE.md".padEnd(32))} ${color.dim(`→ ${target.claudeMdPath}`)}`);
  }
  if (plan.installSettings) {
    console.log(
      `  ${color.cyan("settings.json".padEnd(32))} ${color.dim(`→ ${target.settingsJsonPath}`)}`
    );
    console.log(
      `  ${color.cyan("hooks".padEnd(32))} ${color.dim(`${plan.hooks.files.length} files → ${target.hooksDir}`)}`
    );
  }
  if (plan.installAgents) {
    console.log(
      `  ${color.cyan("agents".padEnd(32))} ${color.dim(`${plan.agents.files.length} files → ${target.agentsDir}`)}`
    );
  }
  if (plan.settingsSkippedForGlobal) {
    console.log(
      color.yellow(
        `  settings.json + hooks skipped — the permission posture is project-scoped ` +
          `(its hooks resolve via $CLAUDE_PROJECT_DIR). Install it per-project, not with --global.`
      )
    );
  }
  console.log();
}
