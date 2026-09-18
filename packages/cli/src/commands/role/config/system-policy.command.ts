import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printStatedOrNothing } from "../_shared/print-stated-or-nothing";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role system-policy` */
export function registerRoleSystemPolicyCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("system-policy")
    .description("Read a Role's system policy")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role system-policy "Support agent"
  $ nexus role system-policy "Support agent" --json

Notes:
  "NOT CONFIGURED" IS A SUCCESS, NOT AN EMPTY POLICY. A Role nobody has
  authored a policy for prints that line and exits 0; under --json it is a
  literal null. It is NOT the same as every flag being false — nothing has been
  stated, and there is NO organization-level system policy to inherit from, so
  an unauthored policy is an absence rather than a set of borrowed values.
  Write it with "nexus role set-system-policy", which REPLACES the whole
  policy rather than patching it.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const policy = await client.roles.getSystemPolicy(await resolveRoleId(client, ref));

        printStatedOrNothing(policy, "This Role's system policy", [
          { key: "roleId", label: "Role" },
          { key: "allowProposals", label: "Allow proposals" },
          { key: "requireReview", label: "Require review" },
          { key: "startPaused", label: "Start paused" },
          { key: "autoPush", label: "Auto push" },
          { key: "notifyTakeover", label: "Notify takeover" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
