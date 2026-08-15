import { execSync } from "node:child_process";

import { Command } from "commander";

import { CLI_UPGRADE_NOT_RESOLVED, printFailure, reportFailure } from "../errors";
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
 * 🚨 IT IS NOT 1, AND THE HELP TEXT'S "EXIT 1 MEANS NOTHING CHANGED" IS WHY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both existing failures leave the machine exactly as it was — the registry was
 * unreachable, or the install command itself failed — so a caller reading 1 can
 * retry and lose nothing. This outcome is the opposite: a package was written to
 * disk, and RETRYING IS THE TRAP. It writes the same bytes to the same directory
 * forever while the shell keeps resolving the other copy, which is precisely the
 * loop this whole change exists to end.
 *
 * A code that separates "retry may help" from "retrying is the thing that wasted
 * your week" is worth its own value. `|| handle` still catches it; only a caller
 * branching on `== 1` sees the difference, and that caller was being told
 * "nothing changed" about a machine that had changed.
 */
const EXIT_INSTALLED_BUT_NOT_RESOLVED = 2;

/** All hidden aliases that also trigger the upgrade action. */
export const UPGRADE_ALIASES = [
  "update",
  "latest",
  "up",
  "install",
  "reinstall",
  "refresh",
  "fetch",
  "pull",
  "sync",
  "get",
  "download",
  "self-update",
  "selfupdate",
  "self-upgrade",
  "selfupgrade",
  "new",
  "patch",
  "bump"
];

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
}

function realEnvironment(currentVersion: string): UpgradeEnvironment {
  return {
    currentVersion,
    fetchLatest: fetchLatestVersion,
    installCommand: () => getGlobalInstallCommand(PACKAGE_NAME),
    install: (command) => {
      execSync(command, { stdio: "inherit" });
    },
    resolve: () => resolveCandidates(BINARY_NAME)
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
    // One action, NINETEEN commands: `upgrade` plus its eighteen hidden
    // aliases, every one of which failed with an empty stdout under --json.
    // (This line read TWENTY while describing nineteen; the roster is the
    // authority and `upgrade-verifies-what-it-claims.test.ts` counts it.)
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

  if (verdict.kind === "verified") {
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
      `Installed ${PACKAGE_NAME}@${latest}, but no "${BINARY_NAME}" is on your PATH.`,
      CLI_UPGRADE_NOT_RESOLVED,
      hintLines(
        installedWith,
        "",
        `Nothing named "${BINARY_NAME}" resolves on this PATH, so the copy you just`,
        "ran came from somewhere a shell does not search — npx, a project",
        "dependency, a vendored copy, or an explicit path. The install created a",
        "SEPARATE global copy and your next run still uses the old one.",
        "",
        "Upgrade it through whatever installed it, or add the global bin directory",
        "to your PATH.",
        "",
        `Check for yourself with: which -a ${BINARY_NAME}`
      )
    );
    return;
  }

  const list = formatResolutionList(candidates);

  if (verdict.kind === "unreadable") {
    printFailure(
      `Installed ${PACKAGE_NAME}@${latest}, but the "${BINARY_NAME}" your shell runs will not start.`,
      CLI_UPGRADE_NOT_RESOLVED,
      hintLines(
        installedWith,
        "",
        `${verdict.binary} failed to report a version:`,
        `  ${verdict.failure.split("\n").join("\n    ")}`,
        "",
        `Every "${BINARY_NAME}" on your PATH, in the order a shell searches:`,
        "",
        list,
        "",
        "A shim left pointing at a directory the package manager has since",
        "collected fails exactly this way. Delete that first entry and run the",
        "install command above again, so the shim is rewritten.",
        "",
        `Check for yourself with: which -a ${BINARY_NAME}`
      )
    );
    return;
  }

  printFailure(
    `Installed ${PACKAGE_NAME}@${latest}, but the "${BINARY_NAME}" your shell runs is still ${verdict.version}.`,
    CLI_UPGRADE_NOT_RESOLVED,
    hintLines(
      installedWith,
      "",
      "The install succeeded. It did not land in front of the copy your shell",
      "picks, so running this again changes nothing.",
      "",
      `Every "${BINARY_NAME}" on your PATH, in the order a shell searches:`,
      "",
      list,
      "",
      "The FIRST entry wins. Delete it, or put the directory holding the new",
      "one earlier in PATH.",
      "",
      `Check for yourself with: which -a ${BINARY_NAME}`
    )
  );
}

export function registerUpgradeCommand(program: Command): void {
  const currentVersion: string = (require("../../package.json") as { version: string }).version;

  // ONE closure, nineteen registrations, so a change to the upgrade cannot land
  // on some entry points and miss the rest. That is NOT assertable by identity —
  // commander wraps every `.action(fn)` in its own handler, so the tree holds
  // nineteen distinct handlers either way. `upgrade-verifies-what-it-claims.test.ts`
  // therefore DRIVES all nineteen.
  const upgradeAction = async () => {
    await runUpgrade(realEnvironment(currentVersion));
  };

  program
    .command("upgrade")
    .description("Upgrade the Nexus CLI to the latest version")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus upgrade

Notes:
  IT NEEDS NO API KEY, NO BASE URL AND NO PROFILE. Unlike every resource command
  group, this one does not call the Public API — it manages your local CLI
  install and touches nothing in your workspace. An unauthenticated or
  logged-out machine can upgrade normally.

  IT RUNS A GLOBAL PACKAGE-MANAGER INSTALL AS YOU. The manager is inferred from
  where the running binary actually lives — pnpm, yarn, otherwise npm — and the
  install runs with your permissions and no elevation. If your global prefix
  needs root, the install fails rather than prompting; the error prints the
  exact command, so re-run that one yourself with whatever privilege it needs.

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

  THREE EXIT CODES, AND THE TWO NON-ZERO ONES MEAN OPPOSITE THINGS.
    0  You are on the latest version, and that was read back, not assumed.
    1  NOTHING CHANGED — the registry was unreachable, or the install command
       failed. Retrying is reasonable.
    2  The install SUCCEEDED and your shell still resolves a different copy.
       Nothing about your PATH changed, so RETRYING WILL NOT HELP; the output
       names the file that wins and what to do about it.`
    )
    .action(upgradeAction);

  // Register hidden aliases so any intuitive word triggers the upgrade
  for (const alias of UPGRADE_ALIASES) {
    program.command(alias, { hidden: true }).action(upgradeAction);
  }
}
