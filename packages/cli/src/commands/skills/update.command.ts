import os from "node:os";

import type { Command } from "commander";

import {
  type CorpusFlags,
  platformIo,
  resolveCorpusForCommand,
  withCorpusFlags
} from "../../skills-corpus/command";
import { resolveClaudeTarget } from "../../util/claude-target";
import { confirmable } from "../../util/confirm";
import {
  refusedBeforeCorpus,
  runSkillsInstallToTarget,
  type SkillsInstallOpts
} from "../claude-code";
import { maybePickLocation } from "./update.pick-location";

const UPDATE_HELP = `
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
  .claude/.nexus-install-manifest.json.`;

/**
 * `nexus skills update` (aliases `install`, `sync`)
 *
 * The canonical command (CTO note on NEX-2445): distribute the latest
 * `.claude` (CLAUDE.md + skills/) into the user's project. Separate from
 * `nexus upgrade` (which only updates the binary). Auto-detects the owning
 * project's .claude folder so it never drops a stray copy into a subfolder
 * or overrides another project's CLAUDE.md.
 */
export function registerSkillsUpdateCommand(skills: Command, _program: Command): void {
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
    .addHelpText("after", UPDATE_HELP)
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
}
