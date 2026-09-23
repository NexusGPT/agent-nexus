import type { Command } from "commander";

import { handleError } from "../../../errors";
import { color, isJsonMode } from "../../../output";
import { tenantRequest } from "../../../util/tenant-http";
import {
  type GetGitCredentialsResponse,
  type StandaloneVibeGitProjectResponse
} from "../../../vibe-wire-types";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";
import { assertGitAvailable } from "../git-local/assert-git-available";
import { buildCloneArgs } from "../git-local/build-clone-args";
import { composeCloneUrl } from "../git-local/compose-clone-url";
import { resolveCloneDirectory } from "../git-local/resolve-clone-directory";
import { runGitWithCredential } from "../git-local/run-git-with-credential";

const CLONE_HELP = `
Notes:
Resolves the project, fetches your org's git credential, and runs a real
"git clone" against your tenant's git host. The directory defaults to the
project's name.

The push token is NOT written into the clone's .git/config: it is passed to
git through a temporary 0600 credential file that is deleted when the command
returns, and "origin" is left as the plain token-free URL. Re-authenticate
later with "git-project pull", which supplies a fresh token the same way.

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

          const credentialData = await tenantRequest<GetGitCredentialsResponse>(opts, {
            method: "GET",
            path: "/api/vibe/git-credentials"
          });

          const target = resolveCloneDirectory(directory, gitProject.name);
          const cloneUrl = composeCloneUrl(
            credentialData.credentials.cloneUrlBase,
            gitProject.name
          );
          const branch = cmdOpts.branch ?? gitProject.defaultBranch;

          runGitWithCredential(credentialData.credentials, "clone", (credentialPath) =>
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
