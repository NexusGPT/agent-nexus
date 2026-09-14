import os from "node:os";
import path from "node:path";

import { Command } from "commander";

import { color, isJsonMode } from "../output";
import { getSkillList, SKILLS_NEXUS_SHA } from "../skills-content.generated";
import {
  type CorpusFlags,
  describeCorpus,
  platformIo,
  resolveCorpusForCommand,
  withCorpusFlags
} from "../skills-corpus/command";
import { fetchManifest, PlatformCorpusError } from "../skills-corpus/platform";
import { confirmable, promptLine, promptStream } from "../util/confirm";
import { type ClaudeTarget, resolveClaudeTarget, type TargetReason } from "../util/skills-install";
import {
  refusedBeforeCorpus,
  runSkillsInstallToTarget,
  type SkillsInstallOpts
} from "./claude-code";

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
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT DECIDES ON STDIN, AND IT USED TO DECIDE ON STDOUT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This is not the destructive confirmation — that one lives in
 * `runSkillsInstallToTarget` and has always gone through `confirmDestructive`.
 * It is the OTHER question this command asks, and it carried the exact defect
 * `util/confirm` exists to delete, three ways over:
 *
 *   - `nexus skills update > log` from a real keyboard. stdout is a pipe, so the
 *     picker was skipped and dozens of files went to the detected root with
 *     nobody asked which root that was.
 *   - `echo 2 | nexus skills update` at a terminal. stdout is a terminal, so it
 *     asked — and consumed an answer arriving from a script rather than a person.
 *   - `nexus skills update < /dev/null` at a terminal. It asked, stdin had
 *     already ended, and nothing could ever settle the promise. The question
 *     printed and the process sat there.
 *
 * A question is answered on STDIN, so stdin is the only stream that says whether
 * anyone can answer. And the question goes to {@link promptStream} — stderr in
 * every case a person can read it — so redirecting stdout no longer hides the
 * prompt behind the wait.
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
  // or nobody is there to answer. Detection stands.
  if (isExplicit || sameAsHere || isJsonMode() || opts.yes || opts.force || !process.stdin.isTTY) {
    return detected;
  }

  // THE OPTIONS GO WHERE THE QUESTION GOES. They are what the answer refers to;
  // on `console.log` with stdout redirected the operator is asked to choose
  // between three paths and shown none of them.
  promptLine(
    color.bold("\nWhere should the skills go?\n") +
      color.dim(`  Detected: ${describeReason(detected.reason, detected.projectRoot)}\n`)
  );
  promptLine(
    `  ${color.cyan("1")}  ${detected.projectRoot}   ${color.dim("(detected — default)")}`
  );
  promptLine(`  ${color.cyan("2")}  ${here}   ${color.dim("(current directory)")}`);
  promptLine(`  ${color.cyan("3")}  ${path.join(homeDir, ".claude")}   ${color.dim("(global)")}`);
  promptLine();

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: promptStream() });
  let answer: string;
  try {
    answer = (await rl.question("Choose [1/2/3, default 1]: ")).trim();
  } finally {
    // `finally`, not a close on the happy path: an interface left open holds
    // stdin and the process never exits, so a read error would hang rather than
    // report.
    rl.close();
  }

  switch (answer) {
    case "":
    case "1":
      return detected;
    case "2":
      return resolveClaudeTarget({ ...opts, here: true }, cwd, homeDir);
    case "3":
      return resolveClaudeTarget({ ...opts, global: true }, cwd, homeDir);
    default:
      promptLine(color.yellow("Unrecognized choice — aborting. Re-run and pick 1, 2, or 3."));
      return null;
  }
}

