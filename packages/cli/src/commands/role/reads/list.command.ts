import type { RoleReadinessEntry } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList } from "../../../output";
import { formatReadiness } from "../_shared/format-readiness";

/** `nexus role list` */
export function registerRoleListCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("list")
    .description("List every Role in the organization")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role list
  $ nexus role list --json

Notes:
  Unpaginated — a Role is a unit of organizational structure, so this list is
  bounded by how the company is arranged rather than by usage.
  READINESS says whether each Role's permission sets have been seeded yet.

  --json HERE IS NOT THE API'S SHAPE, AND BOTH SPELL IT "data". This command
  JOINS readiness onto each row, so "data" is an ARRAY of Roles each carrying a
  "readiness" object — null for a Role the server reported none for. The API,
  GET /public/v1/roles, answers "data" as an OBJECT of two parallel arrays,
  {"roles": [...], "readiness": [...]}, to be correlated on roleId. A parser
  written against one raises a type error on the other: dict in one, list in
  the other. Run "nexus api GET /roles" to get the API shape verbatim.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { roles, readiness } = await client.roles.list();
        const byRole = new Map<string, RoleReadinessEntry>(readiness.map((r) => [r.roleId, r]));

        printList(
          roles.map((r) => ({ ...r, readiness: byRole.get(r.id) ?? null })),
          undefined,
          [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 28 },
            { key: "ownerUserId", label: "OWNER", width: 32 },
            // 🚨 NO `width`, DELIBERATELY. `printTable` HARD-TRUNCATES an explicit
            // width (`.padEnd(w).slice(0, w)`), and the longest rendering here —
            // `permissionSets=PENDING, owner=ABSENT` — is 36 characters. At the 34
            // this used to carry, `ABSENT` and `READY` were both clipped, which
            // destroys the one distinction readiness exists to make: a clipped
            // `READ`/`ABSEN` reads as noise, and a reader takes it for "fine".
            // Omitting `width` makes the column size itself from the data, so it
            // cannot be wrong again when a state name changes length.
            { key: "readiness", label: "READINESS", format: formatReadiness }
          ]
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
