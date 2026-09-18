import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { reportGovernedWrite } from "../_shared/report-governed-write";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role delete` */
export function registerRoleDeleteCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("delete")
    .description("Delete a Role, or file a request to delete one")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role delete "Refunds"

Notes:
  THIS DOES NOT PROMPT AND HAS NO --yes. The first call deletes the Role, or
  files the deletion request, with no confirmation and no dry run — unlike
  "customer delete", "user-group delete" and "skill-folder delete", which stop
  and ask on a terminal unless --yes is passed.

  THE ROLE'S SYSTEMS ARE NOT DELETED AND NOT REASSIGNED — THEY BECOME ORPHANS.
  Every agent, workflow, deployment, AI task and document template it held
  stops being reachable through any Role while continuing to exist and to run.
  Nothing errors and nothing reports it. Run "nexus role systems <role>" first
  and move what matters.

  A 2xx does not mean the Role is gone: if governance requires approval this
  files a request and reports status "pending", and the Role is STILL THERE.

  BRANCH ON "status", NEVER ON THE EXIT CODE OR ON "success". Both outcomes are
  a 0 exit and "success": true. --json carries "status": "deleted", or
  "status": "pending" with a "requestId" — and pending means every system the
  Role holds is still held, by a Role that still exists.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.delete(await resolveRoleId(client, ref));

        reportGovernedWrite(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
