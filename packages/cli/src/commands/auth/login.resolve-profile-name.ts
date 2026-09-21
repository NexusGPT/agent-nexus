import { getProfile, slugifyProfileName, validateProfileName } from "../../config";
import { refuse } from "../../errors";
import type { Prompter } from "./login.prompter";

/**
 * Steps 4 and 5 — settle on a profile name, and get consent before overwriting
 * one that already exists.
 *
 * `null` means the run is over and the caller must return immediately, exactly
 * as the inline `return` this replaces did. Note the two `null`s differ: an
 * invalid name sets an exit code, while declining the overwrite prints
 * "Aborted." and leaves the run successful — which is the behaviour as it was.
 */
export async function resolveProfileName(input: {
  ask: Prompter["ask"];
  provided: string | undefined;
  orgName: string | undefined;
}): Promise<string | null> {
  const { ask, provided, orgName } = input;

  // ── Step 4: Determine profile name ───────────────────────────────
  let profileName = provided;

  if (!profileName) {
    const suggested = orgName ? slugifyProfileName(orgName) : "default";
    const answer = (await ask(`Profile name [${suggested}]: `)).trim();
    profileName = answer || suggested;
  }

  // Validate profile name
  const nameError = validateProfileName(profileName);
  if (nameError) {
    process.exitCode = refuse(nameError);
    return null;
  }

  // ── Step 5: Check for existing profile ───────────────────────────
  const existing = getProfile(profileName);
  if (existing) {
    const existingLabel = existing.orgName ? ` (${existing.orgName})` : "";
    const answer = (
      await ask(`Profile "${profileName}"${existingLabel} already exists. Overwrite? [y/N]: `)
    ).trim();
    if (answer.toLowerCase() !== "y") {
      console.log("Aborted.");
      return null;
    }
  }

  return profileName;
}
