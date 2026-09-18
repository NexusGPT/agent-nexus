import type { RoleResourceType, RoleTaskAssignmentInput } from "@agent-nexus/sdk";

/**
 * Every member of `RoleResourceType`, as a runtime lookup.
 *
 * A `Record` over the union rather than an array, for the reason the permissions
 * command gives: a kind added to the SDK is a COMPILE ERROR here until it is
 * listed, where an array would silently start rejecting a kind the server accepts.
 *
 * ⚠️ NOT the same set as the permission system's resource types. A Role holds
 * OPERATIONAL systems; a sharing grant is written against a different set, and
 * `knowledge` / `credential` / `workspace` appear only in the second. Passing one
 * of those here is refused locally rather than 400ing on a path segment.
 *
 * 🔴 `external_tool` LEFT THIS SET ON 2026-08-13 AND MUST NOT BE PUT BACK. A
 * Role reaches a tool through `RoleExternalToolGrant`, an M:N table, because
 * several Roles legitimately hold the same catalogue tool — which
 * `RoleResource @@unique([organizationId, resourceType, resourceId])` cannot
 * express. `attach`/`detach` write `RoleResource`, so offering `external_tool`
 * here sends an operator down a path the server refuses. The compile error that
 * removing it from the SDK produced HERE is this comment's whole point working
 * as designed: it fires in the removal direction too, not only on an addition.
 */
const ROLE_RESOURCE_TYPES: Record<RoleResourceType, true> = {
  agent: true,
  workflow: true,
  deployment: true,
  ai_task: true,
  document_template: true
};

export const RESOURCE_TYPE_NAMES = Object.keys(ROLE_RESOURCE_TYPES).sort().join(", ");

/**
 * The two arms a task assignment may take, as a Record over the SDK's own union.
 *
 * 🚨 THE `Record<…, true>` IS THE GATE, EXACTLY AS IT IS FOR THE RESOURCE TYPES
 * ABOVE. An arm added to the SDK is a compile error until it is listed here; an
 * arm removed is a `TS2353` on this object. That is the only thing binding the
 * `--help` below to the shape the API actually accepts — and the help documented
 * a `"person:<userId>"` string form that the API has never taken, for as long as
 * nothing read both (NEX-3778).
 */
const ROLE_TASK_ASSIGNMENT_KINDS: Record<RoleTaskAssignmentInput["kind"], true> = {
  person: true,
  resource: true
};

/**
 * Exported so `role.test.ts` can assert the `--help` INTERPOLATED these rather
 * than restating them. A test spelling the arms out itself would be a third copy
 * beside the schema and the help, which is the shape that produced NEX-3778.
 */
export const ASSIGNMENT_KIND_NAMES = Object.keys(ROLE_TASK_ASSIGNMENT_KINDS).sort().join(" and ");

export function isRoleResourceType(value: string): value is RoleResourceType {
  return Object.prototype.hasOwnProperty.call(ROLE_RESOURCE_TYPES, value);
}
