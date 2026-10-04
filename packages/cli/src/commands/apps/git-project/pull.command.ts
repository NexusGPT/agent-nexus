import type { Command } from "commander";

import { handleError } from "../../../errors";
import { color, isJsonMode } from "../../../output";
import { fetchGitProjectCredentials } from "../_shared/fetch-git-project-credentials";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";
import { assertGitAvailable } from "../git-local/assert-git-available";
import { assertGitRepository } from "../git-local/assert-git-repository";
import { buildPullArgs } from "../git-local/build-pull-args";
import { runGitWithCredential } from "../git-local/run-git-with-credential";

/** `nexus apps git-project pull` */
export function registerAppsGitProjectPullCommand(project: Command, program: Command): Command {
  const leaf = project
    .command("pull <projectId> [directory]")
    .description("Fast-forward an already-cloned git project")
    .addHelpText(
      "after",
      `
Notes:
Runs "git pull --ff-only" in an existing clone, supplying this project's own
freshly-fetched credential so the pull keeps working after the token rotates.
The token is stored nowhere — not in the clone, and not in any credential
helper you have configured (the macOS keychain included), which is switched
off for that one call. The directory defaults to the current one.

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
        const credentials = await fetchGitProjectCredentials(opts, projectId);

        runGitWithCredential(credentials, "pull", (credentialPath) =>
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
