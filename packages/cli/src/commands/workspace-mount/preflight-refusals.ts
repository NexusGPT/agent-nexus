import { failure } from "../../errors";
import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import type {
  InstallPlan,
  InstallSteps,
  ManualReason
} from "../../workspace-direct-mount/install/install-plan";
import { renderStep, stepNotes } from "../../workspace-direct-mount/install/render-step";
import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import { rcloneInstallHint } from "../../workspace-direct-mount/rclone-install-hint";
import {
  type PreflightAsker,
  preflightProblemMessage,
  type PreflightProblems
} from "../../workspace-direct-mount/rclone-preflight-problem";

/** Both slots, each exactly once: a repeated slot would drop the other slot's problem. */
type SlotOrder = readonly ["rclone", "fuse"] | readonly ["fuse", "rclone"];

function messagesIn(
  order: SlotOrder,
  problems: PreflightProblems,
  engine: PreflightAsker
): string[] {
  return order
    .map((slot) => problems[slot])
    .filter((problem) => problem !== null)
    .map((problem) => preflightProblemMessage(problem, engine));
}

/** The problem sentences, rclone's first — the order the person will fix them in. */
function messages(problems: PreflightProblems, engine: PreflightAsker): string[] {
  return messagesIn(["rclone", "fuse"], problems, engine);
}

/**
 * The slot whose problem made a plan manual comes first. The plan stops at
 * the first problem no install fixes, and a refusal that opens with "needs
 * rclone" would hide the missing /dev/fuse behind it, so --install-deps would
 * look ignored.
 */
const MANUAL_ORDER_FOR = {
  "macfuse-not-approved": ["fuse", "rclone"],
  "no-build-for-platform": ["rclone", "fuse"],
  "rclone-blocked": ["rclone", "fuse"],
  "no-fuse-device": ["fuse", "rclone"],
  "winfsp-restart-pending": ["fuse", "rclone"]
} as const satisfies Record<ManualReason, SlotOrder>;

/** Every problem of a manual plan, the one that made it manual first, one sentence per line. */
function manualMessage(
  because: ManualReason,
  problems: PreflightProblems,
  engine: PreflightAsker
): string {
  return messagesIn(MANUAL_ORDER_FOR[because], problems, engine).join("\n");
}

export function firstMessage(problems: PreflightProblems, engine: PreflightAsker): string {
  return messages(problems, engine)[0] ?? "the preflight refused";
}

/**
 * What "no terminal to ask" means on each platform. Under Git Bash's mintty no
 * console is attached, so a person AT a terminal reads as absent there; the
 * hint names the two ways out before the flag.
 */
const NO_TTY_HINT_FOR = {
  darwin: "",
  linux: "",
  win32:
    "Under Git Bash, run: winpty nexus … (mintty attaches no console), or use Windows Terminal.\n"
} as const satisfies Record<MountPlatform, string>;

export function noTtyHint(platform: NodeJS.Platform): string {
  return (
    "No terminal to ask. Re-run with --install-deps to install the above, or install it yourself:\n" +
    NO_TTY_HINT_FOR[mountPlatformOf(platform)] +
    rcloneInstallHint(platform)
  );
}

const BLOCKED_HINT =
  "Allow that file in the policy that blocks it, then mount again. When the file is the CLI's own copy " +
  "(under .nexus-mcp), deleting it makes the next mount look for an rclone on PATH instead.";

/** Byte for byte what the preflight refuses with today, for every path that offers nothing. */
export function todaysRefusal(
  problems: PreflightProblems,
  engine: PreflightAsker,
  platform: NodeJS.Platform
) {
  return failure("local-failed", firstMessage(problems, engine), rcloneInstallHint(platform));
}

/**
 * A plan with nothing to install refuses with every problem it found, the one
 * that made it manual first. When the person typed --install-deps and this
 * platform has no pinned build, the hint says so: a flag that installs nothing
 * must say why, not look ignored.
 */
export function nothingToInstall(
  plan: Exclude<InstallPlan, { kind: "steps" }>,
  typedInstall: boolean,
  problems: PreflightProblems,
  engine: PreflightAsker,
  host: { readonly platform: NodeJS.Platform; readonly arch: NodeJS.Architecture }
) {
  if (plan.kind === "nothing") return todaysRefusal(problems, engine, host.platform);
  const message = manualMessage(plan.because, problems, engine);
  // An install cannot lift a policy, so this hint names none.
  if (plan.because === "rclone-blocked") return failure("local-failed", message, BLOCKED_HINT);
  if (typedInstall) {
    if (plan.because === "no-build-for-platform") {
      return failure(
        "local-failed",
        message,
        `--install-deps has no pinned rclone for ${host.platform}/${host.arch}; install it yourself:\n` +
          rcloneInstallHint(host.platform)
      );
    }
  }
  return failure("local-failed", message, rcloneInstallHint(host.platform));
}

/**
 * The offer: what is missing, then exactly what would run — to the prompt
 * stream only, never into a refusal's hint. The rendered steps contain
 * `brew install`, and the darwin install hint must keep saying "not
 * Homebrew's rclone".
 */
export function printOffer(
  io: DepsIo,
  problems: PreflightProblems,
  asker: PreflightAsker,
  steps: InstallSteps
): void {
  for (const line of messages(problems, asker)) io.promptLine(line);
  io.promptLine("");
  io.promptLine("The CLI can install what is missing. This is exactly what would run:");
  for (const step of steps) {
    io.promptLine("");
    for (const line of renderStep(step)) io.promptLine(line);
    for (const note of stepNotes(step)) io.promptLine(`  note: ${note}`);
  }
  io.promptLine("");
}
