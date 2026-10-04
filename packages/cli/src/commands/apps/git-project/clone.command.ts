import type { Command } from "commander";

import { handleError } from "../../../errors";
import { color, isJsonMode } from "../../../output";
import { tenantRequest } from "../../../util/tenant-http";
import { type StandaloneVibeGitProjectResponse } from "../../../vibe-wire-types";
import { fetchGitProjectCredentials } from "../_shared/fetch-git-project-credentials";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";
import { assertGitAvailable } from "../git-local/assert-git-available";
import { buildCloneArgs } from "../git-local/build-clone-args";
import { resolveCloneDirectory } from "../git-local/resolve-clone-directory";
import { runGitWithCredential } from "../git-local/run-git-with-credential";

const CLONE_HELP = `
Notes:
Resolves the project, fetches THIS project's own push credential (a machine
user that can reach this one repository and no other), and runs a real
"git clone" against your tenant's git host. The directory defaults to the
project's name.

The token is stored NOWHERE: git reads it from a temporary 0600 credential
file that is deleted when the command returns, every credential helper you
have configured (the macOS keychain included) is switched off for that one
call, and "origin" is left as the plain token-free URL. Re-authenticate later
with "git-project pull", which supplies a fresh token the same way.

The project must be READY — a PENDING project has not materialized on the git
host yet, and cloning it would fail inside git with a much worse message.

Examples:
  $ nexus apps git-project clone 11111111-2222-4333-8444-555555555555
  $ nexus apps git-project clone 11111111-2222-4333-8444-555555555555 ./shared-lib
  $ nexus apps git-project clone 11111111-2222-4333-8444-555555555555 --branch trunk
`;

/** `nexus apps git-project clone` */
export function registerAppsGitProjectCloneCommand(project: Command, program: Command): Command {
  const leaf = project
    .command("clone <projectId> [directory]")
    .description("Clone a git project onto this machine")
    .option("--branch <branch>", "Branch to check out (default: the project's default branch).")
    .addHelpText("after", CLONE_HELP)
    .action(
      async (projectId: string, directory: string | undefined, cmdOpts: { branch?: string }) => {
        try {
          assertGitAvailable();
          const opts = resolveTenantOpts(program);

          const projectData = await tenantRequest<StandaloneVibeGitProjectResponse>(opts, {
            method: "GET",
            path: `/api/vibe/git-projects/${encodeURIComponent(projectId)}`
          });
          const gitProject = projectData.gitProject;
          if (gitProject.status !== "READY") {
            throw new Error(
              `Git project "${gitProject.name}" is ${gitProject.status}, not READY — it has not materialized on your git host yet. Check "nexus apps git-project get ${projectId}".`
            );
          }

          const credentials = await fetchGitProjectCredentials(opts, gitProject.id);

          const target = resolveCloneDirectory(directory, gitProject.name);
          const cloneUrl = credentials.cloneUrl;
          const branch = cmdOpts.branch ?? gitProject.defaultBranch;

          runGitWithCredential(credentials, "clone", (credentialPath) =>
            buildCloneArgs(credentialPath, cloneUrl, target, branch)
          );

          if (isJsonMode()) {
            console.log(
              JSON.stringify(
                {
                  gitProjectId: gitProject.id,
                  name: gitProject.name,
                  branch,
                  directory: target,
                  cloneUrl
                },
                null,
                2
              )
            );
            return;
          }
          console.log(`${color.green("✓")} Cloned ${gitProject.name}@${branch} into ${target}`);
          console.log(
            color.dim(`Update it later with: nexus apps git-project pull ${projectId} ${target}`)
          );
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
