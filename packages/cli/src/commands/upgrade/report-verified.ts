import { CLI_UPGRADE_NOT_VERIFIED_FOR_YOU, printFailure } from "../../errors";
import { printSuccess } from "../../output";
import { BINARY_NAME, EXIT_VERIFICATION_NOT_YOURS, PACKAGE_NAME } from "./_shared/constants";
import { hintLines, type UpgradeEnvironment } from "./_shared/environment";

/**
 * The PATH agrees: the binary a shell resolves reports the new version.
 *
 * Two outcomes, not one, and the sudo one is the whole reason this arm is not
 * just a `printSuccess`.
 */
export function reportVerified(
  env: UpgradeEnvironment,
  latest: string,
  installCmd: string,
  verdict: { readonly binary: string; readonly version: string }
): void {
  const installedWith = `Installed with: ${installCmd}`;
  const elevated = env.elevatedBy;

  // 🚨 UNDER `sudo` THIS IS NOT AN UPGRADE FOR THE PERSON WHO TYPED IT, and
  // printing one is the exact defect the rest of this namespace exists to
  // prevent: a success sentence about an environment nobody checked. The install
  // ran as root and `resolve()` read the ROOT process's PATH, so a match here is
  // a statement about root's shell. Whether that is also the invoking user's
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
}
