import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type SingleVibeGitProjectResponse } from "../../../vibe-wire-types";
import { printVibeGitProject } from "../_shared/print-vibe-git-project";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps provision-repo` */
export function registerAppsProvisionRepoCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("provision-repo <appId>")
    .description("Provision a git project for a Vibe app")
    .option(
      "--git-url <url>",
      "Git remote the build executor clones at deploy time (e.g. file:///path/to/repo or https://…)."
    )
    .addHelpText(
      "after",
      `
Notes:
Creates a git project (the standalone code store) in PENDING and attaches
the app to it; the project takes the app's name and deploy branch. The
build executor clones --git-url at the pushed sha. The git URL is optional
here and can be set at provision time only — a deploy needs it, so pass it
unless you are wiring the project up by other means.

Provisioning an app that already has a git project returns 409. If a
project's provisioning FAILED, use "reprovision-repo" to retry it.

The repo is created SEEDED — it carries an initial commit before you push
anything — so a first push from a local repo you started yourself is rejected
with a bare "fetch first". Clone the project instead, or rebase your local
work onto it; the command's output prints both forms.

Examples:
  $ nexus apps provision-repo 11111111-2222-4333-8444-555555555555 --git-url file:///tmp/my-repo
  $ nexus apps provision-repo 11111111-2222-4333-8444-555555555555 --git-url https://github.com/acme/svc.git
`
    )
    .action(async (appId: string, cmdOpts: { gitUrl?: string }) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SingleVibeGitProjectResponse>(opts, {
          method: "POST",
          // Legacy path segment on purpose — prod backends may predate the
          // rename for days after this CLI publishes; the canonical
          // `git-project` segment takes over next release.
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/repository`,
          body: { gitRemoteUrl: cmdOpts.gitUrl }
        });
        printVibeGitProject(data.gitProject ?? data.repository, { freshlyProvisioned: true });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
