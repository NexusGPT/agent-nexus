import type { RoleResourceLifecycle } from "@agent-nexus/sdk";

import { ROLES_TRANSITION_SYSTEM_LIFECYCLE__BODY_LIFECYCLE } from "../../role.contract.generated";

/**
 * The three coverage buckets, DERIVED from the generated contract rather than
 * retyped — so a fourth member upstream cannot leave this narrowing behind.
 */
type ContractLifecycle =
  (typeof ROLES_TRANSITION_SYSTEM_LIFECYCLE__BODY_LIFECYCLE.contractValues)[number];

/**
 * Narrow a `<lifecycle>` positional to the SDK's union, with no cast.
 *
 * `enumArgument` has already normalised and validated this value against the
 * same generated constant, so the throw below is unreachable through commander —
 * stated anyway, exactly as the v1 handler states its own unreachable actor
 * check, because "unreachable" is a property of the argument declaration above
 * and not of this function.
 *
 * 🔑 IT ALSO CROSS-CHECKS THE TWO VOCABULARIES FOR FREE. The return type is the
 * SDK's `RoleResourceLifecycle` and the value's type is the CONTRACT's member
 * union, so a value the contract gains and the published SDK type has not is a
 * compile error here rather than a runtime 400 for whoever typed it.
 */
export function readLifecycle(raw: string): RoleResourceLifecycle {
  const value = raw.toUpperCase();
  const match = ROLES_TRANSITION_SYSTEM_LIFECYCLE__BODY_LIFECYCLE.contractValues.find(
    (candidate: ContractLifecycle) => candidate === value
  );

  if (match === undefined) {
    throw new Error(
      `Invalid lifecycle "${raw}". Expected ` +
        `${ROLES_TRANSITION_SYSTEM_LIFECYCLE__BODY_LIFECYCLE.contractValues.join(", ")}.`
    );
  }

  return match;
}
