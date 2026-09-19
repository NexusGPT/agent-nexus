import type { Command } from "commander";

import { handleError } from "../../../errors";
import { tenantRequest } from "../../../util/tenant-http";
import { type DeleteEnvVarResponse } from "../../../vibe-wire-types";
import { printEnvVarDeleted } from "../_shared/print-env-var-deleted";
import { resolveTenantOpts } from "../_shared/resolve-tenant-opts";

/** `nexus apps env rm` */
export function registerAppsEnvRmCommand(env: Command, program: Command): Command {
  const leaf = env
    .command("rm <appId> <envVarId>")
    .description("Remove an env var by id (find the id via `nexus apps env list`)")
    .addHelpText(
      "after",
      `
Notes:
Removal is by env-var id, not name — list first to get the id. Scoped to
your org + the named app; a wrong id returns 404.

Variables only. A card row's id is a binding id and this route does not
know it, so it answers 404 — revoke a card from the console instead.

Examples:
  $ nexus apps env rm 11111111-2222-4333-8444-555555555555 66666666-7777-4888-8999-aaaaaaaaaaaa
`
    )
    .action(async (appId: string, envVarId: string) => {
      try {
        const opts = resolveTenantOpts(program);
        const data = await tenantRequest<DeleteEnvVarResponse>(opts, {
          method: "DELETE",
          path: `/api/vibe/apps/${encodeURIComponent(appId)}/env/${encodeURIComponent(envVarId)}`
        });
        printEnvVarDeleted(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
