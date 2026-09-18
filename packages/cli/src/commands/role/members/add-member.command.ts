import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import {
  ROLES_UPSERT_MEMBER__BODY_TIER,
  ROLES_UPSERT_MEMBER_CONTRACT
} from "../../role.contract.generated";
import { foldUpper } from "../_shared/fold-upper";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role add-member` */
export function registerRoleAddMemberCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("add-member")
    .description("Seat a user in a Role as ADMIN or MEMBER, or change their tier")
    .argument("<role>", "Role name or UUID")
    .argument("<user-id>", "Clerk user id of somebody in your organization")
    .addOption(
      enumOption(
        "--tier <tier>",
        "Seat tier",
        ROLES_UPSERT_MEMBER__BODY_TIER,
        undefined,
        foldUpper
      ).default("MEMBER")
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role add-member "Support agent" user_abc
  $ nexus role add-member "Support agent" user_abc --tier ADMIN

Notes:
  AN UPSERT. Running it again with the other --tier MOVES that person between
  ADMIN and MEMBER rather than failing. The TIER line printed below is the tier
  that now stands, which is the only way to tell a promotion from an addition.

  A MEMBERSHIP ROW ON ITS OWN IS NOT A CAPABILITY GRANT. It is how the server
  resolves a person's reach into the Role's systems, collections and
  workspaces. Run "nexus role add-permission-set-member" to put someone into a
  CUSTOM permission set.

  --TIER NOW SEATS THE PERSON INTO A REAL PERMISSION SET. ADMIN is seated into
  "maintainer" — every capability except deleting the Role (owner- or
  org-admin-only) and creating one (org-scoped-only) — and MEMBER into
  "member" (every read, plus filing an access request). Reach into the Role's
  systems, collections and workspaces is identical either way; the
  capabilities that reach unlocks are not.

  THE USER MUST ALREADY BE IN YOUR ORGANIZATION. A user id from another tenant
  is refused as "not found" — the same answer an id that exists nowhere gets,
  because telling the two apart would confirm somebody else's user exists.

  THE OWNER CANNOT BE A MEMBER. Ownership is a field on the Role, not a
  membership row, so seating the current owner is refused; use
  "nexus role update --owner" to hand the Role over instead.`
    )
    .action(async (ref: string, userId: string, opts: { tier: string }) => {
      try {
        const tier = opts.tier.toUpperCase();
        if (tier !== "ADMIN" && tier !== "MEMBER") {
          // Refused here rather than at the server: commander cannot express a
          // choice on a value option, and a 400 naming a Zod path is a worse
          // answer than naming the two words that work.
          throw new Error(`--tier must be ADMIN or MEMBER, not "${opts.tier}"`);
        }

        const client = createClient(program.optsWithGlobals());
        const member = await client.roles.upsertMember(await resolveRoleId(client, ref), {
          userId,
          tier
        });

        printSuccess("Member seated.", {
          userId: member.userId,
          tier: member.tier,
          roleId: member.roleId
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_UPSERT_MEMBER_CONTRACT);
  return leaf;
}
