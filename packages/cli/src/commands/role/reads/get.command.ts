import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { formatReadiness } from "../_shared/format-readiness";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role get` */
export function registerRoleGetCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("get")
    .description("Show one Role, without the systems it holds")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role get "Support agent"
  $ nexus role get 11111111-1111-4111-8111-111111111111

Notes:
  The systems are a separate read (nexus role systems) under a separate scope,
  so listing Roles does not also hand over the inventory each one owns.
  readiness.permissionSets PENDING means retry; owner ABSENT is final.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { role: found, readiness } = await client.roles.get(await resolveRoleId(client, ref));

        printRecord({ ...found, readiness }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "jobDescription", label: "Job description" },
          { key: "ownerUserId", label: "Owner" },
          { key: "readiness", label: "Readiness", format: formatReadiness },
          // A `get` that hid the stop would be the worst place to hide it: this
          // is the command an operator runs to find out why a Role's workflows
          // are not firing. `pausedAt` null means running.
          { key: "pausedAt", label: "Paused at" },
          { key: "pausedByUserId", label: "Paused by" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
