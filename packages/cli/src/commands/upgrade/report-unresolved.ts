import { CLI_UPGRADE_NOT_RESOLVED, printFailure } from "../../errors";
import { BINARY_NAME, PACKAGE_NAME } from "./_shared/constants";
import { hintLines } from "./_shared/environment";

/**
 * Nothing named `nexus` resolves on the PATH this process has.
 *
 * Under sudo the old wording sent the reader to repair a PATH that is very
 * likely fine — theirs. The empty resolution is root's, and sudo commonly
 * replaces PATH with `secure_path`, which carries no per-user global bin
 * directory at all.
 */
export function reportUnresolved(
  elevated: string | null,
  latest: string,
  installedWith: string
): void {
  printFailure(
    elevated === null
      ? `Installed ${PACKAGE_NAME}@${latest}, but no "${BINARY_NAME}" is on your PATH.`
      : `Installed ${PACKAGE_NAME}@${latest}, but no "${BINARY_NAME}" is on ROOT's PATH.`,
    CLI_UPGRADE_NOT_RESOLVED,
    hintLines(
      installedWith,
      "",
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
}
