import type { Command } from "commander";

import { handleError } from "../../../errors";
import { color, isJsonMode } from "../../../output";
import { tenantRequest } from "../../../util/tenant-http";
import { type GetGitCredentialsResponse } from "../../../vibe-wire-types";
import {
  assertGitAvailable,
  assertGitRepository,
  buildPullArgs,
  runGitWithCredential
} from "../../apps-git-local";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps git-project pull` */
export function registerAppsGitProjectPullCommand(project: Command, program: Command): Command {
  const leaf = project
    .command("pull <projectId> [directory]")
    .description("Fast-forward an already-cloned git project")
    .addHelpText(
      "after",
      `
Notes:
Runs "git pull --ff-only" in an existing clone, supplying a freshly-fetched
credential so the pull keeps working after your push token rotates (the clone
deliberately stores no token). The directory defaults to the current one.

--ff-only is deliberate: a Vibe git project cloned locally is normally a mirror
you build from, so a refusal telling you the branch diverged is a better
outcome than a merge commit created behind your back. Resolve a divergence
yourself, then re-run.

Examples:
  $ nexus apps git-project pull 11111111-2222-4333-8444-555555555555
  $ nexus apps git-project pull 11111111-2222-4333-8444-555555555555 ./shared-lib
`
    )
    .action(async (projectId: string, directory: string | undefined) => {
      try {
        assertGitAvailable();
        const target = directory?.trim() ? directory.trim() : ".";
        assertGitRepository(target);

        const opts = resolveTenantOpts(program);
        const credentialData = await tenantRequest<GetGitCredentialsResponse>(opts, {
          method: "GET",
          path: "/api/vibe/git-credentials"
        });

        runGitWithCredential(credentialData.credentials, "pull", (credentialPath) =>
          buildPullArgs(credentialPath, target)
        );

        if (isJsonMode()) {
          console.log(JSON.stringify({ gitProjectId: projectId, directory: target }, null, 2));
          return;
        }
        console.log(`${color.green("✓")} Pulled ${target} (fast-forward only)`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
