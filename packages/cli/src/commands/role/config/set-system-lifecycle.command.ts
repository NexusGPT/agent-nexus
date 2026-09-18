import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumArgument } from "../../../contract-binding";
import { handleError } from "../../../errors";
import {
  ROLES_TRANSITION_SYSTEM_LIFECYCLE__BODY_LIFECYCLE,
  ROLES_TRANSITION_SYSTEM_LIFECYCLE_CONTRACT
} from "../../role.contract.generated";
import { readLifecycle } from "../_shared/read-lifecycle";
import { resolveRoleId } from "../_shared/resolve-role-id";
import { renderRoleSetSystemLifecycle } from "./set-system-lifecycle.render";

/** `nexus role set-system-lifecycle` */
export function registerRoleSetSystemLifecycleCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("set-system-lifecycle")
    .description("Move one of a Role's systems between coverage buckets")
    .argument("<role>", "Role name or UUID")
    .argument("<system>", 'The attachment\'s UUID — from "nexus role systems"')
    .addArgument(
      enumArgument(
        "<lifecycle>",
        "The bucket to move it into",
        ROLES_TRANSITION_SYSTEM_LIFECYCLE__BODY_LIFECYCLE,
        undefined,
        // Case-folded, exactly as `readVerdict` folds APPROVED/REJECTED. This is
        // not a widening: the three contract values are uppercase, so what goes
        // on the wire is a contract member whatever the operator typed, and
        // `enumArgument` validates the OUTPUT rather than the input. A folder
        // that went the other way WOULD widen, and would need a declaration.
        (value) => value.toUpperCase()
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role set-system-lifecycle "Support agent" 7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44 LIVE
  $ nexus role set-system-lifecycle "Support agent" 7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44 retired

Notes:
  THIS MOVES "nexus role coverage" IN BOTH DIRECTIONS AND SAYS NOTHING ABOUT BY
  HOW MUCH. Only a LIVE system is summed into the Role's numerator and its money
  totals, so moving one into LIVE adds its hours, revenue and cost, and moving
  one out — to BUILDING or RETIRED — removes all three. No model is touched
  either way and the system keeps reporting its own hours on its own row, so the
  per-system list looks identical while the headline figure has moved. Re-read
  "nexus role coverage" to see what happened.

  <system> IS THE ATTACHMENT'S ID, NOT THE AGENT'S OR THE WORKFLOW'S. A system
  lives in one Role at a time, so its own id says nothing about which Role holds
  it; the attachment id addresses this Role's claim and nothing else. Read it
  from "nexus role systems".

  LIVE IS REACHABLE ONLY FROM BUILDING. RETIRED -> LIVE is refused, and so is
  asking for the bucket the system is already in. Un-retiring is two calls:
  RETIRED, then BUILDING, then LIVE. The rule exists so every approval has a
  submitter to be checked against — only the move into BUILDING records one — so
  a direct edge would put systems live with no submitter and the Role's review
  requirement could then only fail open or fail closed for exactly those rows.

  IF THE ROLE'S SYSTEM POLICY SETS requireReview, THE APPROVER MUST NOT BE THE
  SUBMITTER. This call acts as the API key's OWNER, so a key whose owner
  submitted the system is refused and no retry helps — a second person has to
  run it. A system with no recorded submitter cannot satisfy the rule either;
  retire it and submit it again to record one.

  Needs roles:write, plus the Role's own role.update capability — a scope alone
  is not enough. It is role.update and NOT coverage.manage on purpose: the
  review rule lives on the system policy, whose write is role.update, so gating
  this on the coverage capability would let its holder move systems live under a
  rule they cannot see or configure. roles:write does NOT carry
  role_coverage:read, so mint that too if you want to read the figure back.`
    )
    .action(async (ref: string, systemId: string, lifecycle: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const result = await client.roles.transitionSystemLifecycle(roleId, systemId, {
          lifecycle: readLifecycle(lifecycle)
        });

        renderRoleSetSystemLifecycle(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLES_TRANSITION_SYSTEM_LIFECYCLE_CONTRACT);
  return leaf;
}
