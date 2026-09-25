import type { PreflightProblems, RclonePreflightProblem } from "../rclone-preflight-problem";
import type { RcloneTarget } from "./install-pins";
import { rcloneTargetFor } from "./rclone-target";

/**
 * One thing the CLI would do to fix one preflight problem. A step carries
 * only what identifies it; the URL, the hash and the command are read from
 * the pins by the renderer and by the runner, never copied into the step.
 */
export type InstallStep =
  | { readonly kind: "rclone-zip"; readonly target: RcloneTarget }
  | { readonly kind: "fuse-t-cask" }
  | { readonly kind: "fuse-t-pkg"; readonly password: PasswordPrompt };

/**
 * Where the administrator password is asked for: `sudo` on the terminal, or
 * macOS's own password dialog when no terminal is attached — the case of an
 * agent running the CLI, where `sudo` can only fail.
 */
export type PasswordPrompt = "terminal" | "dialog";

/** Why the CLI has no step to offer, so the manual hint is all it can print. */
export type ManualReason = "macfuse-not-approved" | "no-build-for-platform";

/**
 * Everything the preflight found, answered at once: nothing to do, an ordered
 * list of steps behind ONE question and at most one sudo, or "manual" when any
 * problem is one the CLI cannot fix — a single unfixable problem makes the
 * whole plan manual, because a half-fix still ends in a refused mount.
 */
/** Never empty: nothing downstream may ask, lock or install over zero steps. */
export type InstallSteps = readonly [InstallStep, ...InstallStep[]];

export type InstallPlan =
  | { readonly kind: "nothing" }
  | { readonly kind: "steps"; readonly steps: InstallSteps }
  | { readonly kind: "manual"; readonly because: ManualReason };

/** The two facts about this machine the plan needs, and one it asks for lazily. */
export interface InstallHost {
  readonly platform: NodeJS.Platform;
  readonly arch: NodeJS.Architecture;
  /**
   * A function, not a value, so `brew` is looked for only when a FUSE-T step
   * is being planned — never on a healthy mount, never on Linux.
   */
  readonly hasBrew: () => boolean;
  /** A terminal on stdin: `sudo` (and brew, which runs it) can ask there. */
  readonly terminal: boolean;
}

type StepOrManual = { readonly step: InstallStep } | { readonly manual: ManualReason };

function stepFor(problem: RclonePreflightProblem, host: InstallHost): StepOrManual {
  switch (problem.kind) {
    case "rclone-missing":
    case "no-mount-support": {
      const target = rcloneTargetFor(host.platform, host.arch);
      return target === null
        ? { manual: "no-build-for-platform" }
        : { step: { kind: "rclone-zip", target } };
    }
    case "no-fuse-library": {
      // The FUSE probe runs on darwin only (`fuseProblem` in rclone-preflight.ts), so this
      // problem on any other host is a bug in the probe, not a case to plan for.
      if (host.platform !== "darwin")
        throw new Error(`no-fuse-library planned on ${host.platform}`);
      return { step: fuseTStep(host) };
    }
    case "macfuse-not-approved":
      return { manual: "macfuse-not-approved" };
    default:
      return problem satisfies never;
  }
}

/**
 * brew only with a terminal: its cask runs `sudo installer` itself, which has
 * nowhere to ask without one. No terminal → the pinned pkg behind the macOS
 * password dialog. `brew` is not even looked for then.
 */
function fuseTStep(host: InstallHost): InstallStep {
  if (host.terminal) {
    if (host.hasBrew()) return { kind: "fuse-t-cask" };
    return { kind: "fuse-t-pkg", password: "terminal" };
  }
  return { kind: "fuse-t-pkg", password: "dialog" };
}

export function installPlanFor(found: PreflightProblems, host: InstallHost): InstallPlan {
  const steps: InstallStep[] = [];
  for (const problem of [found.rclone, found.fuse]) {
    if (problem === null) continue;
    const answer = stepFor(problem, host);
    // Manual wins over any step, decided in this one place.
    if ("manual" in answer) return { kind: "manual", because: answer.manual };
    steps.push(answer.step);
  }
  // A "steps" plan is never empty — the person is never asked over zero steps.
  const [first, ...rest] = steps;
  return first === undefined ? { kind: "nothing" } : { kind: "steps", steps: [first, ...rest] };
}
