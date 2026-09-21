import type { Command } from "commander";

import { getProfile, listProfiles, writeNexusRc } from "../../config";
import { reportFailure } from "../../errors";
import { color, isJsonMode, printSuccess } from "../../output";

const PIN_HELP = `
Examples:
  $ nexus auth pin work

Notes:
  IT WRITES ./.nexusrc IN THE CURRENT DIRECTORY, holding {"profile":"<name>"}
  and nothing else. It names a profile; it stores no key.
  "nexus auth switch <name> --here" writes the SAME file — one behaviour, two
  spellings, so the verb that changes organization can also scope the change to
  this folder instead of the whole machine.

  ⚠️ IN A REPOSITORY THAT FILE IS COMMITTABLE, AND COMMITTING IT REPOINTS YOUR
  TEAMMATES' CLI. A colleague who has a profile of the same name silently starts
  acting against THAT organization in this directory, with no prompt and nothing
  in the output saying a pin is in effect. A colleague who does not have it gets
  an unexplained failure. Add .nexusrc to .gitignore unless the whole team
  genuinely shares the profile name.

  Run "nexus auth whoami" from the directory to see which profile is winning.`;

/** `nexus auth pin` */
export function registerAuthPinCommand(auth: Command, _program: Command): Command {
  const leaf = auth
    .command("pin")
    .description("Pin the current directory to a profile via .nexusrc")
    .argument("<profile>", "Profile name to pin")
    .addHelpText("after", PIN_HELP)
    .action((profileName: string) => {
      // Validate profile exists
      const profile = getProfile(profileName);
      if (!profile) {
        const { profiles } = listProfiles();
        const available = Object.keys(profiles).join(", ");
        process.exitCode = reportFailure(
          "not-found",
          `Profile "${profileName}" not found.`,
          available ? `Available: ${available}` : "Run: nexus auth login"
        );
        return;
      }

      writeNexusRc(process.cwd(), profileName);

      const orgPart = profile.orgName ? ` (${profile.orgName})` : "";
      printSuccess(`Pinned this directory to "${profileName}"${orgPart}.`, {
        file: ".nexusrc"
      });
      if (!isJsonMode()) {
        console.log(color.dim("\n  Tip: Consider adding .nexusrc to your .gitignore"));
      }
    });
  return leaf;
}
