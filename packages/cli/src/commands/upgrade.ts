import { execSync } from "node:child_process";

import { Command } from "commander";

import {
  CLI_UPGRADE_NOT_RESOLVED,
  CLI_UPGRADE_NOT_VERIFIED_FOR_YOU,
  printFailure,
  reportFailure
} from "../errors";
import { EXIT_CODES } from "../exit-codes";
import { color, printSuccess } from "../output";
import { getGlobalInstallCommand } from "../util/package-manager";
import {
  formatResolutionList,
  judgeResolution,
  type PathCandidate,
  resolveCandidates
} from "../util/resolve-on-path";
import { compareSemver, fetchLatestVersion } from "../util/version-check";

const PACKAGE_NAME = "@agent-nexus/cli";

/** The command name a shell resolves. `package.json`'s `bin` key, in one place. */
const BINARY_NAME = "nexus";

/**
 * Exit code for "the install succeeded and your shell still runs the old one".
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT WAS 2, AND 2 ALREADY MEANT "NOT AUTHENTICATED" IN THE ADMIN TREE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both other failures leave the machine exactly as it was — the registry was
 * unreachable, or the install command itself failed — so a caller reading 1 can
 * retry and lose nothing. This outcome is the opposite: a package was written to
 * disk, and RETRYING IS THE TRAP. It writes the same bytes to the same directory
 * forever while the shell keeps resolving the other copy, which is precisely the
 * loop this outcome exists to end. That distinction is real and it keeps its own
 * code; what it does not keep is a NUMBER this binary spends on something else.
 *
 * `outcome-not-reached` is the general name for it, and this command is only its
 * first caller. See `src/exit-codes.ts`.
 */
export const EXIT_INSTALLED_BUT_NOT_RESOLVED = EXIT_CODES["outcome-not-reached"];

/**
 * Exit code for "the install succeeded and I cannot check it for YOU".
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT IS NOT {@link EXIT_INSTALLED_BUT_NOT_RESOLVED}, BECAUSE THAT IS A
 *    FINDING AND THIS IS THE ABSENCE OF ONE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `outcome-not-reached` says something was READ BACK and disagreed — a specific file wins on
 * your PATH and here it is. Under `sudo` nothing of the sort was established:
 * the install ran as root and the verification read the ROOT process's
 * environment, and whether that is your shell's environment depends on a
 * sudoers configuration this command cannot see.
 *
 * Reporting that as a finding would name a PATH problem that may not exist. Reporting it
 * as 0 is the defect this whole file exists to prevent — a success sentence
 * about a machine nobody checked. An UNMEASURED outcome is neither, and it gets
 * its own code so a script can tell "I checked and it is wrong" from "I could
 * not check".
 *
 * Retrying does not help here either, and for a different reason: the
 * same `sudo` produces the same non-answer forever. The remedy is one command
 * WITHOUT `sudo`, which the output names.
 */
export const EXIT_VERIFICATION_NOT_YOURS = EXIT_CODES.unmeasured;

/**
 * The alternative spellings of `upgrade`, DECLARED ON THE COMMAND ITSELF.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚨 A SPELLING BELONGS HERE ONLY IF IT CANNOT MEAN ANYTHING ELSE IN THIS CLI.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This list was eighteen HIDDEN top-level commands, added so that "any
 * intuitive word triggers the upgrade". That rule has no stopping point, and it
 * reached words this CLI already uses for something else: `get` ends 40 leaves,
 * `update` ends 29, and `install` and `sync` are declared aliases of `skills
 * update`, which installs the skills bundle rather than the binary. Typed bare,
 * every one of them replaced the running binary instead — off every help screen,
 * so nothing warned anyone.
 *
 * The rule that replaced it is the one above, and it has a written boundary:
 * `update`, `latest` and `up` are the three the published docs
 * (`content/docs/cli/installation.mdx`) already instruct people to type. Adding
 * a fourth means writing it down there first.
 *
 * They are `.alias()` calls on `upgrade` rather than separate commands, which is
 * this CLI's own idiom (`task-eval` → `eval`, `workspace unmount` → `umount`).
 * One command, one help entry, and a guess that misses now prints "unknown
 * command" and points at `--help` instead of silently reinstalling.
 *
 * ⚠️ COMMANDER RENDERS ONLY THE FIRST ALIAS in a usage line, so that entry reads
 * `upgrade|update` — not `upgrade|update|latest|up`. `task-eval|eval` hides this,
 * because one alias is the whole list. So `latest` and `up` would be as
 * undiscoverable as the eighteen were, and the Notes block below names all three
 * explicitly to close that gap. Verify against the binary, never against this
 * comment: `node dist/index.js --help | grep upgrade`.
 *
 * ⚠️ `index.ts` still needs the WORDS, because it reads `process.argv[2]` to
 * skip the auto-update after the upgrade ran. Commander reports an aliased
 * invocation under the command's NAME, so the word a user typed is not
 * recoverable from the tree.
 */
