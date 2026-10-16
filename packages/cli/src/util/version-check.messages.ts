import { getGlobalInstallCommand } from "./package-manager";
import { PACKAGE_NAME } from "./version-check.constants";
import { compareSemver } from "./version-check.semver";

/**
 * The banner printed when a newer version exists.
 *
 * The command it names is {@link getGlobalInstallCommand} — the SAME string
 * `nexus upgrade` runs, and the same one {@link formatAutoUpdateFailedMessage}
 * prints. That is the whole contract: this CLI never tells a user to run a
 * command it would not run itself.
 *
 * It used to print each manager's `update`/`upgrade` verb instead, which cannot
 * cross a `0.x` minor and exits 0 without moving — so the banner kept printing
 * after the user had done exactly what it asked. `package-manager.ts` carries
 * the measurements.
 */
export function formatUpdateMessage(current: string, latest: string): string {
  return (
    `\n  Update available: ${current} → ${latest}\n` +
    `  Run "${getGlobalInstallCommand(PACKAGE_NAME)}" to update.\n`
  );
}

/**
 * One-line notice shown when a background auto-update could not complete
 * (e.g. EACCES on a root-owned global install dir). The command already ran
 * on the installed version, so this is informational — not a hard warning.
 */
export function formatAutoUpdateFailedMessage(latest: string): string {
  return `\n  Auto-update to ${latest} failed. Run "${getGlobalInstallCommand(PACKAGE_NAME)}" to update manually.\n`;
}

/** The update notice for a known `latest`, or null when it is not newer. */
export function messageIfNewer(currentVersion: string, latest: string): string | null {
  return compareSemver(currentVersion, latest) < 0
    ? formatUpdateMessage(currentVersion, latest)
    : null;
}
