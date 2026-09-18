import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role resume` */
export function registerRoleResumeCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("resume")
    .description("Start a Role's work again")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role resume "Refunds"

Notes:
  A SYSTEM PAUSED ON ITS OWN STAYS PAUSED. A workflow or agent somebody stopped
  individually carries its own status, which this does not clear, and nothing
  in the output says so. This restores only the stop the Role itself was under.

  It also cannot restart what the pause never stopped — deployments, AI tasks,
  document templates and external tools were running throughout.

  Idempotent: resuming a running Role succeeds and changes nothing.

  A 403 here has TWO causes and only one is about you. "role.resume" not held
  is curable by asking the Role's owner. The organization having opted out of
  Roles is not — read the error "code": FEATURE_NOT_ENABLED means nobody in
  that organization can reach this command, and the Role's systems are running
  regardless, because the server declines to enforce a Role stop for an
  opted-out organization.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { role: resumed } = await client.roles.resume(await resolveRoleId(client, ref));

        printRecord(resumed, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "pausedAt", label: "Paused at" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
