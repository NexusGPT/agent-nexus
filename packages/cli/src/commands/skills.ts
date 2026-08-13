import os from "node:os";
import path from "node:path";

import { Command } from "commander";

import { color, isJsonMode } from "../output";
import { SKILL_LIST, SKILLS, SKILLS_NEXUS_SHA } from "../skills-content.generated";
import { confirmable } from "../util/confirm";
import { type ClaudeTarget, resolveClaudeTarget, type TargetReason } from "../util/skills-install";
import { runSkillsInstallToTarget, type SkillsInstallOpts } from "./claude-code";

// Short, human-friendly skills version: CLI version + bundled-skills commit.
function skillsVersion(): { cli: string; sha: string; short: string } {
  const cli = (require("../../package.json") as { version: string }).version;
  const sha = SKILLS_NEXUS_SHA;
  return { cli, sha, short: sha.slice(0, 12) };
}

function describeReason(reason: TargetReason, root: string): string {
  switch (reason) {
    case "explicit":
      return `using the directory you passed (--dir)`;
    case "global":
      return `installing globally into ${root}`;
    case "detected-claude":
      return `found an existing .claude folder at ${root}`;
    case "detected-md":
      return `found CLAUDE.md at ${root}`;
    case "detected-git":
      return `using the git repo root ${root}`;
    case "cwd":
      return `no project marker found — using the current directory ${root}`;
  }
}

/**
 * When the auto-detected root differs from where the user is standing, ask
 * which location they mean. This is the "intelligent and/or interactive enough
 * to know where the claude files sit" requirement — and the guard against
 * writing into the wrong folder. Non-interactive runs (or --yes/--force) keep
 * the detected default.
 */
async function maybePickLocation(
  detected: ClaudeTarget,
  opts: SkillsInstallOpts,
  cwd: string,
  homeDir: string
): Promise<ClaudeTarget | null> {
  const here = path.resolve(cwd);
  const isExplicit = Boolean(opts.dir || opts.global || opts.here);
  const sameAsHere = detected.projectRoot === here;

  // Nothing to disambiguate: explicit flag, already in the root, --json (the
  // picker would block on stdin and corrupt the JSON document), --yes/--force,
  // or we can't prompt. Detection stands.
  if (isExplicit || sameAsHere || isJsonMode() || opts.yes || opts.force || !process.stdout.isTTY) {
    return detected;
  }

  console.log(
    color.bold("\nWhere should the skills go?\n") +
      color.dim(`  Detected: ${describeReason(detected.reason, detected.projectRoot)}\n`)
  );
  console.log(
    `  ${color.cyan("1")}  ${detected.projectRoot}   ${color.dim("(detected — default)")}`
  );
  console.log(`  ${color.cyan("2")}  ${here}   ${color.dim("(current directory)")}`);
  console.log(`  ${color.cyan("3")}  ${path.join(homeDir, ".claude")}   ${color.dim("(global)")}`);
  console.log();

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Choose [1/2/3, default 1]: ")).trim();
  rl.close();

  switch (answer) {
    case "":
    case "1":
      return detected;
    case "2":
      return resolveClaudeTarget({ ...opts, here: true }, cwd, homeDir);
    case "3":
      return resolveClaudeTarget({ ...opts, global: true }, cwd, homeDir);
    default:
      console.log(color.yellow("Unrecognized choice — aborting. Re-run and pick 1, 2, or 3."));
      return null;
  }
}

