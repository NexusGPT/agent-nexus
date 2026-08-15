import path from "node:path";

import { Command } from "commander";

import { handleError, refuse, reportFailure } from "../errors";
import { color, isJsonMode, printSuccess } from "../output";
import { SKILL_LIST, SKILLS } from "../skills-content.generated";
import { confirmable } from "../util/confirm";
import {
  agentInstallables,
  bundleToInstallables,
  claudeMdContent,
  type ClaudeMdStatus,
  type ClaudeTarget,
  commitInstallLedger,
  confirmOrAbort,
  hookInstallables,
  type InstallableSkill,
  openInstallLedger,
  resolveClaudeTarget,
  settingsJsonContent,
  sharedInstallable,
  writeRootClaudeMd,
  writeRootSettingsJson,
  writeSkillFiles
} from "../util/skills-install";

// ── Commands ─────────────────────────────────────────────────────────────────

export function registerClaudeCodeCommands(program: Command): void {
  const cc = program
    .command("claude-code")
    .description("Install Claude Code skills bundled with this CLI version into your project");

  // ── list ───────────────────────────────────────────────────────────────────

  cc.command("list")
    .description("List Claude Code skills bundled with this CLI version")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus claude-code list
  $ nexus claude-code list --json

Skills are version-locked to the CLI binary — \`nexus skills update\`
writes the same set this command lists. Run \`nexus --version\` to see the
CLI / skill bundle version, or upgrade with \`pnpm add -g @agent-nexus/cli@latest\`.`
    )
    .action(() => {
      if (isJsonMode()) {
        const skills = SKILL_LIST.map((slug) => ({
          slug,
          description: SKILLS[slug].description,
          files: SKILLS[slug].files.length
        }));
        console.log(JSON.stringify(skills, null, 2));
        return;
      }

      console.log(color.bold(`\nBundled Claude Code skills (${SKILL_LIST.length}):\n`));
      for (const slug of SKILL_LIST) {
        const entry = SKILLS[slug];
        const name = slug.replace("nexus-", "");
        console.log(`  ${color.cyan(name.padEnd(22))} ${entry.description}`);
        console.log(`  ${"".padEnd(22)} ${color.dim(`${entry.files.length} files`)}`);
        console.log();
      }
      console.log(
        color.dim(
          `Install the latest skills: nexus skills update\nInstall specific ones: nexus skills update <skill>\n`
        )
      );
    });

  // ── install ────────────────────────────────────────────────────────────────
  //
  // Reads the embedded skills bundle (skills-content.generated.ts, produced
  // at build time from the canonical claude-code-skills-nexus repo) and
  // writes the selected skills to the target dir. No network call, no
  // auth — the bundle is version-locked to the CLI binary.
  //
  // This is the original entry point; `nexus skills update` (skills.ts) wraps
  // the same machinery with project-root auto-detection. Kept for back-compat.

  confirmable(cc.command("install"))
    .description("Install the Claude Code skills bundled with this CLI version to your project")
    .argument("[skills...]", "Skill slugs to install (omit for all)")
    .option("--dir <path>", "Target directory", ".claude/skills")
    .option("--force", "Replace files this CLI did not write (see Notes) without prompting")
    .option("--dry-run", "Show what would be installed without writing")
    .option("--no-claude-md", "Skip writing the CLAUDE.md system prompt to the project root")
    .option(
      "--no-settings",
      "Skip writing .claude/settings.json + .claude/hooks (permission posture)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus claude-code install                                # Install all skills
  $ nexus claude-code install nexus-workflow-builder          # Install one skill
  $ nexus claude-code install nexus-agents nexus-deployments  # Install specific skills
  $ nexus claude-code install --dir ./my-skills               # Custom directory
  $ nexus claude-code install --dry-run                       # Preview only
  $ nexus claude-code install --force                         # Overwrite without prompting
  $ nexus claude-code install --no-claude-md                  # Skills only, leave CLAUDE.md alone
  $ nexus claude-code install --no-settings                   # Skip the settings.json + hooks posture

Tip: \`nexus skills update\` runs the same install but auto-detects your
project's existing .claude folder instead of always writing to the current
directory.

Alongside the skills, install writes:
  • shared/        — api-client + helpers the skill example scripts import
  • CLAUDE.md      — the cross-cutting Cue system prompt every SKILL.md
                     references; placed at the project root so Claude Code
                     auto-loads it. An existing, differing CLAUDE.md is
                     preserved unless --force is passed; skip it entirely
                     with --no-claude-md.
  • settings.json  — the scoped permission posture written to
                     .claude/settings.json. An existing, differing file is
                     preserved unless --force is passed.
  • hooks/         — the firewall + lifecycle hooks settings.json invokes,
                     written to .claude/hooks (Python marked executable).
                     Skip both settings.json and hooks with --no-settings.
  • agents/        — the Nexus subagent definitions, written to
                     .claude/agents and refreshed in place on every install.

Notes:
  YOUR OWN EDITS TO SKILLS, HOOKS AND AGENTS ARE NEVER OVERWRITTEN SILENTLY.
  Every install records a checksum of each file it writes, in
  .claude/.nexus-install-manifest.json. On the next install a file whose bytes
  still match that record is refreshed; a file whose bytes do not is LEFT ALONE,
  named in the output, and replaced only if you pass --force. A tree installed
  before this CLI kept that record has no checksums yet, so its differing files
  are preserved too — pass --force once to adopt them.

  --dir NAMES THE TARGET AND NOTHING IS COMPUTED FROM WHERE YOU STAND. For the
  conventional <root>/.claude/skills shape the posture goes to <root>/.claude and
  CLAUDE.md to <root>/CLAUDE.md, both derived from --dir. For any other path,
  everything — skills, CLAUDE.md, settings.json, hooks/, agents/ — lands inside
  the directory you named. Run "nexus skills where --dir <path>" to see every
  path before writing.

Skills are bundled with the CLI binary at build time from the canonical
claude-code-skills-nexus repository. No network calls, no API key required.
Run "nexus --version" to see which CLI version (and skill set) you have, or
"pnpm add -g @agent-nexus/cli@latest" to upgrade to the latest bundled
skills.`
    )
    .action(
      async (
        skillArgs: string[],
        opts: {
          dir: string;
          force?: boolean;
          yes?: boolean;
          dryRun?: boolean;
          claudeMd?: boolean;
          settings?: boolean;
        }
      ) => {
        await runSkillsInstall(skillArgs, opts);
      }
    );
}

