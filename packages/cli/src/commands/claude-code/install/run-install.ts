import { isJsonMode } from "../../../output";
import type { PlatformIo } from "../../../skills-corpus/platform";
import type { ResolvedCorpus } from "../../../skills-corpus/resolve";
import { type ClaudeTarget, resolveClaudeTarget } from "../../../util/claude-target";
import { confirmOrAbort } from "../../../util/skills-install.confirm-or-abort";
import type { SkillsInstallOpts } from "../_shared/skills-install.types";
import { buildInstallPlan } from "./build-plan";
import { printDryRun } from "./print-dry-run";
import { printHumanSummary } from "./print-human-summary";
import { printJsonSummary } from "./print-json-summary";
import { printInstallPlan } from "./print-plan";
import { reportInstallError } from "./report-install-error";
import { selectSlugs } from "./select-slugs";
import { writeInstallPlan } from "./write-plan";

/**
 * Used by both `nexus claude-code install` and `nexus skills update`. The
 * caller resolves the target (explicit --dir vs auto-detection) and passes its
 * options in; everything downstream — filtering, planning, confirmation,
 * writing, reporting — is identical.
 */
export async function runSkillsInstall(
  skillArgs: string[],
  opts: SkillsInstallOpts,
  resolved: ResolvedCorpus,
  io: PlatformIo
): Promise<void> {
  await runSkillsInstallToTarget(skillArgs, resolveClaudeTarget(opts), opts, resolved, io);
}

/**
 * Lower-level runner: install `skillArgs` into an already-resolved target.
 * `nexus skills update` resolves (and may interactively re-pick) the target
 * itself, then calls this directly so the global / current-dir / detected
 * choice is honored byte-for-byte instead of being re-derived from `--dir`.
 */
export async function runSkillsInstallToTarget(
  skillArgs: string[],
  target: ClaudeTarget,
  opts: SkillsInstallOpts,
  resolved: ResolvedCorpus,
  io: PlatformIo
): Promise<void> {
  try {
    const { corpus } = resolved;

    const selectedSlugs = selectSlugs(skillArgs, corpus);
    if (selectedSlugs === undefined) return;

    const plan = buildInstallPlan(corpus, selectedSlugs, target, opts);

    if (!isJsonMode()) printInstallPlan(plan, target, resolved, io);

    if (opts.dryRun) {
      printDryRun(plan, target, resolved);
      return;
    }

    const confirmed = await confirmOrAbort("Proceed? [Y/n] ", opts);
    if (!confirmed) {
      if (process.exitCode !== 1) console.log("Aborted.");
      return;
    }

    const out = writeInstallPlan(plan, target, corpus, resolved, opts, io);

    if (isJsonMode()) printJsonSummary(plan, out, target, resolved);
    else printHumanSummary(plan, out, target, corpus, resolved);
  } catch (err: unknown) {
    process.exitCode = reportInstallError(err, target);
  }
}
