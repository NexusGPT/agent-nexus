import os from "node:os";
import path from "node:path";

import { Command } from "commander";

import { color, isJsonMode } from "../output";
import { getSkillList, getSkills, SKILLS_NEXUS_SHA } from "../skills-content.generated";
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
Auto-detect walks UP from the current directory, notes the nearest ancestor
  holding each of three markers — a .claude/ folder, a CLAUDE.md, a .git — and
  ranks them BY KIND rather than by distance: .claude/ beats CLAUDE.md beats
  .git. So a DISTANT .claude/ outranks a NEARBY CLAUDE.md; the walk does not
  stop at the first marker it meets. It stops at your home directory, never
  picks home itself, and falls back to the CURRENT directory when none of the
  three exists. Run "nexus skills where" first and read the path — it is the
  same resolver with the writes off. An existing, differing CLAUDE.md is always
  preserved unless you pass --force.
--dir names the target outright: nothing is derived from the directory you are
  standing in. "nexus skills where --dir <path>" prints every path first.

THIS COMMAND AND "nexus claude-code install" RUN THE SAME INSTALLER. Same bundle,
same files, same manifest, same --force / --dry-run / --no-claude-md /
--no-settings. Exactly one thing differs, and it is WHERE THEY WRITE:
  nexus skills update          auto-detects the owning project root, and takes
                               --global and --here to override it.
  nexus claude-code install    NEVER walks. --dir defaults to ".claude/skills"
                               relative to the directory you are standing in,
                               and it has no --global and no --here.
So running "claude-code install" from a SUBDIRECTORY creates a .claude/ there
rather than in the project root — and because auto-detection ranks a .claude/
above every other marker at any distance, that stray folder then captures this
command for the whole tree beneath it. Prefer "skills update" unless you mean a
specific directory, and pass --dir when you do.

⚠️ "nexus skills install" IS AN ALIAS OF THIS COMMAND ("sync" too) AND IS NOT
"nexus claude-code install". The two spellings are one word apart and resolve
the target by opposite rules.

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
  $ nexus skills list --json

Notes:
  THE NAME IN THE TABLE IS NOT THE NAME THE INSTALLER TAKES. This listing prints
  each slug with its "nexus-" prefix stripped, so a row reads "workflow-builder"
  while the slug is "nexus-workflow-builder". "nexus skills update" matches the
  SLUG exactly and refuses anything else, printing the full available list — so
  copying a name out of this table is refused rather than silently ignored.
  --json carries the unstripped slug on every row, so it is the form to read a
  name FROM. It also wraps the rows in cliVersion and skillsSha, which the table
  does not show at all — "nexus skills version" prints those two on their own.`
    )
    .action(() => {
      if (isJsonMode()) {
        const v = skillsVersion();
        console.log(
          JSON.stringify(
            {
              cliVersion: v.cli,
              skillsSha: v.sha,
              skills: getSkillList().map((slug) => ({
                slug,
                description: getSkills()[slug].description,
                files: getSkills()[slug].files.length
              }))
            },
            null,
            2
          )
        );
        return;
      }

      console.log(color.bold(`\nBundled Claude Code skills (${getSkillList().length}):\n`));
      for (const slug of getSkillList()) {
        const entry = getSkills()[slug];
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

Notes:
  Skills are baked into the CLI binary, so the skills version moves with the CLI
  version. To pull newer skills: "nexus upgrade" then "nexus skills update".
  THE SKILLS COMMIT IS THE ONE THAT ANSWERS "am I running what I think I am".
  cliVersion is this binary; skillsSha is the commit its bundled skills were cut
  from. Upgrading moves both together, so a stale skillsSha means the upgrade did
  not land, never that the skills drifted from the binary.`
    )
    .action(() => {
      const v = skillsVersion();
      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            { cliVersion: v.cli, skillsSha: v.sha, skillCount: getSkillList().length },
            null,
            2
          )
        );
        return;
      }
      console.log(`\n  CLI version:   ${color.cyan(v.cli)}`);
      console.log(`  Skills commit: ${color.cyan(v.sha)}`);
      console.log(`  Skills:        ${color.cyan(String(getSkillList().length))} bundled`);
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
  $ nexus skills where --global

Notes:
  A DRY READ. This resolves the target and writes nothing, so it is the safe way
  to check where "skills update" would land before running it.
  It reports FIVE destinations, not one — skills, CLAUDE.md, settings.json, hooks
  and agents each have their own path, and "skills update" writes all five.
  --json adds projectRoot, which the printed form does not show, and returns the
  reason as its raw value where the text renders it as a sentence.
  The same --dir / --global / --here flags select the target here as they do on
  "skills update", so resolve with the flags you intend to install with.

  HOW AUTO-DETECT PICKS A ROOT, AND WHY THE NEAREST MARKER DOES NOT ALWAYS WIN.
  With no --dir, --global or --here, this walks UP from the current directory and
  notes the nearest ancestor holding each of three markers — a .claude/ folder,
  a CLAUDE.md, a .git — and then ranks them BY KIND, not by distance:

    .claude/   beats   CLAUDE.md   beats   .git

  🚨 SO A DISTANT .claude/ OUTRANKS A NEARBY CLAUDE.md. A .claude/ six levels up
  wins over a CLAUDE.md in the directory you are standing in — the walk does not
  stop at the first marker it meets. If a stray .claude/ ever landed up-tree,
  every project under it silently resolves there. Run this command before
  "skills update" and read the path, rather than assuming the closest file won.

  THE WALK STOPS AT YOUR HOME DIRECTORY and never climbs past it, and home
  itself is never chosen as a project root — otherwise a normal ~/.claude would
  capture every project you own. ~/.claude is reachable only with --global.
  WHEN NONE OF THE THREE EXISTS, THE TARGET IS THE CURRENT DIRECTORY. That is a
  real answer, not a refusal, so running "skills update" from an empty directory
  creates a .claude/ there. --json reports which rule fired, as "reason":
  explicit · global · cwd · detected-claude · detected-md · detected-git.`
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