// ── Shared install runner ──────────────────────────────────────────────────────
//
// Used by both `nexus claude-code install` and `nexus skills update`. The
// caller resolves the target (explicit --dir vs auto-detection) and passes its
// options in; everything downstream — filtering, planning, confirmation,
// writing, reporting — is identical.

export interface SkillsInstallOpts {
  dir?: string;
  global?: boolean;
  here?: boolean;
  force?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  claudeMd?: boolean;
  /** When false (`--no-settings`), skip .claude/settings.json + .claude/hooks. */
  settings?: boolean;
}

export async function runSkillsInstall(
  skillArgs: string[],
  opts: SkillsInstallOpts
): Promise<void> {
  await runSkillsInstallToTarget(skillArgs, resolveClaudeTarget(opts), opts);
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
  opts: SkillsInstallOpts
): Promise<void> {
  try {
    const skillsDir = target.skillsDir;
    const claudeMdTarget = target.claudeMdPath;

    // Filter to the requested subset (or all)
    const availableSlugs = new Set(SKILL_LIST);
    let selectedSlugs: readonly string[] = SKILL_LIST;

    if (skillArgs.length > 0) {
      const unknown = skillArgs.filter((s) => !availableSlugs.has(s));
      if (unknown.length > 0) {
        process.exitCode = refuse(
          `Unknown skill${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.\n\n` +
            `Available skills in this CLI bundle:\n` +
            [...availableSlugs]
              .sort()
              .map((s) => `  ${s}`)
              .join("\n")
        );
        return;
      }
      const requested = new Set(skillArgs);
      selectedSlugs = SKILL_LIST.filter((s) => requested.has(s));
    }

    const selected = bundleToInstallables(selectedSlugs);
    const shared = sharedInstallable();
    const skillInstallables = [...selected, shared];

    // CLAUDE.md is the cross-cutting Cue system prompt every SKILL.md
    // cross-references; it goes to the project root (not .claude/skills)
    // so Claude Code auto-loads it. Opt out with --no-claude-md.
    const content = claudeMdContent();
    const installClaudeMd = opts.claudeMd !== false && content.length > 0;

    // settings.json + hooks/ — the scoped permission posture. Coupled under one
    // opt-out (`--no-settings`): settings.json references the hooks, and the
    // hooks are inert without it, so installing one without the other is never
    // useful. Both are skipped when the bundle ships them empty.
    //
    // The posture is inherently PROJECT-scoped: settings.json invokes the hooks
    // via `${CLAUDE_PROJECT_DIR}/.claude/hooks/…`, which Claude Code resolves to
    // the open project at runtime — never `~/.claude/hooks`. Writing it to the
    // user-global `~/.claude` would (a) leave the global hooks unreachable and
    // (b) impose Nexus's permission rules on every project the user opens. So
    // for a global target we skip it and tell the user to install per-project.
    const settingsContent = settingsJsonContent();
    const hooks = hookInstallables();
    const settingsSupported = target.reason !== "global";
    const installSettings =
      opts.settings !== false &&
      settingsSupported &&
      settingsContent.length > 0 &&
      hooks.files.length > 0;
    const settingsSkippedForGlobal = opts.settings !== false && !settingsSupported;

    // agents/ — the Nexus-owned subagent definitions. Like the skill files and
    // shared/, they are always installed (no opt-out) and resolve fine at any
    // scope, so unlike settings.json + hooks they ship for --global too. Gated
    // only on the bundle actually carrying them (older bundles ship none).
    const agents = agentInstallables();
    const installAgents = agents.files.length > 0;

    const totalFiles =
      skillInstallables.reduce((acc, s) => acc + s.files.length, 0) +
      (installClaudeMd ? 1 : 0) +
      (installSettings ? hooks.files.length + 1 : 0) +
      (installAgents ? agents.files.length : 0);

    // Show plan
    if (!isJsonMode()) {
      console.log(
        color.bold(
          `\nInstalling ${selected.length} Claude Code skill${selected.length === 1 ? "" : "s"} to ${skillsDir}\n`
        )
      );
      for (const skill of skillInstallables) {
        console.log(
          `  ${color.cyan(skill.slug.padEnd(32))} ${color.dim(`${skill.files.length} files`)}`
        );
      }
      if (installClaudeMd) {
        console.log(`  ${color.cyan("CLAUDE.md".padEnd(32))} ${color.dim(`→ ${claudeMdTarget}`)}`);
      }
      if (installSettings) {
        console.log(
          `  ${color.cyan("settings.json".padEnd(32))} ${color.dim(`→ ${target.settingsJsonPath}`)}`
        );
        console.log(
          `  ${color.cyan("hooks".padEnd(32))} ${color.dim(`${hooks.files.length} files → ${target.hooksDir}`)}`
        );
      }
      if (installAgents) {
        console.log(
          `  ${color.cyan("agents".padEnd(32))} ${color.dim(`${agents.files.length} files → ${target.agentsDir}`)}`
        );
      }
      if (settingsSkippedForGlobal) {
        console.log(
          color.yellow(
            `  settings.json + hooks skipped — the permission posture is project-scoped ` +
              `(its hooks resolve via $CLAUDE_PROJECT_DIR). Install it per-project, not with --global.`
          )
        );
      }
      console.log();
    }

    // Dry run
    if (opts.dryRun) {
      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              dryRun: true,
              skills: selected.map((s) => s.slug),
              shared: shared.files.length,
              claudeMd: installClaudeMd ? claudeMdTarget : null,
              settings: installSettings ? target.settingsJsonPath : null,
              hooks: installSettings ? { dir: target.hooksDir, files: hooks.files.length } : null,
              agents: installAgents ? { dir: target.agentsDir, files: agents.files.length } : null,
              settingsSkippedForGlobal,
              directory: skillsDir,
              targetReason: target.reason,
              fileCount: totalFiles
            },
            null,
            2
          )
        );
      } else {
        console.log(color.dim(`Dry run — ${totalFiles} files would be written. No changes made.`));
      }
      return;
    }

    // Confirm
    const confirmed = await confirmOrAbort("Proceed? [Y/n] ", opts);
    if (!confirmed) {
      if (process.exitCode !== 1) console.log("Aborted.");
      return;
    }

    // Write. One ledger for the whole install: it is read once, accumulates
    // every file this run writes, and is committed at the end — so a file
    // written earlier in this same run is recognised later in it.
    const ledger = openInstallLedger(target.claudeDir);
    const writeOpts = { ledger, force: opts.force };

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const preservedPaths: string[] = [];
    for (const skill of skillInstallables) {
      const targetDir = path.join(skillsDir, skill.slug);
      const result = writeSkillFiles(targetDir, skill.files, writeOpts);
      totalCreated += result.created.length;
      totalUpdated += result.updated.length;
      totalSkipped += result.skipped.length;
      preservedPaths.push(...result.preserved.map((p) => path.join(targetDir, p)));
    }

    let claudeMdStatus: ClaudeMdStatus | null = null;
    if (installClaudeMd) {
      claudeMdStatus = writeRootClaudeMd(claudeMdTarget, content, opts);
      if (claudeMdStatus === "created") totalCreated += 1;
      else if (claudeMdStatus === "updated") totalUpdated += 1;
      else if (claudeMdStatus === "skipped") totalSkipped += 1;
    }

    // Hooks first (Nexus-owned, refreshed in place like skills), then
    // settings.json (preserve-unless-force, since the user may have customised
    // it). Ordering matters: settings.json references the hooks, so the hooks
    // should exist by the time it lands.
    let settingsStatus: ClaudeMdStatus | null = null;
    if (installSettings) {
      const hooksResult = writeSkillFiles(target.hooksDir, hooks.files, writeOpts);
      totalCreated += hooksResult.created.length;
      totalUpdated += hooksResult.updated.length;
      totalSkipped += hooksResult.skipped.length;
      preservedPaths.push(...hooksResult.preserved.map((p) => path.join(target.hooksDir, p)));

      settingsStatus = writeRootSettingsJson(target.settingsJsonPath, settingsContent, opts);
      if (settingsStatus === "created") totalCreated += 1;
      else if (settingsStatus === "updated") totalUpdated += 1;
      else if (settingsStatus === "skipped") totalSkipped += 1;
    }

    // Agents (Nexus-owned, refreshed in place like skills/hooks). Written
    // directly into .claude/agents — the flat .md files Claude Code discovers.
    if (installAgents) {
      const agentsResult = writeSkillFiles(target.agentsDir, agents.files, writeOpts);
      totalCreated += agentsResult.created.length;
      totalUpdated += agentsResult.updated.length;
      totalSkipped += agentsResult.skipped.length;
      preservedPaths.push(...agentsResult.preserved.map((p) => path.join(target.agentsDir, p)));
    }

    commitInstallLedger(ledger);

    // Summary
    if (isJsonMode()) {
      console.log(
        JSON.stringify(
          {
            success: true,
            skills: selected.map((s) => s.slug),
            shared: shared.files.length,
            claudeMd: claudeMdStatus ? { path: claudeMdTarget, status: claudeMdStatus } : null,
            settings: settingsStatus
              ? { path: target.settingsJsonPath, status: settingsStatus, hooksDir: target.hooksDir }
              : null,
            agents: installAgents ? { dir: target.agentsDir, files: agents.files.length } : null,
            settingsSkippedForGlobal,
            directory: skillsDir,
            targetReason: target.reason,
            created: totalCreated,
            updated: totalUpdated,
            skipped: totalSkipped,
            preserved: preservedPaths
          },
          null,
          2
        )
      );
    } else {
      printSuccess(
        `Installed ${selected.length} skill${selected.length === 1 ? "" : "s"} (${totalCreated + totalUpdated} files) to ${skillsDir}`
      );
      if (totalSkipped > 0) {
        console.log(color.dim(`  ${totalSkipped} files already up to date`));
      }
      if (preservedPaths.length > 0) {
        // Named, not counted. A count is what the old destructive behaviour
        // already printed, and a count cannot tell an operator WHICH of their
        // own files this install would have replaced.
        console.log(
          color.yellow(
            `  ${preservedPaths.length} file${preservedPaths.length === 1 ? "" : "s"} left unchanged — ` +
              `on disk, different from the bundle, and not written by this CLI (edited since, or ` +
              `installed before this CLI recorded what it writes). Re-run with --force to replace them:`
          )
        );
        for (const p of preservedPaths.slice(0, 10)) console.log(color.yellow(`      ${p}`));
        if (preservedPaths.length > 10) {
          console.log(color.yellow(`      … and ${preservedPaths.length - 10} more`));
        }
      }
      if (claudeMdStatus === "created") {
        console.log(color.dim(`  CLAUDE.md written to ${claudeMdTarget}`));
      } else if (claudeMdStatus === "updated") {
        console.log(color.dim(`  CLAUDE.md updated at ${claudeMdTarget}`));
      } else if (claudeMdStatus === "preserved") {
        console.log(
          color.yellow(
            `  CLAUDE.md left unchanged at ${claudeMdTarget} — a different file already exists. Re-run with --force to overwrite.`
          )
        );
      }
      if (settingsStatus === "created") {
        console.log(color.dim(`  settings.json written to ${target.settingsJsonPath}`));
      } else if (settingsStatus === "updated") {
        console.log(color.dim(`  settings.json updated at ${target.settingsJsonPath}`));
      } else if (settingsStatus === "preserved") {
        console.log(
          color.yellow(
            `  settings.json left unchanged at ${target.settingsJsonPath} — a different file already exists. Re-run with --force to overwrite.`
          )
        );
      }
      if (settingsSkippedForGlobal) {
        console.log(
          color.yellow(
            `  settings.json + hooks skipped — the permission posture is project-scoped ` +
              `(its hooks resolve via $CLAUDE_PROJECT_DIR). Install it per-project, not with --global.`
          )
        );
      }
      if (installAgents) {
        console.log(color.dim(`  ${agents.files.length} agents written to ${target.agentsDir}`));
      }
    }
  } catch (err: unknown) {
    const errno = err as NodeJS.ErrnoException | null;
    if (errno?.code === "EACCES") {
      // Report the path the OS actually rejected — writes target both the
      // skills dir and the project-root CLAUDE.md, so a hard-coded skills-dir
      // path would mislead when CLAUDE.md is the culprit.
      const failedPath = errno.path ?? target.skillsDir;
      // A local write that failed. Nothing about the caller's flags is wrong.
      process.exitCode = reportFailure(
        "local-failed",
        `Permission denied. Cannot write to ${failedPath}.`,
        `Check permissions, install skills elsewhere with --dir, or skip the ` +
          `project-root CLAUDE.md with --no-claude-md.`
      );
    } else {
      process.exitCode = handleError(err);
    }
  }
}

// Re-exported for back-compat with any importer expecting these here.
export type { InstallableSkill };
