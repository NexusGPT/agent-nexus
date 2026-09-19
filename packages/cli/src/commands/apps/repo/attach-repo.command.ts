import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type SingleVibeGitProjectResponse } from "../../../vibe-wire-types";
import { printVibeGitProject } from "../_shared/print-vibe-git-project";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps attach-repo` */
export function registerAppsAttachRepoCommand(apps: Command, program: Command): Command {
  const leaf = apps
    .command("attach-repo <appId> <gitProjectId>")
    .description("Attach an EXISTING git project to a Vibe app")
    .addHelpText(
      "after",
      `
Notes:
The counterpart to "provision-repo", which MINTS a new project named after
the app. Once a project already holds your code, that is the wrong verb —
this one points the app at the project you already have.

Why it matters: a push only deploys to apps ATTACHED to the project it went
to. An app that was never attached is invisible to that fan-out, so every
push advances the project's refs and deploys nothing — and, because a
project with no apps is a legitimate code store, nothing reports it as
wrong. If your app says "Never deployed" while your pushes succeed, this is
almost certainly why. Check with "nexus apps get <appId>".

Attaching to the project the app already has is a no-op success, so this is
safe to re-run. Attaching to a DIFFERENT project returns 409 — an app is not
re-pointed at another code store by accident.

Examples:
  $ nexus apps attach-repo 11111111-2222-4333-8444-555555555555 99999999-8888-4777-8666-555555555555
  $ nexus apps git-project list      # find the project id
`
    )
    .action(async (appId: string, gitProjectId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<SingleVibeGitProjectResponse>(opts, {
          method: "POST",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/git-project/attach`,
          body: { gitProjectId }
        });
        printVibeGitProject(data.gitProject ?? data.repository);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