export const UPGRADE_ALIASES = ["update", "latest", "up"];

/**
 * Everything the upgrade touches outside itself, in one injectable surface.
 *
 * It exists so the SHIPPED path and the TESTED path are the same code. The
 * defect being fixed here was not a missing branch — it was a claim printed
 * without a check, and a spec can only catch that class by driving the real
 * action and reading what it actually printed. Stubbing the registry, the
 * installer and the PATH lookup is what makes that possible with no network and
 * no global write.
 */
export interface UpgradeEnvironment {
  /** The version of the CLI making this call. */
  readonly currentVersion: string;
  /** The newest published version, or null when the registry was unreachable. */
  fetchLatest(): Promise<string | null>;
  /** The exact command line the install will run — printed on every failure. */
  installCommand(): string;
  /** Runs that command. Throws on a non-zero exit. */
  install(command: string): void;
  /** `which -a nexus`, every hit probed for the version it reports. */
  resolve(): readonly PathCandidate[];
  /**
   * The user who invoked `sudo`, or null when this is not an elevated run.
   *
   * 🚨 IT IS ON THE SEAM RATHER THAN READ INLINE, because the whole point is
   * that this process's environment is NOT the one the answer is about. A spec
   * cannot re-enter `sudo`, so the fact has to be injectable or the elevated
   * outcomes are unreachable and therefore untested.
   */
  readonly elevatedBy: string | null;
}

function realEnvironment(currentVersion: string): UpgradeEnvironment {
  return {
    currentVersion,
    fetchLatest: fetchLatestVersion,
    installCommand: () => getGlobalInstallCommand(PACKAGE_NAME),
    install: (command) => {
      execSync(command, { stdio: "inherit" });
    },
    resolve: () => resolveCandidates(BINARY_NAME),
    // `SUDO_USER` is set by sudo itself and names the invoking account. It is
    // the only marker available: a root shell and a sudo'd process are the same
    // uid, and only this variable separates them.
    elevatedBy: process.env.SUDO_USER ?? null
  };
}

/**
 * Build a hint block from lines, flattening any group of lines passed in.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 AN ARRAY ELEMENT INSIDE `[...].join("\n  ")` STRINGIFIES WITH COMMAS, AND
 *    THE BLOCK COLLAPSES ONTO ONE LINE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That regression shipped once in this file, on the resolution list — the entire
 * diagnostic this change exists to print came out comma-separated on a single
 * line. Every test still passed, because they matched SUBSTRINGS rather than
 * structure, and a one-line render contains every substring a multi-line one
 * does.
 *
 * The remedy is not a spread anyone has to remember. `flat()` makes a group of
 * lines a legal argument, so the misuse is unrepresentable rather than reviewed.
 */
function hintLines(...parts: Array<string | readonly string[]>): string {
  return parts.flat().join("\n  ");
}

/**
 * Check, install, then VERIFY — and never claim the third from the second.
 *
 * The old body ended at `execSync(...)` followed by "Successfully upgraded".
 * Every sentence after the install is now a statement about something that was
 * re-read, and the one case where nothing can be re-read says so instead of
 * borrowing the success message.
 */
