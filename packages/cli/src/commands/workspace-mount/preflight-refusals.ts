import { failure } from "../../errors";
import type { RcloneEngine } from "../../mount-registry";
import type { InstallPlan } from "../../workspace-direct-mount/install/install-plan";
import { rcloneInstallHint } from "../../workspace-direct-mount/rclone-install-hint";
import {
  preflightProblemMessage,
  type PreflightProblems
} from "../../workspace-direct-mount/rclone-preflight-problem";

/** The problem sentences, rclone's first — the order the person will fix them in. */
export function messages(problems: PreflightProblems, engine: RcloneEngine): string[] {
  return [problems.rclone, problems.fuse]
    .filter((problem) => problem !== null)
    .map((problem) => preflightProblemMessage(problem, engine));
}

export function firstMessage(problems: PreflightProblems, engine: RcloneEngine): string {
  return messages(problems, engine)[0] ?? "the preflight refused";
}

/** Byte for byte what the preflight refuses with today, for every path that offers nothing. */
export function todaysRefusal(
  problems: PreflightProblems,
  engine: RcloneEngine,
  platform: NodeJS.Platform
) {
  return failure("local-failed", firstMessage(problems, engine), rcloneInstallHint(platform));
}

/**
 * A plan with nothing to install is today's refusal — except when the person
 * typed --install-deps and this platform has no pinned build: a flag that
 * installs nothing must say why, not look ignored.
 */
export function nothingToInstall(
  plan: Exclude<InstallPlan, { kind: "steps" }>,
  typedInstall: boolean,
  problems: PreflightProblems,
  engine: RcloneEngine,
  host: { readonly platform: NodeJS.Platform; readonly arch: NodeJS.Architecture }
) {
  if (typedInstall) {
    if (plan.kind === "manual" && plan.because === "no-build-for-platform") {
      return failure(
        "local-failed",
        firstMessage(problems, engine),
        `--install-deps has no pinned rclone for ${host.platform}/${host.arch}; install it yourself:\n` +
          rcloneInstallHint(host.platform)
      );
    }
  }
  return todaysRefusal(problems, engine, host.platform);
}
