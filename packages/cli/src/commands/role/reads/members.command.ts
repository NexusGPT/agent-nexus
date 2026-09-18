import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { isJsonMode, printList, printRecord } from "../../../output";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role members` */
export function registerRoleMembersCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("members")
    .description("List a Role's owner, admins and plain members")
    .argument("<role>", "Role name or UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role members "Support agent"

Notes:
  The OWNER is a field on the Role, never a membership row — so they do not
  appear under admins. Read the Owner line, and use "nexus role update" to
  hand a Role over.
  The terminal rendering is TWO blocks — a summary, then one table of admins and
  members with a TIER column. Under --json it is the untouched response,
  {roleId, ownerUserId, admins, members}, with the two tiers as separate arrays.`
    )
    .action(async (ref: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const membership = await client.roles.listMembers(await resolveRoleId(client, ref));

        // `--json` gets the WHOLE response, once. The two blocks below are a
        // human rendering of the same object, and every printer in `output.ts`
        // short-circuits to its own `console.log(JSON.stringify(...))` under
        // `--json` — so calling two of them emitted `{...}{"data":[...]}`, which
        // `JSON.parse` rejects outright and `jq` reads as a stream. A script got
        // either a crash or, worse, only the first document: the counts without
        // a single member in them (NEX-2176). Same shape and same fix as
        // `skill-folder list`.
        if (isJsonMode()) {
          console.log(JSON.stringify(membership, null, 2));
          return;
        }

        printRecord(membership, [
          { key: "roleId", label: "Role" },
          { key: "ownerUserId", label: "Owner" },
          { key: "admins", label: "Admins", format: () => String(membership.admins.length) },
          { key: "members", label: "Members", format: () => String(membership.members.length) }
        ]);
        printList([...membership.admins, ...membership.members], undefined, [
          { key: "userId", label: "USER", width: 34 },
          { key: "tier", label: "TIER", width: 8 },
          { key: "addedByUserId", label: "ADDED BY", width: 34 },
          { key: "createdAt", label: "SINCE", width: 20 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
