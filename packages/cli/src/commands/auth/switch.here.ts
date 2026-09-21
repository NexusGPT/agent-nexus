import { getProfile, writeNexusRc } from "../../config";
import { reportFailure } from "../../errors";
import { color, isJsonMode, printSuccess } from "../../output";
import { refuseUnknownProfile } from "./switch.refuse-unknown-profile";
import { switchIsShadowed } from "./switch.shadowed";

/**
 * `auth switch <name> --here` — bind THIS DIRECTORY, leaving the machine-wide
 * active profile untouched.
 *
 * This is the same `.nexusrc` `auth pin` writes, reached from the verb people
 * actually use to change organizations. That matters more than it sounds: a
 * reader who knows only `switch` has no way to discover that the isolating form
 * exists, and the machine-wide switch they do know silently repoints every other
 * session (NEX-2525).
 */
export function switchHere(name: string): void {
  const profile = getProfile(name);
  if (!profile) {
    process.exitCode = refuseUnknownProfile(name);
    return;
  }

  try {
    writeNexusRc(process.cwd(), name);
  } catch (err) {
    process.exitCode = reportFailure("local-failed", (err as Error).message);
    return;
  }

  const orgPart = profile.orgName ? ` (${profile.orgName})` : "";
  printSuccess(`This directory now resolves to "${name}"${orgPart}.`, {
    profile: name,
    scope: "directory",
    file: ".nexusrc"
  });
  if (!isJsonMode()) {
    console.log(
      color.dim(
        "\n  Applies here and below, in every shell; other directories and sessions are unchanged." +
          "\n  Remove it with: nexus auth unpin · Consider adding .nexusrc to your .gitignore"
      )
    );
  }

  if (switchIsShadowed(name)) process.exitCode = 1;
}
