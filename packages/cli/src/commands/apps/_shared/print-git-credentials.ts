import { color, isJsonMode, printRecord } from "../../../output";
import { type VibeGitProjectCredentialsDto } from "../../../vibe-wire-types";

/**
 * Render one project's push credential. In --json mode the credential object is
 * printed verbatim. The token IS surfaced on purpose — that is the command's
 * whole job — but never inside a URL: a URL is what a reader pastes into
 * `git remote add`, and git writes a remote URL into `.git/config` verbatim.
 */
export function printGitCredentials(creds: VibeGitProjectCredentialsDto): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(creds, null, 2));
    return;
  }

  printRecord(creds, [
    { key: "gitProjectName", label: "Project" },
    { key: "gitHostName", label: "Git host" },
    { key: "forgejoOrg", label: "Org" },
    { key: "username", label: "Username" },
    { key: "pushToken", label: "Push token" },
    { key: "cloneUrl", label: "Clone URL" }
  ]);
  console.log("");
  console.log(color.dim("The push token is a live secret — keep it out of shared logs."));
  console.log(
    color.dim(
      `Push without storing it anywhere: git -c credential.helper= push ${creds.cloneUrl} HEAD:main`
    )
  );
  console.log("");
  // The last surface before a push, and therefore the last chance to say this:
  // the rejection itself is client-side, so no hook on the git host can carry
  // the cause. Whoever skipped the provisioning output still passes through here.
  console.log(
    color.yellow('Repos are created seeded, so a virgin first push is rejected with "fetch first".')
  );
  console.log(
    color.dim(
      `Clone the project (nexus apps git-project clone ${creds.gitProjectId}), or rebase onto it first.`
    )
  );
}