export async function runUpgrade(env: UpgradeEnvironment): Promise<void> {
  const { currentVersion } = env;

  process.stderr.write(`Current version: ${color.cyan(currentVersion)}\n`);
  process.stderr.write("Checking for updates…\n");

  const latest = await env.fetchLatest();

  if (!latest) {
    // One command under four spellings — `upgrade` and the three aliases — and
    // every one of them failed with an empty stdout under --json. The roster is
    // the authority and `upgrade-verifies-what-it-claims.test.ts` counts it.
    process.exitCode = reportFailure(
      "connection-failed",
      "Failed to check for updates.",
      "The npm registry was unreachable. Check your network and try again."
    );
    return;
  }

  if (compareSemver(currentVersion, latest) >= 0) {
    printSuccess(`Already up-to-date (${currentVersion}).`, { version: currentVersion });
    return;
  }

  process.stderr.write(`Upgrading ${color.yellow(currentVersion)} → ${color.green(latest)}…\n`);

  if (env.elevatedBy !== null) {
    // Before the install, not after: the reader can still cancel, and the
    // sentence is about what the install is ABOUT TO DO rather than about a
    // result. It goes to stderr so `--json` still emits exactly one document.
    process.stderr.write(
      `${color.yellow("Running under sudo.")} The install runs as root, so it writes root's\n` +
        `global prefix rather than ${env.elevatedBy}'s — and the check afterwards can only read\n` +
        `root's environment. Run it WITHOUT sudo unless your global prefix needs root.\n`
    );
  }

  const installCmd = env.installCommand();

  try {
    env.install(installCmd);
  } catch {
    process.exitCode = reportFailure(
      "local-failed",
      "Upgrade failed.",
      `Try running manually: ${installCmd}`
    );
    return;
  }

  reportVerification(env, latest, installCmd);
}

/**
 * The install exited 0. Say what that is worth by reading the machine back.
 *
 * The four outcomes share one opening sentence — "Installed <pkg>@<v>" — because
 * that is the only fact the install itself established. What follows is read
 * from the PATH, not inferred from the exit code.
 */
