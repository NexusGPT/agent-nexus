import { execSync } from "node:child_process";

import { Command } from "commander";

import packageJson from "../../package.json" with { type: "json" };
import { getGlobalInstallCommand } from "../util/package-manager";
import { resolveCandidates } from "../util/resolve-on-path";
import { fetchLatestVersion } from "../util/version-check";
// Only the three this file's own BODY uses. The two exit codes are re-exported
// below through `export … from`, which needs no import — listing them here as
// well is an unused import, and this package lints at `--max-warnings 9`
// sitting at exactly 9.
import { BINARY_NAME, PACKAGE_NAME, UPGRADE_ALIASES } from "./upgrade/_shared/constants";
import type { UpgradeEnvironment } from "./upgrade/_shared/environment";
import { runUpgrade } from "./upgrade/run-upgrade";
import { UPGRADE_HELP } from "./upgrade/upgrade.help";

/**
 * `nexus upgrade` — replace the installed CLI, then PROVE it was replaced.
 *
 * Not a registrar over subcommands: one command, four aliases, and a verdict
 * read back off the PATH. The decomposition is by CONCERN rather than by verb —
 * `upgrade/_shared/` holds the exit codes, the alias list and the injectable
 * seam; `upgrade/run-upgrade.ts` is the flow; one `report-*.ts` per outcome;
 * `upgrade/upgrade.help.ts` is the prose.
 *
 * ── RE-EXPORTS ARE THE PUBLISHED SURFACE OF THIS MODULE ──────────────────────
 *
 * Four consumers import these names from `./commands/upgrade` and none of them
 * is touched by the split: `index.ts` (`UPGRADE_ALIASES`),
 * `exit-code-taxonomy.test.ts` (both exit codes),
 * `commands/upgrade-environment.test.ts` and
 * `test/install/the-install-step-executes.test.ts` (`runUpgrade`,
 * `UpgradeEnvironment`), and `commands/upgrade-*.test.ts` (`UPGRADE_ALIASES`,
 * `registerUpgradeCommand`).
 */
export {
  EXIT_INSTALLED_BUT_NOT_RESOLVED,
  EXIT_VERIFICATION_NOT_YOURS,
  UPGRADE_ALIASES
} from "./upgrade/_shared/constants";
export type { UpgradeEnvironment } from "./upgrade/_shared/environment";
export { runUpgrade } from "./upgrade/run-upgrade";

/**
 * The real I/O, wired once — this module's composition root.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 KEEP THIS FUNCTION IN THIS FILE. A SPEC READS IT BY PATH.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `util/no-auto-update-stops-the-network.test.ts` `readFileSync`s
 * `../commands/upgrade.ts` and asserts `/fetchLatest:\s*fetchLatestVersion/`
 * against the TEXT. That arm is what pins the shipped path to the CACHED,
 * opt-out-respecting registry read rather than a bare fetch — the defect it
 * guards is an unasked-for network call, which no type can catch.
 *
 * It is a static scan over one path, so moving this wiring into
 * `upgrade/_shared/` leaves the file on disk, the regex matching NOTHING, and
 * that arm RED — or, had it been written as a presence check instead of a
 * match, silently vacuous. The composition root belongs beside the registrar
 * anyway; this comment is here so the next reader knows the move costs an arm.
 */
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

export function registerUpgradeCommand(program: Command): void {
  // ONE command object now carries every spelling, so a change to the upgrade
  // reaches all of them by construction rather than by a loop anyone can forget.
  // `upgrade-verifies-what-it-claims.test.ts` still DRIVES each spelling, because
  // an alias silently failing to resolve looks identical to one that works.
  const upgradeAction = async () => {
    await runUpgrade(realEnvironment(packageJson.version));
  };

  const upgrade = program
    .command("upgrade")
    .description("Upgrade the Nexus CLI to the latest version");

  // Declared on the command, so `--help` renders `upgrade|update|latest|up` and
  // the alternative spellings are DISCOVERABLE rather than hidden.
  for (const alias of UPGRADE_ALIASES) upgrade.alias(alias);

  upgrade.addHelpText("after", UPGRADE_HELP).action(upgradeAction);
}
