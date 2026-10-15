import path from "node:path";

import type { SkillsCorpus } from "../../../skills-corpus/corpus";
import type { PlatformIo } from "../../../skills-corpus/platform";
import type { ResolvedCorpus } from "../../../skills-corpus/resolve";
import type { ClaudeTarget } from "../../../util/claude-target";
import { commitInstallLedger, openInstallLedger } from "../../../util/skills-install.ledger";
import {
  type ClaudeMdStatus,
  writeRootClaudeMd,
  writeRootSettingsJson
} from "../../../util/skills-install.write-preservable-file";
import { writeSkillFiles } from "../../../util/skills-install.write-skill-files";
import type { SkillsInstallOpts } from "../_shared/skills-install.types";
import type { InstallPlan } from "./build-plan";

/** What one install actually did to the disk. */
export interface WriteOutcome {
  created: number;
  updated: number;
  skipped: number;
  /** Files on disk, different from the bundle, that this CLI did not write. */
  preservedPaths: string[];
  claudeMdStatus: ClaudeMdStatus | null;
  settingsStatus: ClaudeMdStatus | null;
}

/**
 * Write the plan.
 *
 * One ledger for the whole install: it is read once, accumulates every file
 * this run writes, and is committed at the end — so a file written earlier in
 * this same run is recognised later in it.
 */
export function writeInstallPlan(
  plan: InstallPlan,
  target: ClaudeTarget,
  corpus: SkillsCorpus,
  resolved: ResolvedCorpus,
  opts: SkillsInstallOpts,
  io: PlatformIo
): WriteOutcome {
  const ledger = openInstallLedger(target.claudeDir);
  const writeOpts = { ledger, force: opts.force };
  const out: WriteOutcome = {
    created: 0,
    updated: 0,
    skipped: 0,
    preservedPaths: [],
    claudeMdStatus: null,
    settingsStatus: null
  };

  for (const skill of plan.skillInstallables) {
    const targetDir = path.join(target.skillsDir, skill.slug);
    const result = writeSkillFiles(targetDir, skill.files, writeOpts);
    out.created += result.created.length;
    out.updated += result.updated.length;
    out.skipped += result.skipped.length;
    out.preservedPaths.push(...result.preserved.map((p) => path.join(targetDir, p)));
  }

  if (plan.installClaudeMd) {
    out.claudeMdStatus = writeRootClaudeMd(target.claudeMdPath, plan.claudeMdContent, opts);
    if (out.claudeMdStatus === "created") out.created += 1;
    else if (out.claudeMdStatus === "updated") out.updated += 1;
    else if (out.claudeMdStatus === "skipped") out.skipped += 1;
  }

  // Hooks first (Nexus-owned, refreshed in place like skills), then
  // settings.json (preserve-unless-force, since the user may have customised
  // it). Ordering matters: settings.json references the hooks, so the hooks
  // should exist by the time it lands.
  if (plan.installSettings) {
    const hooksResult = writeSkillFiles(target.hooksDir, plan.hooks.files, writeOpts);
    out.created += hooksResult.created.length;
    out.updated += hooksResult.updated.length;
    out.skipped += hooksResult.skipped.length;
    out.preservedPaths.push(...hooksResult.preserved.map((p) => path.join(target.hooksDir, p)));

    out.settingsStatus = writeRootSettingsJson(target.settingsJsonPath, plan.settingsContent, opts);
    if (out.settingsStatus === "created") out.created += 1;
    else if (out.settingsStatus === "updated") out.updated += 1;
    else if (out.settingsStatus === "skipped") out.skipped += 1;
  }

  // Agents (Nexus-owned, refreshed in place like skills/hooks). Written
  // directly into .claude/agents — the flat .md files Claude Code discovers.
  if (plan.installAgents) {
    const agentsResult = writeSkillFiles(target.agentsDir, plan.agents.files, writeOpts);
    out.created += agentsResult.created.length;
    out.updated += agentsResult.updated.length;
    out.skipped += agentsResult.skipped.length;
    out.preservedPaths.push(...agentsResult.preserved.map((p) => path.join(target.agentsDir, p)));
  }

  commitInstallLedger(ledger, {
    commitSha: corpus.commitSha,
    source: resolved.source,
    cliVersion: io.cliVersion,
    installedAt: new Date().toISOString()
  });

  return out;
}
