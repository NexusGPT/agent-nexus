import { failure } from "../../errors";
import { CategorizedCliError } from "../../exit-codes";
import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import {
  installPlanFor,
  type InstallSteps
} from "../../workspace-direct-mount/install/install-plan";
import {
  installDecision,
  type InstallPolicy
} from "../../workspace-direct-mount/install/install-policy";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import { rcloneInstallHint } from "../../workspace-direct-mount/rclone-install-hint";
import type {
  PreflightAsker,
  PreflightProblems
} from "../../workspace-direct-mount/rclone-preflight-problem";
import { runInstallPlan } from "./install/run-install-plan";
import { Interrupted, localFailureOf } from "./local-failure-of";
import {
  firstMessage,
  nothingToInstall,
  noTtyHint,
  printOffer,
  todaysRefusal
} from "./preflight-refusals";
import { rclonePreflight } from "./rclone-preflight";
import { realDepsIo } from "./real-deps-io";

/**
 * The rclone a spawn may run, or the refusal that says why none can. Every
 * refusal is RETURNED — nothing to offer, no terminal to ask, an answer of n,
 * a question or an install that broke, an install the preflight still refuses
 * — so `auto` can fall back to an engine that needs none of it.
 */
type RcloneReadiness =
  | { readonly ok: true; readonly binary: RcloneBinary }
  | { readonly ok: false; readonly refusal: CategorizedCliError };

interface ReadinessOptions {
  readonly io?: DepsIo;
  /**
   * False when the caller has somewhere else to go: with no terminal to ask,
   * the offer it could not make is not printed, only refused.
   */
  readonly offerWithoutTerminal?: boolean;
}

// debt: `mount` reads the registry before this and writes it after, with no
//       lock; the question, the download and sudo sit inside that window, so a
//       second verb writing the registry meanwhile loses its row. Lock the
//       registry's read-modify-write when a lost row is reported.
/** Probe → plan → decide → ask → install → probe again, with every "no" as a value. */
export async function rcloneReadiness(
  asker: PreflightAsker,
  policy: InstallPolicy,
  options: ReadinessOptions = {}
): Promise<RcloneReadiness> {
  const io = options.io ?? realDepsIo();
  const first = rclonePreflight(io);
  if (first.problems.rclone === null && first.problems.fuse === null) {
    return { ok: true, binary: first.binary };
  }
  // `--no-install-deps` is today's behaviour byte for byte, and process for
  // process: refused before a plan is built, so `brew` is never probed for it.
  const decision = installDecision(policy, io.stdinIsTTY);
  if (decision.kind === "refuse" && decision.because === "never") {
    return { ok: false, refusal: todaysRefusal(first.problems, asker, io.platform) };
  }
  const plan = installPlanFor(first.problems, {
    platform: io.platform,
    arch: io.arch,
    hasBrew: io.hasBrew,
    terminal: io.stdinIsTTY
  });
  if (plan.kind !== "steps") {
    const refusal = nothingToInstall(plan, decision.kind === "run", first.problems, asker, io);
    return { ok: false, refusal };
  }

  const noTerminal = decision.kind === "refuse";
  if (!noTerminal || options.offerWithoutTerminal !== false) {
    printOffer(io, first.problems, asker, plan.steps);
  }
  if (noTerminal) {
    const message = firstMessage(first.problems, asker);
    return { ok: false, refusal: failure("local-failed", message, noTtyHint(io.platform)) };
  }
  try {
    return await askAndInstall(io, first.problems, asker, {
      asked: decision.kind === "ask",
      steps: plan.steps
    });
  } catch (error) {
    // `localFailureOf` has classified every question or install that broke
    // into the CLI's own `local-failed` refusal; anything else is a bug. Ctrl-C
    // is no refusal to fall back from: the person stopped the command.
    if (error instanceof Interrupted) throw error;
    if (error instanceof CategorizedCliError) return { ok: false, refusal: error };
    throw error;
  }
}

/** The question (unless --install-deps answered it), the install, and the probe that proves it. */
async function askAndInstall(
  io: DepsIo,
  problems: PreflightProblems,
  asker: PreflightAsker,
  offer: { readonly asked: boolean; readonly steps: InstallSteps }
): Promise<RcloneReadiness> {
  const hint = rcloneInstallHint(io.platform);
  if (
    offer.asked &&
    !(await localFailureOf("The question", hint, () => io.askYesNo("Install it now?")))
  ) {
    return {
      ok: false,
      refusal: failure(
        "local-failed",
        `Aborted. ${firstMessage(problems, asker)}`,
        `Answer y next time, pass --install-deps, or install it yourself:\n${hint}`
      )
    };
  }
  await localFailureOf("The install", hint, () => runInstallPlan(io, offer.steps));

  const second = rclonePreflight(io);
  if (second.problems.rclone !== null || second.problems.fuse !== null) {
    return {
      ok: false,
      refusal: failure(
        "local-failed",
        `Installed, but the preflight still fails: ${firstMessage(second.problems, asker)}`,
        "Mount again — an installer can return before its files are in place. If it repeats:\n" +
          rcloneInstallHint(io.platform)
      )
    };
  }
  return { ok: true, binary: second.binary };
}
