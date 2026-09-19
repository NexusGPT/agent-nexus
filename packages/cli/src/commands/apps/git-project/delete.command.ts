import type { Command } from "commander";

import { handleError } from "../../../errors";
import { EXIT_CODES } from "../../../exit-codes";
import { color, isJsonMode } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { tenantRequest } from "../../../util/tenant-http";
import { type DeletedIdResponse } from "../../../vibe-wire-types";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps git-project delete` */
export function registerAppsGitProjectDeleteCommand(project: Command, program: Command): Command {
  const leaf = confirmable(project.command("delete <projectId>"))
    .description("Delete a git project and release its name")
    .addHelpText(
      "after",
      `
Notes:
The project is soft-deleted and its name is released, so a later project — or an
app provisioning its own repo — can take that name again.

Any app still pointing at this project reads as having no project at all, which
means it stops deploying on push. Check with "app get <appId>" before deleting a
project you did not create standalone.

Examples:
  $ nexus apps git-project delete 11111111-2222-4333-8444-555555555555
  $ nexus apps git-project delete 11111111-2222-4333-8444-555555555555 --yes
`
    )
    .action(async (projectId: string, cmdOpts: { yes?: boolean }) => {
      try {
        const ok = await confirmDestructive(
          `Delete git project ${projectId}? Apps pointing at it stop deploying.`,
          { ...cmdOpts, rerun: `nexus apps git-project delete ${projectId} --yes` }
        );
        if (!ok) {
          // ??=, NOT =. `confirmDestructive` ALREADY set the code when it
          // refused for want of a terminal, and a bare assignment here
          // overwrote that category with the generic failure. The other way it
          // returns false is a person typing "n", which sets nothing — so this
          // supplies a code for the abort and never clobbers a refusal's.
          process.exitCode ??= EXIT_CODES.failed;
          return;
        }

        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<DeletedIdResponse>(opts, {
          method: "DELETE",
          path: `/api/vibe/git-projects/${encodeURIComponent(projectId)}`
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        console.log(`${color.green("✓")} Deleted git project ${data.deletedId} — name released`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
