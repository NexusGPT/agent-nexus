import { color, isJsonMode } from "../../../output";
import { corpusJson } from "../../../skills-corpus/command";
import type { ResolvedCorpus } from "../../../skills-corpus/resolve";
import type { ClaudeTarget } from "../../../util/claude-target";
import type { InstallPlan } from "./build-plan";

/** `--dry-run`: report what WOULD be written, and write nothing. */
export function printDryRun(
  plan: InstallPlan,
  target: ClaudeTarget,
  resolved: ResolvedCorpus
): void {
  if (!isJsonMode()) {
    console.log(color.dim(`Dry run — ${plan.totalFiles} files would be written. No changes made.`));
    return;
  }
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        skills: plan.selected.map((s) => s.slug),
        shared: plan.shared.files.length,
        claudeMd: plan.installClaudeMd ? target.claudeMdPath : null,
        settings: plan.installSettings ? target.settingsJsonPath : null,
        hooks: plan.installSettings
          ? { dir: target.hooksDir, files: plan.hooks.files.length }
          : null,
        agents: plan.installAgents
          ? { dir: target.agentsDir, files: plan.agents.files.length }
          : null,
        settingsSkippedForGlobal: plan.settingsSkippedForGlobal,
        directory: target.skillsDir,
        targetReason: target.reason,
        fileCount: plan.totalFiles,
        corpus: corpusJson(resolved)
      },
      null,
      2
    )
  );
}
