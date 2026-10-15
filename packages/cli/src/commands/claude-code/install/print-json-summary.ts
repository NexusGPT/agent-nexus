import { corpusJson } from "../../../skills-corpus/command";
import type { ResolvedCorpus } from "../../../skills-corpus/resolve";
import type { ClaudeTarget } from "../../../util/claude-target";
import type { InstallPlan } from "./build-plan";
import type { WriteOutcome } from "./write-plan";

/** `--json`: the install's whole outcome as one document. */
export function printJsonSummary(
  plan: InstallPlan,
  out: WriteOutcome,
  target: ClaudeTarget,
  resolved: ResolvedCorpus
): void {
  console.log(
    JSON.stringify(
      {
        success: true,
        skills: plan.selected.map((s) => s.slug),
        shared: plan.shared.files.length,
        claudeMd: out.claudeMdStatus
          ? { path: target.claudeMdPath, status: out.claudeMdStatus }
          : null,
        settings: out.settingsStatus
          ? {
              path: target.settingsJsonPath,
              status: out.settingsStatus,
              hooksDir: target.hooksDir
            }
          : null,
        agents: plan.installAgents
          ? { dir: target.agentsDir, files: plan.agents.files.length }
          : null,
        settingsSkippedForGlobal: plan.settingsSkippedForGlobal,
        directory: target.skillsDir,
        targetReason: target.reason,
        created: out.created,
        updated: out.updated,
        skipped: out.skipped,
        preserved: out.preservedPaths,
        corpus: corpusJson(resolved)
      },
      null,
      2
    )
  );
}
