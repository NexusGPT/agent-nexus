import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { reportGovernedWrite } from "../_shared/report-governed-write";
import { createRole } from "./create.handler";

/** `nexus role create` */
export function registerRoleCreateCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("create")
    .description("Create a Role, or file a request to create one")
    // 🚨 NOT `requiredOption`, AND THAT IS NEX-3629. Commander enforces a
    // required option BEFORE the action runs, so it cannot see `--body` — a
    // complete body carrying name and ownerUserId was refused with
    // "required option '--name <name>' not specified", which defeats the one
    // thing `--body` is for. `name` and `jobDescription` are the two fields most
    // likely to carry an apostrophe or an accent, which is what breaks shell
    // quoting and sends a caller to a file in the first place.
    //
    // The requirement is unchanged; it is now checked AFTER both sources are
    // merged, by `requireAll`, which names the flags a user can actually type.
    .option("--name <name>", "The Role's display name — required, as a flag or in --body")
    .option("--owner <userId>", "Who owns it — required, the server will not choose")
    .option("--job-description <text>", "What the Role is for")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role create --name "Refunds" --owner user_abc
  $ nexus role create --name "Refunds" --owner user_abc --job-description "Handles refunds"
  $ nexus role create --body ./role.json
  $ echo '{"name":"Réclamations","ownerUserId":"user_abc"}' | nexus role create --body -

Notes:
  --owner is REQUIRED here and optional in the dashboard. A key's subject is
  whoever MINTED the key, so defaulting the owner would make ownership a fact
  about a credential rather than a decision the organization took.

  A COMPLETE --body IS ENOUGH. name and ownerUserId may come from the body
  instead of from --name / --owner; a flag wins over the body field of the same
  name. The body keys are the API's — "ownerUserId", not "owner" — and
  jobDescription is optional in both places. Use --body when a value carries an
  apostrophe or an accent, which is what --body exists for.

  A 2xx DOES NOT MEAN A ROLE EXISTS. If governance requires approval this files
  a request instead and reports status "pending" — nothing was created and an
  admin must approve it. This command prints which of the two happened.

  BRANCH ON "status", NEVER ON THE EXIT CODE OR ON "success". Both outcomes are
  a 0 exit and "success": true. --json carries "status": "created" with the new
  Role's "id", or "status": "pending" with a "requestId" — poll that one with
  "nexus role creation-request <requestId>", whose CREATED ROLE holds the id
  once an admin approves it.

  A USER ID COMES FROM "nexus api GET /me", AND FROM NOWHERE ELSE IN THIS CLI.
  Nothing here lists the users in your organization, and "nexus auth whoami"
  prints the EMAIL under "user" and never the id — so pasting what whoami shows
  gets a 404 that reads as the user not existing. Your own id is
  "nexus api GET /me | jq -r .data.userId", and it is the same id
  "nexus role add-member", "nexus user-group add-member" and
  "nexus permissions grant --subject-type user" want.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await createRole(client, opts);

        reportGovernedWrite(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
