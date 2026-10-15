import { CLI_UPGRADE_NOT_RESOLVED, printFailure } from "../../errors";
import { BINARY_NAME, PACKAGE_NAME } from "./_shared/constants";
import { hintLines } from "./_shared/environment";

/** The binary the PATH resolves exists and will not start. */
export function reportUnreadable(
  elevated: string | null,
  latest: string,
  installedWith: string,
  /**
   * LINES, never one joined string. `formatResolutionList` returns an array and
   * `hintLines` flattens it, so each PATH entry lands on its own line. Typed as
   * a `string` this compiled nowhere, and the shape it invites — joining first —
   * is the regression `upgrade-verifies-what-it-claims.test.ts` exists to catch:
   * a comma-collapsed list still contains every substring a multi-line one does.
   */
  list: readonly string[],
  verdict: { readonly binary: string; readonly failure: string }
): void {
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
}
