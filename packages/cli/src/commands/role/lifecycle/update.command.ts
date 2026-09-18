import type { UpdateRoleBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { absent, printSuccess } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";
import { readOwner } from "../_shared/read-owner";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role update` */
export function registerRoleUpdateCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("update")
    .description("Rename a Role, rewrite its job description, or hand it to a new owner")
    .argument("<role>", "Role name or UUID")
    .option("--name <name>", "New display name")
    .option("--job-description <text>", "New job description")
    .option("--owner <userId>", "New owner, or 'none' to leave the Role unowned")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role update "Refunds" --name "Refunds and disputes"
  $ nexus role update "Refunds" --owner user_xyz

Notes:
  HANDING A ROLE OVER REMOVES THE OUTGOING OWNER FROM IT ENTIRELY. An owner
  holds no membership row, so the moment --owner names somebody else the
  previous owner is in the Role in no form and their permission-set rows go
  with them. Nothing in the response says so.

  --owner none CLEARS ownership. An unowned Role has nobody who may transfer
  it, so only an org admin can ever give it an owner again.

  A transfer is checked separately against the CURRENT owner: refused, it is a
  403 and NOTHING ELSE in the request is applied.

  AN UNKNOWN FIELD IN --body IS DROPPED, NOT REFUSED. This body schema is not
  strict, so a key it does not know is stripped before the write and the call
  still answers success with that field unchanged — a typo looks like it worked.
  Only name, jobDescription and ownerUserId exist here. The Role's currency, its
  data-retention window, its paused state and its access card are NOT settable
  through this command and sending them changes nothing.

  A BODY CARRYING ONLY UNKNOWN KEYS ANSWERS "An update must change at least one
  field", because after they are dropped there is nothing left. That 400 is the
  one signal a field name was wrong — so it is worth sending a suspect key ALONE
  once, rather than beside a real one that would mask it.
  At least one field is required — an empty update is a 400 for that reason.`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          jobDescription: opts.jobDescription,
          // "none" is a token this CLI invents. The wire value is null, which
          // CLEARS the owner; omitting the flag leaves ownership alone. The two
          // cannot both be said by absence, so one of them has to be sayable.
          ownerUserId: readOwner(opts.owner)
        });
        const { role: updated } = await client.roles.update(
          roleId,
          asRequestBody<UpdateRoleBody>(body)
        );

        printSuccess("Role updated.", {
          id: updated.id,
          name: updated.name,
          // `--owner none` writes a null, and `role get` reads that field back as
          // a null. The write has to answer the same way — see `absent`.
          owner: updated.ownerUserId ?? absent("(none)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