function reportVerification(env: UpgradeEnvironment, latest: string, installCmd: string): void {
  const candidates = env.resolve();
  const verdict = judgeResolution(latest, candidates);
  const installedWith = `Installed with: ${installCmd}`;
  const elevated = env.elevatedBy;

  if (verdict.kind === "verified") {
    // 🚨 UNDER `sudo` THIS IS NOT AN UPGRADE FOR THE PERSON WHO TYPED IT, and
    // printing one is the exact defect the rest of this file exists to prevent:
    // a success sentence about an environment nobody checked. The install ran as
    // root and `resolve()` read the ROOT process's PATH, so a match here is a
    // statement about root's shell. Whether that is also the invoking user's
    // depends on a sudoers configuration this command cannot read.
    if (elevated !== null) {
      process.exitCode = EXIT_VERIFICATION_NOT_YOURS;
      printFailure(
        `Installed ${PACKAGE_NAME}@${latest}, but this ran under sudo — so that was NOT verified for ${elevated}.`,
        // NOT `CLI_UPGRADE_NOT_RESOLVED`. That code means "your shell resolves a
        // different copy" and its remedy is a PATH edit; a `--json` consumer
        // branching on it would collapse exit 3 into exit 2's claim, which is
        // the misdiagnosis exit 3 exists to avoid.
        CLI_UPGRADE_NOT_VERIFIED_FOR_YOU,
        hintLines(
          installedWith,
          "",
          `Root's PATH resolves ${verdict.binary}, which reports ${verdict.version}.`,
          `That is root's shell. Whether ${elevated}'s shell resolves the same file`,
          "depends on how sudo is configured here, and this command cannot see it.",
          "",
          "One command answers it, and it must NOT be run under sudo:",
          `  ${BINARY_NAME} --version`,
          "",
          `If that still reports ${env.currentVersion}, the install landed in root's`,
          `global prefix rather than ${elevated}'s. Re-run WITHOUT sudo:`,
          `  ${installCmd}`
        )
      );
      return;
    }

    printSuccess(`Upgraded to ${latest}.`, {
      from: env.currentVersion,
      to: latest,
      verified: `${verdict.binary} reports ${verdict.version}`
    });
    return;
  }

  process.exitCode = EXIT_INSTALLED_BUT_NOT_RESOLVED;

  if (verdict.kind === "unresolved") {
    printFailure(
      elevated === null
        ? `Installed ${PACKAGE_NAME}@${latest}, but no "${BINARY_NAME}" is on your PATH.`
        : `Installed ${PACKAGE_NAME}@${latest}, but no "${BINARY_NAME}" is on ROOT's PATH.`,
      CLI_UPGRADE_NOT_RESOLVED,
      hintLines(
        installedWith,
        "",
        // Under sudo the old wording sent the reader to repair a PATH that is
        // very likely fine — theirs. The empty resolution is root's, and sudo
        // commonly replaces PATH with `secure_path`, which carries no per-user
        // global bin directory at all.
        elevated === null
          ? [
              `Nothing named "${BINARY_NAME}" resolves on this PATH, so the copy you just`,
              "ran came from somewhere a shell does not search — npx, a project",
              "dependency, a vendored copy, or an explicit path. The install created a",
              "SEPARATE global copy and your next run still uses the old one.",
              "",
              "Upgrade it through whatever installed it, or add the global bin directory",
              "to your PATH."
            ]
          : [
              `Nothing named "${BINARY_NAME}" resolves on the PATH this sudo'd process`,
              `has. That is root's PATH, not ${elevated}'s — sudo commonly replaces it`,
              "with a fixed `secure_path` that carries no per-user global bin directory,",
              `so this says nothing about ${elevated}'s shell.`,
              "",
              "Re-run WITHOUT sudo, which both installs and verifies as you:",
              `  ${BINARY_NAME} upgrade`
            ],
        "",
        `Check for yourself with: which -a ${BINARY_NAME}`
      )
    );
    return;
  }

  const list = formatResolutionList(candidates);

  if (verdict.kind === "unreadable") {
    printFailure(
      elevated === null
        ? `Installed ${PACKAGE_NAME}@${latest}, but the "${BINARY_NAME}" your shell runs will not start.`
        : `Installed ${PACKAGE_NAME}@${latest}, but the "${BINARY_NAME}" ROOT's PATH resolves will not start.`,
      CLI_UPGRADE_NOT_RESOLVED,
      hintLines(
        installedWith,
        "",
        `${verdict.binary} failed to report a version:`,
        `  ${verdict.failure.split("\n").join("\n    ")}`,
        "",
        `Every "${BINARY_NAME}" on ${elevated === null ? "your" : "ROOT's"} PATH, in the order a shell searches:`,
        "",
        list,
        "",
        "A shim left pointing at a directory the package manager has since",
        "collected fails exactly this way. Delete that first entry and run the",
        "install command above again, so the shim is rewritten.",
        ...(elevated === null
          ? []
          : [
              "",
              `That is root's shim, not ${elevated}'s. Re-run WITHOUT sudo to install`,
              "and verify as yourself before repairing anything."
            ]),
        "",
        `Check for yourself with: which -a ${BINARY_NAME}`
      )
    );
    return;
  }

  printFailure(
    elevated === null
      ? `Installed ${PACKAGE_NAME}@${latest}, but the "${BINARY_NAME}" your shell runs is still ${verdict.version}.`
      : `Installed ${PACKAGE_NAME}@${latest}, but the "${BINARY_NAME}" ROOT's PATH resolves is still ${verdict.version}.`,
    CLI_UPGRADE_NOT_RESOLVED,
    hintLines(
      installedWith,
      "",
      "The install succeeded. It did not land in front of the copy that shell",
      "picks, so running this again changes nothing.",
      ...(elevated === null
        ? []
        : ["", `Re-run WITHOUT sudo to install and verify as ${elevated}.`]),
      "",
      `Every "${BINARY_NAME}" on ${elevated === null ? "your" : "ROOT's"} PATH, in the order a shell searches:`,
      "",
      list,
      "",
      // 🚨 THE DELETE ADVICE IS THE DESTRUCTIVE ONE, AND UNDER SUDO IT NAMES A
      // FILE FOUND ON ROOT'S PATH. Its twin — the unreadable branch — already
      // carries this guard; leaving it off here made the two outcomes give
      // opposite safety advice about the identical measurement. The weaker
      // "re-run without sudo" line above is not a substitute: it says what to do
      // NEXT, not that the sentence below should not be acted on yet.
      ...(elevated === null
        ? [
            "The FIRST entry wins. Delete it, or put the directory holding the new",
            "one earlier in PATH."
          ]
        : [
            `The FIRST entry wins on ROOT's PATH. Do NOT delete it on the strength`,
            `of this reading — it may not be the file ${elevated}'s shell runs, and`,
            "removing the wrong global install is not something this command can",
            "undo. Re-run without sudo first and act on what THAT reports."
          ]),
      "",
      `Check for yourself with: which -a ${BINARY_NAME}`
    )
  );
}

