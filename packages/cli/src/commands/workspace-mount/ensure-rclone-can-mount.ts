import { failure } from "../../errors";
import type { RcloneEngine } from "../../mount-registry";
import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import {
  installPlanFor,
  type InstallSteps
} from "../../workspace-direct-mount/install/install-plan";
import {
  installDecision,
  type InstallPolicy
} from "../../workspace-direct-mount/install/install-policy";
import { renderStep, stepNotes } from "../../workspace-direct-mount/install/render-step";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import { rcloneInstallHint } from "../../workspace-direct-mount/rclone-install-hint";
import type { PreflightProblems } from "../../workspace-direct-mount/rclone-preflight-problem";
import { runInstallPlan } from "./install/run-install-plan";
import { localFailureOf } from "./local-failure-of";
import { firstMessage, messages, nothingToInstall, todaysRefusal } from "./preflight-refusals";
import { rclonePreflight } from "./rclone-preflight";
import { realDepsIo } from "./real-deps-io";

/**
 * Before any credential is minted: probe → plan → decide → ask → install →
 * probe again. Returns the one rclone the spawn may run. Every exit that is
 * not a mount is a refusal in the CLI's own taxonomy, printed with the fix,
 * exiting as `local-failed` exactly like today's preflight.
 *
 * The rendered steps — which contain `brew install` — go to the prompt stream
 * only, never into a refusal's hint: two specs pin that the darwin install
 * hint never says `brew install`, because that hint must keep saying "not
 * Homebrew's rclone". `--no-install-deps` never prints them at all: that user
 * asked for today's behaviour and gets it byte for byte.
 *
 * debt: `mount` reads the registry before this and writes it after, with no
 *       lock; the question, the download and sudo now sit inside that window,
 *       so a second verb writing the registry meanwhile loses its row. Lock
 *       the registry's read-modify-write when a lost row is reported.
 */
export async function ensureRcloneCanMount(
  engine: RcloneEngine,
  policy: InstallPolicy,
  io: DepsIo = realDepsIo()
): Promise<RcloneBinary> {
  const first = rclonePreflight(io);
  if (first.problems.rclone === null && first.problems.fuse === null) return first.binary;
  // `--no-install-deps` is today's behaviour byte for byte, and process for
  // process: refused before a plan is built, so `brew` is never probed for it.
  const decision = installDecision(policy, io.stdinIsTTY);
  if (decision.kind === "refuse" && decision.because === "never") {
    throw todaysRefusal(first.problems, engine, io.platform);
  }
  const plan = installPlanFor(first.problems, {
    platform: io.platform,
    arch: io.arch,
    hasBrew: io.hasBrew,
    terminal: io.stdinIsTTY
  });
  if (plan.kind !== "steps") {
    throw nothingToInstall(plan, decision.kind === "run", first.problems, engine, io);
  }

  printOffer(io, first.problems, engine, plan.steps);
  if (decision.kind === "refuse") {
    throw failure(
      "local-failed",
      firstMessage(first.problems, engine),
      "No terminal to ask. Re-run with --install-deps to install the above, or install it yourself:\n" +
        rcloneInstallHint(io.platform)
    );
  }
  const hint = rcloneInstallHint(io.platform);
  const asked = decision.kind === "ask";
  if (
    asked &&
    !(await localFailureOf("The question", hint, () => io.askYesNo("Install it now?")))
  ) {
    throw failure(
      "local-failed",
      `Aborted. ${firstMessage(first.problems, engine)}`,
      `Answer y next time, pass --install-deps, or install it yourself:\n${hint}`
    );
  }
  // debt: a run that probed while another run held the lock, and locked only
  //       after that run released, installs a second time — one rename for
  //       the rclone zip, but a second sudo prompt on the FUSE-T pkg road.
  //       Re-probe under the lock when a double install is reported.
  await localFailureOf("The install", hint, () => runInstallPlan(io, plan.steps));

  const second = rclonePreflight(io);
  if (second.problems.rclone !== null || second.problems.fuse !== null) {
    throw failure(
      "local-failed",
      `Installed, but the preflight still fails: ${firstMessage(second.problems, engine)}`,
      "Mount again — an installer can return before its files are in place. If it repeats:\n" +
        rcloneInstallHint(io.platform)
    );
  }
  return second.binary;
}

function printOffer(
  io: DepsIo,
  problems: PreflightProblems,
  engine: RcloneEngine,
  steps: InstallSteps
): void {
  for (const line of messages(problems, engine)) io.promptLine(line);
  io.promptLine("");
  io.promptLine("The CLI can install what is missing. This is exactly what would run:");
  for (const step of steps) {
    io.promptLine("");
    for (const line of renderStep(step)) io.promptLine(line);
    for (const note of stepNotes(step)) io.promptLine(`  note: ${note}`);
  }
  io.promptLine("");
}
