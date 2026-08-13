import { execSync } from "node:child_process";

import { Command } from "commander";

import { color, printSuccess } from "../output";
import { getGlobalInstallCommand } from "../util/package-manager";
import { compareSemver, fetchLatestVersion } from "../util/version-check";

const PACKAGE_NAME = "@agent-nexus/cli";

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

export function registerUpgradeCommand(program: Command): void {
  const currentVersion: string = (require("../../package.json") as { version: string }).version;

  const upgradeAction = async () => {
    process.stderr.write(`Current version: ${color.cyan(currentVersion)}\n`);
    process.stderr.write("Checking for updates…\n");

    const latest = await fetchLatestVersion();

    if (!latest) {
      process.stderr.write(color.red("Failed to check for updates. Please try again later.\n"));
      process.exitCode = 1;
      return;
    }

    if (compareSemver(currentVersion, latest) >= 0) {
      printSuccess(`Already up-to-date (${currentVersion}).`, { version: currentVersion });
      return;
    }

    process.stderr.write(`Upgrading ${color.yellow(currentVersion)} → ${color.green(latest)}…\n`);

    try {
      const installCmd = getGlobalInstallCommand(PACKAGE_NAME);
      execSync(installCmd, { stdio: "inherit" });
      printSuccess(`Successfully upgraded to ${latest}.`, { from: currentVersion, to: latest });
    } catch {
      const fallbackCmd = getGlobalInstallCommand(PACKAGE_NAME);
      process.stderr.write(
        color.red(`\nUpgrade failed. Try running manually:\n  ${fallbackCmd}\n`)
      );
      process.exitCode = 1;
    }
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

  A CLI THAT DID NOT COME FROM A GLOBAL INSTALL IS NOT UPGRADABLE HERE. Run
  through npx, vendored into a repo, or installed as a project dependency, this
  installs a SEPARATE global copy rather than replacing the one you invoked —
  so the next run of your local binary is still the old version. Upgrade those
  through whatever installed them.

  EXIT 1 MEANS NOTHING CHANGED. Both failure paths — the version check could not
  reach the registry, or the install command failed — leave the CLI exactly as
  it was. There is no partial upgrade to clean up.`
    )
    .action(upgradeAction);

  // Register hidden aliases so any intuitive word triggers the upgrade
  for (const alias of UPGRADE_ALIASES) {
    program.command(alias, { hidden: true }).action(upgradeAction);
  }
}