export function registerUpgradeCommand(program: Command): void {
  const currentVersion: string = (require("../../package.json") as { version: string }).version;

  // ONE command object now carries every spelling, so a change to the upgrade
  // reaches all of them by construction rather than by a loop anyone can forget.
  // `upgrade-verifies-what-it-claims.test.ts` still DRIVES each spelling, because
  // an alias silently failing to resolve looks identical to one that works.
  const upgradeAction = async () => {
    await runUpgrade(realEnvironment(currentVersion));
  };

  const upgrade = program
    .command("upgrade")
    .description("Upgrade the Nexus CLI to the latest version");

  // Declared on the command, so `--help` renders `upgrade|update|latest|up` and
  // the alternative spellings are DISCOVERABLE rather than hidden.
  for (const alias of UPGRADE_ALIASES) upgrade.alias(alias);

  upgrade
    .addHelpText(
      "after",
      `
Examples:
  $ nexus upgrade

Notes:
  IT ANSWERS TO FOUR SPELLINGS: "upgrade", "update", "latest" and "up". The usage
  line above shows only the first alias, so this is the one place all four are
  written down. Nothing else upgrades the CLI — a word that is not on this list
  is not a spelling of this command.

  IT NEEDS NO API KEY, NO BASE URL AND NO PROFILE. Unlike every resource command
  group, this one does not call the Public API — it manages your local CLI
  install and touches nothing in your workspace. An unauthenticated or
  logged-out machine can upgrade normally.

  IT RUNS A GLOBAL PACKAGE-MANAGER INSTALL AS YOU. The manager is inferred from
  where the running binary actually lives — pnpm, yarn, otherwise npm — and the
  install runs with your permissions and no elevation. If your global prefix
  needs root, the install fails rather than prompting; the error prints the
  exact command, so re-run that one yourself with whatever privilege it needs.

  🚨 DO NOT RUN THIS UNDER sudo UNLESS YOUR GLOBAL PREFIX GENUINELY NEEDS ROOT.
  Elevated, the install writes ROOT's global prefix rather than yours, and the
  verification below can only read ROOT's environment — so a match proves
  nothing about the shell you will type "nexus" into next. That combination is
  what produces the loop where every run reports a successful upgrade and the
  version never moves. This command now detects sudo, warns before installing,
  and REFUSES to report an upgrade it verified for somebody else: exit 11, with
  the one command that settles it.

  IT IS A NO-OP WHEN YOU ARE CURRENT. The version is checked first, and an
  already-current CLI prints its version and exits 0 without installing
  anything, so this is safe to run repeatedly and safe to put in a script.

  IT VERIFIES THE INSTALL BY RE-READING YOUR PATH, AND SUCCESS IS ONLY CLAIMED
  WHEN THAT AGREES. After the install it resolves "nexus" the way a shell does
  and asks that binary its version. Only a match prints "Upgraded"; anything
  else names what happened instead and prints EVERY "nexus" on your PATH in
  search order, because the entry that shadows the new one is never the first
  one "which nexus" shows you.

  A CLI THAT DID NOT COME FROM A GLOBAL INSTALL IS NOT UPGRADABLE HERE. Run
  through npx, vendored into a repo, or installed as a project dependency, this
  installs a SEPARATE global copy rather than replacing the one you invoked —
  so the next run of your local binary is still the old version. Upgrade those
  through whatever installed them. That case is now named as its own outcome
  instead of being reported as a successful upgrade.

THE EXIT CODES, AND EVERY NON-ZERO ONE MEANS SOMETHING DIFFERENT.
    0  You are on the latest version, and that was read back, not assumed.
    1, 7, 9  NOTHING CHANGED — the registry was unreachable (7), the install
       command failed (9), or something else went wrong (1). Retrying is
       reasonable. See "nexus --help" for the full exit-code table.

    🔴 ALL FOUR NON-ZERO CODES MOVED. This command used to answer 1 for both
    "registry unreachable" and "install failed", 2 for the PATH finding and 3
    for the unmeasured one. They are now 7, 9, 10 and 11. A script branching on
    1, 2 or 3 from THIS command must be updated — nothing here still exits 1
    except a failure with no more specific category.
    10 The install SUCCEEDED and the shell still resolves a different copy.
       Nothing about that PATH changed, so RETRYING WILL NOT HELP; the output
       names the file that wins and what to do about it.
    11 The install SUCCEEDED and it could not be checked FOR YOU — this ran
       under sudo, so the check read root's environment. That is an ABSENT
       measurement, not a failed one: nothing here says your PATH is wrong.
       Re-running under sudo gives the same non-answer; run "nexus --version"
       without sudo.

    🔴 THESE TWO MOVED. They were 2 and 3, which the rest of the binary spends
    on "not authenticated" and "permission denied". A script branching on 2 or 3
    here must be updated.`
    )
    .action(upgradeAction);
}
