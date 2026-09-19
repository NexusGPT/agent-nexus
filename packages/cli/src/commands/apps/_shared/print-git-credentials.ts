import { color, isJsonMode, printRecord } from "../../../output";
import { type VibeGitCredentialsDto } from "../../../vibe-wire-types";

/**
 * Render the served git credential. In --json mode the credential object is
 * printed verbatim. In human mode we print the addressing fields plus a
 * ready-to-use authenticated remote base (`https://user:token@host/org/`) —
 * the token IS surfaced here on purpose; that is the command's whole job.
 */
export function printGitCredentials(creds: VibeGitCredentialsDto): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(creds, null, 2));
    return;
  }

  const host = creds.cloneUrlBase.replace(/^https:\/\//, "");
  const authedBase = `https://${creds.username}:${creds.pushToken}@${host}`;

  printRecord(creds, [
    { key: "gitHostName", label: "Git host" },
    { key: "forgejoOrg", label: "Org" },
    { key: "username", label: "Username" },
    { key: "pushToken", label: "Push token" },
    { key: "cloneUrlBase", label: "Clone base" }
  ]);
  console.log("");
  console.log(`${color.dim("Authenticated remote base (append <repo>.git):")}`);
  console.log(`  ${authedBase}`);
  console.log(color.dim("The push token is a live secret — keep it out of shared logs."));
  console.log("");
  // The last surface before a push, and therefore the last chance to say this:
  // the rejection itself is client-side, so no hook on the git host can carry
  // the cause. Whoever skipped the provisioning output still passes through here.
  console.log(
    color.yellow('Repos are created seeded, so a virgin first push is rejected with "fetch first".')
  );
  console.log(
    color.dim("Clone the project (nexus apps git-project clone <id>), or rebase onto it first.")
  );
}
