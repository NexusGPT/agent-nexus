import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";

/** `nexus role governance` */
export function registerRoleGovernanceCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("governance")
    .description("Read the organization's Role-management governance settings")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role governance

Notes:
  ORG-ADMIN ONLY — a non-admin key gets a 403 here and cannot learn in advance
  whether "role create" will create or merely file a request.

  The drivable path without admin rights is the other direction: run
  "nexus role create", read what it reports, and if it filed a request follow it
  with "nexus role creation-requests" / "creation-request <id>".

  REQUIRES APPROVAL DOES NOT PREDICT WHAT YOUR WRITE WILL DO. It is the
  organization's policy for the action, not a verdict about your key: with
  REQUIRES APPROVAL yes on CREATE_ROLE, an org-admin key still creates the role
  outright and files no request. The branch a write actually took is in the
  STATUS the write itself returns — read that, never this table.

  TWO ROWS, NOT FIVE. Only CREATE_ROLE and DELETE_ROLE have an approval queue.
  The other RoleManagementAction values are what remains of a retired org-wide
  allow-list; nothing on the server reads a policy for them, so they are absent
  rather than reported as configurable.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { settings } = await client.roles.getManagementSettings();

        printList(settings, undefined, [
          { key: "action", label: "ACTION", width: 22 },
          { key: "requiresApproval", label: "REQUIRES APPROVAL", width: 18 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
