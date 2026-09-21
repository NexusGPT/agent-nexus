import type { Command } from "commander";

import { removeNexusRc } from "../../config";
import { reportFailure } from "../../errors";
import { printSuccess } from "../../output";

const UNPIN_HELP = `
Examples:
  $ nexus auth unpin

Notes:
  THE CURRENT DIRECTORY ONLY. This removes ./.nexusrc and walks nowhere — a pin
  in a parent directory is untouched and keeps applying. Run it where the pin is.
  It EXITS NON-ZERO when there is no .nexusrc here, so "no pin to remove" and
  "pin removed" are distinguishable in a script rather than both reading as
  success.
  A pin outranks the active profile, so removing it changes which credential the
  next command resolves to. "nexus auth whoami" confirms what wins afterwards.`;

/** `nexus auth unpin` */
export function registerAuthUnpinCommand(auth: Command, _program: Command): Command {
  const leaf = auth
    .command("unpin")
    .description("Remove .nexusrc from the current directory")
    .addHelpText("after", UNPIN_HELP)
    .action(() => {
      if (!removeNexusRc(process.cwd())) {
        process.exitCode = reportFailure("not-found", "No .nexusrc found in current directory.");
        return;
      }
      printSuccess("Removed .nexusrc from current directory.");
    });
  return leaf;
}
