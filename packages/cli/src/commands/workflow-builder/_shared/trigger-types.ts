import type { ReplaceTriggerBody } from "@agent-nexus/sdk";

import { WORKFLOW_NODE_REPLACE_TRIGGER__BODY_TYPE } from "../../workflow.contract.generated";

/**
 * The trigger types, from the v1 contract rather than retyped.
 *
 * This was a hand-written tuple of six strings kept in step with the SDK union
 * by a `satisfies`. It agreed with the contract when it was written, which is
 * the only guarantee a hand-copy ever gives: the compile-time link caught the
 * SDK drifting and nothing caught the CONTRACT drifting.
 *
 * The annotation below does the same job in the same place — assigning the
 * generated values to the SDK union is a compile error the moment the two stop
 * agreeing — while the values themselves now come from one source.
 */
export const TRIGGER_TYPES: readonly ReplaceTriggerBody["type"][] =
  WORKFLOW_NODE_REPLACE_TRIGGER__BODY_TYPE.contractValues;

/**
 * Narrow a `--type` string to the SDK's own trigger union.
 *
 * A PREDICATE rather than a bare `.includes` followed by an assertion, and the
 * difference is what the compiler can say. `opts.type as ReplaceTriggerBody["type"]`
 * is an assertion: nothing links it to the check above it, so moving that check,
 * or deleting it, still compiles. Narrowing through this predicate makes the
 * annotated binding at the call site an ASSIGNMENT the compiler checks, so
 * deleting the guard is a `TS2322` rather than a silent widening.
 *
 * The one cast left is on the HAYSTACK: `Array.prototype.includes` declares its
 * parameter as the array's own element type, so a `readonly ApiTriggerType[]`
 * refuses a `string` needle. Widening the array switches no check off — every
 * member of the union is a `string` — and the needle is what the predicate then
 * narrows.
 */
export function isTriggerType(value: string): value is ReplaceTriggerBody["type"] {
  return (TRIGGER_TYPES as readonly string[]).includes(value);
}
