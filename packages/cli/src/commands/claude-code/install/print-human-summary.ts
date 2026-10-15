import { color, printSuccess } from "../../../output";
import type { SkillsCorpus } from "../../../skills-corpus/corpus";
import type { ResolvedCorpus } from "../../../skills-corpus/resolve";
import type { ClaudeTarget } from "../../../util/claude-target";
import type { InstallPlan } from "./build-plan";
import { printPreservedPaths } from "./print-preserved-paths";
import type { WriteOutcome } from "./write-plan";

/** The two preservable files report their own status, each with three outcomes. */
function printPreservableStatus(
  label: string,
  status: WriteOutcome["claudeMdStatus"],
  at: string
): void {
  if (status === "created") console.log(color.dim(`  ${label} written to ${at}`));
  else if (status === "updated") console.log(color.dim(`  ${label} updated at ${at}`));
  else if (status === "preserved") {
    console.log(
      color.yellow(
        `  ${label} left unchanged at ${at} — a different file already exists. Re-run with --force to overwrite.`
      )
    );
  }
}

/** The default, non-`--json` summary. */
export function printHumanSummary(
  plan: InstallPlan,
  out: WriteOutcome,
  target: ClaudeTarget,
  corpus: SkillsCorpus,
  resolved: ResolvedCorpus
): void {
  const { selected } = plan;
  printSuccess(
    `Installed ${selected.length} skill${selected.length === 1 ? "" : "s"} (${out.created + out.updated} files) to ${target.skillsDir}`
  );
  console.log(color.dim(`  skills commit ${corpus.commitSha} (${resolved.source})`));
  if (out.skipped > 0) {
    console.log(color.dim(`  ${out.skipped} files already up to date`));
  }
  printPreservedPaths(out.preservedPaths);
  printPreservableStatus("CLAUDE.md", out.claudeMdStatus, target.claudeMdPath);
  printPreservableStatus("settings.json", out.settingsStatus, target.settingsJsonPath);
  if (plan.settingsSkippedForGlobal) {
    console.log(
      color.yellow(
        `  settings.json + hooks skipped — the permission posture is project-scoped ` +
          `(its hooks resolve via $CLAUDE_PROJECT_DIR). Install it per-project, not with --global.`
      )
    );
  }
  if (plan.installAgents) {
    console.log(color.dim(`  ${plan.agents.files.length} agents written to ${target.agentsDir}`));
  }
}