export function registerSkillsCommands(program: Command): void {
  const skills = program
    .command("skills")
    .description("Install and inspect the Nexus Claude Code skills + CLAUDE.md");

  // ── update ──────────────────────────────────────────────────────────────────
  //
  // The canonical command (CTO note on NEX-2445): distribute the latest
  // `.claude` (CLAUDE.md + skills/) into the user's project. Separate from
  // `nexus upgrade` (which only updates the binary). Auto-detects the owning
  // project's .claude folder so it never drops a stray copy into a subfolder
  // or overrides another project's CLAUDE.md.

  withCorpusFlags(confirmable(skills.command("update")))
    .alias("install")
    .alias("sync")
    .description("Install/refresh the latest Claude Code skills + CLAUDE.md into your project")
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
  $ nexus skills update --bundled            # Offline: the skills bundled with this CLI
  $ nexus skills update --skills-ref 416b57391347212330eb85fc78f27f86b2303b59   # One exact commit

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

THIS COMMAND AND "nexus claude-code install" RUN THE SAME INSTALLER. Same corpus,
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

  WHERE THE SKILLS COME FROM. The latest skills corpus the platform serves, read
  with no API key: GET <base-url>/api/cli/skills/manifest, then the corpus it
  names, refused unless its bytes match the manifest's sha256. The skills
  repository's deploy publishes that corpus after its checks pass, so new skills
  reach this command without a new CLI release — no "nexus upgrade" needed.
  WHEN THE PLATFORM CANNOT BE USED, THE BUNDLED SKILLS ARE INSTALLED INSTEAD —
  offline, a timeout, an error, a checksum mismatch, or a corpus that declares
  it needs a newer CLI (that last one also tells you to run "nexus upgrade").
  The reason is printed on stderr, and "corpus.fallbackReason" carries it under
  --json.
  --bundled installs the skills bundled with this CLI and makes no network call.
  --skills-ref <commit> installs exactly that commit and NEVER falls back: a pin
  that quietly installed something else would not be reproducible, so a failed
  read is an error. It takes the full 40-character sha.
  The commit installed is printed, and recorded as "corpus" in
  .claude/.nexus-install-manifest.json.`
    )
    .action(
      async (skillArgs: string[], opts: SkillsInstallOpts & CorpusFlags, command: Command) => {
        const cwd = process.cwd();
        const homeDir = os.homedir();
        const detected = resolveClaudeTarget(opts, cwd, homeDir);
        const chosen = await maybePickLocation(detected, opts, cwd, homeDir);
        if (!chosen) {
          process.exitCode = 1;
          return;
        }

        if (await refusedBeforeCorpus(opts)) return;
        const io = platformIo(command);
        const resolved = await resolveCorpusForCommand(opts, io);
        if (!resolved) return;

        await runSkillsInstallToTarget(skillArgs, chosen, opts, resolved, io);
      }
    );

  // ── list ────────────────────────────────────────────────────────────────────

  withCorpusFlags(skills.command("list"))
    .description("List the Claude Code skills an install would write")
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
  name FROM. It also wraps the rows in cliVersion, skillsSha and source, which
  the table shows only in its last line.
  THIS LISTS WHAT AN INSTALL WOULD WRITE, FROM THE SAME SOURCE: the latest skills
  corpus on the platform, or the skills bundled with this CLI when the platform
  cannot be used. skillsSha is the commit listed, and source says which it was
  ("platform", "pinned" or "bundled"). --bundled and --skills-ref pick the
  source here exactly as they do on "nexus skills update".`
    )
    .action(async (opts: CorpusFlags, command: Command) => {
      const io = platformIo(command);
      const resolved = await resolveCorpusForCommand(opts, io);
      if (!resolved) return;
      const { corpus } = resolved;

      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              cliVersion: io.cliVersion,
              skillsSha: corpus.commitSha,
              source: resolved.source,
              skills: corpus.skillList.map((slug) => ({
                slug,
                description: corpus.skills[slug].description,
                files: corpus.skills[slug].files.length
              }))
            },
            null,
            2
          )
        );
        return;
      }

      console.log(color.bold(`\nClaude Code skills (${corpus.skillList.length}):\n`));
      for (const slug of corpus.skillList) {
        const entry = corpus.skills[slug];
        const name = slug.replace("nexus-", "");
        console.log(`  ${color.cyan(name.padEnd(22))} ${entry.description}`);
        console.log(`  ${"".padEnd(22)} ${color.dim(`${entry.files.length} files`)}`);
        console.log();
      }
      console.log(color.dim(describeCorpus(resolved, io)));
      console.log(color.dim(`Install them: nexus skills update\n`));
    });

  // ── version ─────────────────────────────────────────────────────────────────

  skills
    .command("version")
    .description("Show this CLI's version, its bundled skills commit, and the latest one")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus skills version
  $ nexus skills version --json

Notes:
  TWO COMMITS, AND THEY ANSWER DIFFERENT QUESTIONS. skillsSha is the commit the
  skills BUNDLED WITH THIS CLI were cut from — the fallback an install uses
  offline, or with --bundled — and skillCount counts those skills. Both move only
  when the CLI is upgraded.
  latestSkillsSha is the latest corpus the platform serves — what "nexus skills
  update" installs by default. It moves every time the skills repository
  deploys, with no CLI release. null means the platform could not be read, and
  latestError says why; nothing else in the output changes.
  latestMinCliVersion is the oldest CLI that latest corpus declares it is written
  for. When it is newer than cliVersion, "nexus skills update" installs the
  bundled skills instead and tells you to run "nexus upgrade".
  The commit a project actually has installed is recorded as "corpus" in its
  .claude/.nexus-install-manifest.json.`
    )
    .action(async (_opts: unknown, command: Command) => {
      const io = platformIo(command);
      let latestSkillsSha: string | null = null;
      let latestMinCliVersion: string | null = null;
      let latestError: string | null = null;
      try {
        const manifest = await fetchManifest(io, "latest");
        latestSkillsSha = manifest.commitSha;
        latestMinCliVersion = manifest.minCliVersion;
      } catch (error: unknown) {
        if (!(error instanceof PlatformCorpusError)) throw error;
        latestError = error.message;
      }

      if (isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              cliVersion: io.cliVersion,
              skillsSha: SKILLS_NEXUS_SHA,
              skillCount: getSkillList().length,
              latestSkillsSha,
              latestMinCliVersion,
              latestError
            },
            null,
            2
          )
        );
        return;
      }
      console.log(`\n  CLI version:           ${color.cyan(io.cliVersion)}`);
      console.log(`  Bundled skills commit: ${color.cyan(SKILLS_NEXUS_SHA)}`);
      console.log(`  Bundled skills:        ${color.cyan(String(getSkillList().length))}`);
      console.log(
        latestSkillsSha === null
          ? `  Latest skills commit:  ${color.yellow(`unknown — ${latestError}`)}`
          : `  Latest skills commit:  ${color.cyan(latestSkillsSha)}` +
              (latestMinCliVersion ? color.dim(` (needs CLI ${latestMinCliVersion}+)`) : "")
      );
      console.log(color.dim(`\n  Install the latest: nexus skills update\n`));
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
