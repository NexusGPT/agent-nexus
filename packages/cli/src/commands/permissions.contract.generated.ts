// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/types/src/api/public/v1/contract/, via z.toJSONSchema.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:contract-help
//
// NOTHING UNDER `src/` RE-DERIVES THIS. That needs Zod, which the published
// binary does not depend on, so `commands/contract-help.test.ts` checks the
// flags against this data and says so in its own header — it cannot tell you
// the data is current. `scripts/generated-drift.mjs` is what does: it
// regenerates and requires a byte-exact match, at review time in the
// `Generated config` job of pr-checks.yml and again on every push to
// staging/main.
//
// 🚨 THIS FILE IS ONE OF TWO OPINIONS, NEVER THE AUTHORITY. Where the CLI offers
// fewer values than the contract lists, the reason is declared at the flag in
// `permissions.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const PERMISSIONS_GRANT__BODY_RESOURCE_TYPE = {
  path: "PermissionsGrant.Body.resourceType",
  contractValues: [
    "agent",
    "workflow",
    "credential",
    "access_card",
    "template",
    "document",
    "deployment",
    "feature",
    "vibe_app",
    "track"
  ]
} as const satisfies ContractEnum;

export const PERMISSIONS_GRANT__BODY_SUBJECT_TYPE = {
  path: "PermissionsGrant.Body.subjectType",
  contractValues: [
    "user",
    "group",
    "organization",
    "api_key",
    "role"
  ]
} as const satisfies ContractEnum;

export const PERMISSIONS_GRANT__BODY_RELATION = {
  path: "PermissionsGrant.Body.relation",
  contractValues: [
    "owner",
    "editor",
    "viewer"
  ]
} as const satisfies ContractEnum;

export const PERMISSIONS_LIST_RESOURCE_ACCESS__PATH_VARS_RESOURCE_TYPE = {
  path: "PermissionsListResourceAccess.PathVars.resourceType",
  contractValues: [
    "agent",
    "workflow",
    "credential",
    "access_card",
    "template",
    "document",
    "deployment",
    "feature",
    "vibe_app",
    "track"
  ]
} as const satisfies ContractEnum;

export const PERMISSIONS_REVOKE__BODY_RESOURCE_TYPE = {
  path: "PermissionsRevoke.Body.resourceType",
  contractValues: [
    "agent",
    "workflow",
    "credential",
    "access_card",
    "template",
    "document",
    "deployment",
    "feature",
    "vibe_app",
    "track"
  ]
} as const satisfies ContractEnum;

export const PERMISSIONS_REVOKE__BODY_SUBJECT_TYPE = {
  path: "PermissionsRevoke.Body.subjectType",
  contractValues: [
    "user",
    "group",
    "organization",
    "api_key",
    "role"
  ]
} as const satisfies ContractEnum;

export const PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_RESOURCE_TYPE = {
  path: "PermissionsUpdateResourceTypeVisibility.Body.resourceType",
  contractValues: [
    "agent",
    "workflow",
    "knowledge",
    "credential",
    "template",
    "document",
    "deployment",
    "feature",
    "workspace"
  ]
} as const satisfies ContractEnum;

export const PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY__BODY_VISIBILITY = {
  path: "PermissionsUpdateResourceTypeVisibility.Body.visibility",
  contractValues: [
    "open",
    "closed"
  ]
} as const satisfies ContractEnum;

export const PERMISSIONS_GRANT_CONTRACT = {
  name: "PermissionsGrant",
  method: "POST",
  route: "/public/v1/permissions/grant",
  fields: [
    { path: "Body.resourceType", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["agent", "workflow", "credential", "access_card", "template", "document", "deployment", "feature", "vibe_app", "track"] },
    { path: "Body.resourceId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.subjectType", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["user", "group", "organization", "api_key", "role"] },
    { path: "Body.subjectId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.relation", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["owner", "editor", "viewer"] }
  ]
} as const satisfies ProjectedDescriptor;

export const PERMISSIONS_LIST_RESOURCE_ACCESS_CONTRACT = {
  name: "PermissionsListResourceAccess",
  method: "GET",
  route: "/public/v1/permissions/:resourceType/:resourceId/access",
  fields: [
    { path: "PathVars.resourceType", slot: "PathVars", type: "string", required: true, depth: 0, enumValues: ["agent", "workflow", "credential", "access_card", "template", "document", "deployment", "feature", "vibe_app", "track"] },
    { path: "PathVars.resourceId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PERMISSIONS_REVOKE_CONTRACT = {
  name: "PermissionsRevoke",
  method: "POST",
  route: "/public/v1/permissions/revoke",
  fields: [
    { path: "Body.resourceType", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["agent", "workflow", "credential", "access_card", "template", "document", "deployment", "feature", "vibe_app", "track"] },
    { path: "Body.resourceId", slot: "Body", type: "unknown", required: true, depth: 0 },
    { path: "Body.subjectType", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["user", "group", "organization", "api_key", "role"] },
    { path: "Body.subjectId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.cascadeSubjectIds", slot: "Body", type: "array", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PERMISSIONS_UPDATE_RESOURCE_TYPE_VISIBILITY_CONTRACT = {
  name: "PermissionsUpdateResourceTypeVisibility",
  method: "PATCH",
  route: "/public/v1/permissions/org-settings/resource-type",
  fields: [
    { path: "Body.resourceType", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["agent", "workflow", "knowledge", "credential", "template", "document", "deployment", "feature", "workspace"] },
    { path: "Body.visibility", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["open", "closed"] }
  ]
} as const satisfies ProjectedDescriptor;