export function registerSkillsCommands(program: Command): void {
  const skills = program
    .command("skills")
    .description("Manage the Claude Code skills + CLAUDE.md bundled with this CLI version");

  // ── update ──────────────────────────────────────────────────────────────────
  //
  // The canonical command (CTO note on NEX-2445): distribute the latest
  // `.claude` (CLAUDE.md + skills/) into the user's project. Separate from
  // `nexus upgrade` (which only updates the binary). Auto-detects the owning
  // project's .claude folder so it never drops a stray copy into a subfolder
  // or overrides another project's CLAUDE.md.

  confirmable(skills.command("update"))
    .alias("install")
    .alias("sync")
    .description("Install/refresh the bundled Claude Code skills + CLAUDE.md into your project")
    .argument("[skills...]", "Skill slugs to install (omit for all)")
    .option("--dir <path>", "Explicit target skills directory (skips auto-detection)")
    .option("--global", "Install into the user-global ~/.claude instead of a project")
    .option("--here", "Use the current directory; skip walking up to the project root")
    .option("--force", "Replace files this CLI did not write (see Notes) without prompting")
    .option("--dry-run", "Show what would change without writing")
    .option("--no-claude-md", "Skip writing the CLAUDE.md system prompt to the project root")
    .option(
      "--no-settings",
      "Skip writing .claude/settings.json + .claude/hooks (permission posture)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skills update                      # Detect this project's .claude and refresh it
  $ nexus skills update --yes                # Non-interactive: use the detected location
  $ nexus skills update --global             # Install into ~/.claude (user-wide)
  $ nexus skills update --here               # Force the current directory
  $ nexus skills update --dir ./x/.claude/skills   # Explicit target
  $ nexus skills update --dry-run            # Preview only
  $ nexus skills update nexus-workflow-builder      # A single skill

How the target is chosen (most specific first):
  --dir > --global > --here > auto-detect.
Auto-detect walks up from the current directory and picks the first of:
  an existing .claude/ folder, a CLAUDE.md, then the git repo root. Walking
  up to the OWNING project root is what stops a stray .claude landing in a
  subfolder, or another folder's CLAUDE.md being overwritten. An existing,
  differing CLAUDE.md is always preserved unless you pass --force.
--dir names the target outright: nothing is derived from the directory you are
  standing in. "nexus skills where --dir <path>" prints every path first.

Notes:
  YOUR OWN EDITS TO SKILLS, HOOKS AND AGENTS ARE NEVER OVERWRITTEN SILENTLY.
  Each install records a checksum of every file it writes, in
  .claude/.nexus-install-manifest.json. Next time, a file still matching that
  record is refreshed; one that does not is LEFT ALONE and named in the output,
  and only --force replaces it. A tree installed before this CLI kept that
  record has no checksums, so its differing files are preserved as well — pass
  --force once to adopt them.

Skills are version-locked to the CLI binary — run "nexus skills version" to
see the bundle commit, and "nexus upgrade" (then re-run this) to pull newer
skills. No network calls, no API key required.`
    )
    .action(async (skillArgs: string[], opts: SkillsInstallOpts) => {
      const cwd = process.cwd();
      const homeDir = os.homedir();
      const detected = resolveClaudeTarget(opts, cwd, homeDir);
      const chosen = await maybePickLocation(detected, opts, cwd, homeDir);
      if (!chosen) {
        process.exitCode = 1;
        return;
      }

      if (!isJsonMode()) {
        const v = skillsVersion();
        console.log(color.dim(`Skills bundle: CLI ${v.cli} · skills-nexus @ ${v.short}`));
      }

      await runSkillsInstallToTarget(skillArgs, chosen, opts);
    });

  // ── list ────────────────────────────────────────────────────────────────────

  skills
    .command("list")
    .description("List the Claude Code skills bundled with this CLI version")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skills list
  $ nexus skills list --json`
    )
    .action(() => {
      if (isJsonMode()) {
        const v = skillsVersion();
        console.log(
          JSON.stringify(
            {
              cliVersion: v.cli,
              skillsSha: v.sha,
              skills: SKILL_LIST.map((slug) => ({
                slug,
                description: SKILLS[slug].description,
                files: SKILLS[slug].files.length
              }))
            },
            null,
            2
          )
        );
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
      console.log(color.dim(`Install the latest skills: nexus skills update\n`));
    });

  // ── version ─────────────────────────────────────────────────────────────────

  skills
    .command("version")
    .description("Show the CLI + bundled-skills commit this binary ships")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skills version
  $ nexus skills version --json

Skills are baked into the CLI binary, so the skills version moves with the CLI
version. To pull newer skills: "nexus upgrade" then "nexus skills update".`
    )
    .action(() => {
      const v = skillsVersion();
      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            { cliVersion: v.cli, skillsSha: v.sha, skillCount: SKILL_LIST.length },
            null,
            2
          )
        );
        return;
      }
      console.log(`\n  CLI version:   ${color.cyan(v.cli)}`);
      console.log(`  Skills commit: ${color.cyan(v.sha)}`);
      console.log(`  Skills:        ${color.cyan(String(SKILL_LIST.length))} bundled`);
      console.log(color.dim(`\n  Refresh: nexus upgrade && nexus skills update\n`));
    });

  // ── where ───────────────────────────────────────────────────────────────────

  skills
    .command("where")
    .description("Show where 'nexus skills update' would write, without changing anything")
    .option("--dir <path>", "Explicit target skills directory")
    .option("--global", "Resolve the user-global ~/.claude target")
    .option("--here", "Resolve the current directory")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skills where
  $ nexus skills where --json
  $ nexus skills where --global`
    )
    .action((opts: SkillsInstallOpts) => {
      const target = resolveClaudeTarget(opts);
      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              projectRoot: target.projectRoot,
              skillsDir: target.skillsDir,
              claudeMdPath: target.claudeMdPath,
              settingsJsonPath: target.settingsJsonPath,
              hooksDir: target.hooksDir,
              agentsDir: target.agentsDir,
              reason: target.reason
            },
            null,
            2
          )
        );
        return;
      }
      console.log(`\n  ${describeReason(target.reason, target.projectRoot)}\n`);
      console.log(`  Skills →    ${color.cyan(target.skillsDir)}`);
      console.log(`  CLAUDE.md → ${color.cyan(target.claudeMdPath)}`);
      console.log(`  settings →  ${color.cyan(target.settingsJsonPath)}`);
      console.log(`  hooks →     ${color.cyan(target.hooksDir)}`);
      console.log(`  agents →    ${color.cyan(target.agentsDir)}\n`);
    });
}
