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
    .addHelpText("after", `\nExamples:\n  $ nexus upgrade`)
    .action(upgradeAction);

  // Register hidden aliases so any intuitive word triggers the upgrade
  for (const alias of UPGRADE_ALIASES) {
    program.command(alias, { hidden: true }).action(upgradeAction);
  }
}
