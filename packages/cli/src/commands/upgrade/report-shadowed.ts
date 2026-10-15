import { CLI_UPGRADE_NOT_RESOLVED, printFailure } from "../../errors";
import { BINARY_NAME, PACKAGE_NAME } from "./_shared/constants";
import { hintLines } from "./_shared/environment";

/**
 * The install landed and an OLDER copy still wins on the PATH.
 *
 * The one outcome where retrying is actively wrong: the same bytes go to the
 * same directory forever while the shell keeps resolving the other file.
 */
export function reportShadowed(
  elevated: string | null,
  latest: string,
  installedWith: string,
  /** Lines, flattened by `hintLines` — see `report-unreadable.ts` for why. */
  list: readonly string[],
  verdict: { readonly version: string }
): void {
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
