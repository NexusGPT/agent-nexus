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
// `role.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const ROLE_ACCESS_REQUESTS_CREATE__BODY_RESOURCE_TYPE = {
  path: "RoleAccessRequestsCreate.Body.resourceType",
  contractValues: [
    "agent",
    "workflow",
    "deployment",
    "ai_task",
    "document_template"
  ]
} as const satisfies ContractEnum;

export const ROLE_ACCESS_REQUESTS_REVIEW__BODY_STATUS = {
  path: "RoleAccessRequestsReview.Body.status",
  contractValues: [
    "APPROVED",
    "REJECTED"
  ]
} as const satisfies ContractEnum;

export const ROLE_CREATION_REQUESTS_LIST__PARAMS_STATUS = {
  path: "RoleCreationRequestsList.Params.status",
  contractValues: [
    "PENDING",
    "APPROVED",
    "REJECTED"
  ]
} as const satisfies ContractEnum;

export const ROLE_CREATION_REQUESTS_REVIEW__BODY_STATUS = {
  path: "RoleCreationRequestsReview.Body.status",
  contractValues: [
    "APPROVED",
    "REJECTED"
  ]
} as const satisfies ContractEnum;

export const ROLE_DELETION_REQUESTS_LIST__PARAMS_STATUS = {
  path: "RoleDeletionRequestsList.Params.status",
  contractValues: [
    "PENDING",
    "APPROVED",
    "REJECTED"
  ]
} as const satisfies ContractEnum;

export const ROLE_DELETION_REQUESTS_REVIEW__BODY_STATUS = {
  path: "RoleDeletionRequestsReview.Body.status",
  contractValues: [
    "APPROVED",
    "REJECTED"
  ]
} as const satisfies ContractEnum;

export const ROLE_JOB_TYPES_CREATE__BODY_BASIS = {
  path: "RoleJobTypesCreate.Body.basis",
  contractValues: [
    "SALARY",
    "HOURLY",
    "SEAT",
    "DAY",
    "UNIT",
    "FIXED",
    "CREDIT",
    "CUSTOM"
  ]
} as const satisfies ContractEnum;

export const ROLE_JOB_TYPES_CREATE__BODY_GROUP = {
  path: "RoleJobTypesCreate.Body.group",
  contractValues: [
    "PEOPLE",
    "PARTNERS",
    "PLATFORM",
    "CREDITS"
  ]
} as const satisfies ContractEnum;

export const ROLE_JOB_TYPES_UPDATE__BODY_BASIS = {
  path: "RoleJobTypesUpdate.Body.basis",
  contractValues: [
    "SALARY",
    "HOURLY",
    "SEAT",
    "DAY",
    "UNIT",
    "FIXED",
    "CREDIT",
    "CUSTOM"
  ]
} as const satisfies ContractEnum;

export const ROLE_JOB_TYPES_UPDATE__BODY_GROUP = {
  path: "RoleJobTypesUpdate.Body.group",
  contractValues: [
    "PEOPLE",
    "PARTNERS",
    "PLATFORM",
    "CREDITS"
  ]
} as const satisfies ContractEnum;

export const ROLES_ATTACH_RESOURCE__BODY_RESOURCE_TYPE = {
  path: "RolesAttachResource.Body.resourceType",
  contractValues: [
    "agent",
    "workflow",
    "deployment",
    "ai_task",
    "document_template"
  ]
} as const satisfies ContractEnum;

export const ROLES_CREATE_BOARD__BODY_ACCENT = {
  path: "RolesCreateBoard.Body.accent",
  contractValues: [
    "slate",
    "indigo",
    "violet",
    "sky",
    "teal",
    "emerald",
    "amber",
    "rose",
    "surface_base",
    "surface_secondary",
    "surface_contrast"
  ]
} as const satisfies ContractEnum;

export const ROLES_CREATE_PERMISSION_SET__BODY_RESOURCE_RELATION = {
  path: "RolesCreatePermissionSet.Body.resourceRelation",
  contractValues: [
    "owner",
    "editor",
    "viewer"
  ]
} as const satisfies ContractEnum;

export const ROLES_CREATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM = {
  path: "RolesCreatePermissionSet.Body.capabilities[]",
  contractValues: [
    "role.view",
    "role.update",
    "role.delete",
    "team.view",
    "team.manage",
    "group.view",
    "group.manage",
    "resource.view",
    "resource.attach",
    "resource.detach",
    "collection_grant.view",
    "collection_grant.manage",
    "workspace_grant.view",
    "workspace_grant.manage",
    "external_tool_grant.view",
    "external_tool_grant.manage",
    "coverage.view",
    "coverage.manage",
    "board.view",
    "board.manage",
    "access_request.view",
    "access_request.create",
    "access_request.review"
  ]
} as const satisfies ContractEnum;

export const ROLES_DETACH_RESOURCE__PATH_VARS_RESOURCE_TYPE = {
  path: "RolesDetachResource.PathVars.resourceType",
  contractValues: [
    "agent",
    "workflow",
    "deployment",
    "ai_task",
    "document_template"
  ]
} as const satisfies ContractEnum;

export const ROLES_LIST_ACCESS_REQUESTS__PARAMS_STATUS = {
  path: "RolesListAccessRequests.Params.status",
  contractValues: [
    "PENDING",
    "APPROVED",
    "REJECTED"
  ]
} as const satisfies ContractEnum;

export const ROLES_MOVE_BOARD_CARD__PATH_VARS_CARD_TYPE = {
  path: "RolesMoveBoardCard.PathVars.cardType",
  contractValues: [
    "agent",
    "workflow",
    "deployment",
    "ai_task",
    "document_template",
    "collection",
    "workspace",
    "external_tool"
  ]
} as const satisfies ContractEnum;

export const ROLES_UPDATE_BOARD__BODY_ACCENT = {
  path: "RolesUpdateBoard.Body.accent",
  contractValues: [
    "slate",
    "indigo",
    "violet",
    "sky",
    "teal",
    "emerald",
    "amber",
    "rose",
    "surface_base",
    "surface_secondary",
    "surface_contrast"
  ]
} as const satisfies ContractEnum;

export const ROLES_UPDATE_PERMISSION_SET__BODY_RESOURCE_RELATION = {
  path: "RolesUpdatePermissionSet.Body.resourceRelation",
  contractValues: [
    "owner",
    "editor",
    "viewer"
  ]
} as const satisfies ContractEnum;

export const ROLES_UPDATE_PERMISSION_SET__BODY_CAPABILITIES_ITEM = {
  path: "RolesUpdatePermissionSet.Body.capabilities[]",
  contractValues: [
    "role.view",
    "role.update",
    "role.delete",
    "team.view",
    "team.manage",
    "group.view",
    "group.manage",
    "resource.view",
    "resource.attach",
    "resource.detach",
    "collection_grant.view",
    "collection_grant.manage",
    "workspace_grant.view",
    "workspace_grant.manage",
    "external_tool_grant.view",
    "external_tool_grant.manage",
    "coverage.view",
    "coverage.manage",
    "board.view",
    "board.manage",
    "access_request.view",
    "access_request.create",
    "access_request.review"
  ]
} as const satisfies ContractEnum;

export const ROLES_UPSERT_MEMBER__BODY_TIER = {
  path: "RolesUpsertMember.Body.tier",
  contractValues: [
    "ADMIN",
    "MEMBER"
  ]
} as const satisfies ContractEnum;

export const ROLE_ACCESS_REQUESTS_CREATE_CONTRACT = {
  name: "RoleAccessRequestsCreate",
  method: "POST",
  route: "/public/v1/roles/:roleId/access-requests",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.resourceType", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["agent", "workflow", "deployment", "ai_task", "document_template"] },
    { path: "Body.resourceId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.note", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLE_ACCESS_REQUESTS_REVIEW_CONTRACT = {
  name: "RoleAccessRequestsReview",
  method: "PATCH",
  route: "/public/v1/roles/:roleId/access-requests/:requestId",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.requestId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.status", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["APPROVED", "REJECTED"] }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLE_CREATION_REQUESTS_LIST_CONTRACT = {
  name: "RoleCreationRequestsList",
  method: "GET",
  route: "/public/v1/role-creation-requests",
  fields: [
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["PENDING", "APPROVED", "REJECTED"] }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLE_CREATION_REQUESTS_REVIEW_CONTRACT = {
  name: "RoleCreationRequestsReview",
  method: "PATCH",
  route: "/public/v1/role-creation-requests/:requestId",
  fields: [
    { path: "PathVars.requestId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.status", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["APPROVED", "REJECTED"] }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLE_DELETION_REQUESTS_LIST_CONTRACT = {
  name: "RoleDeletionRequestsList",
  method: "GET",
  route: "/public/v1/role-deletion-requests",
  fields: [
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["PENDING", "APPROVED", "REJECTED"] }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLE_DELETION_REQUESTS_REVIEW_CONTRACT = {
  name: "RoleDeletionRequestsReview",
  method: "PATCH",
  route: "/public/v1/role-deletion-requests/:requestId",
  fields: [
    { path: "PathVars.requestId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.status", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["APPROVED", "REJECTED"] }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLE_JOB_TYPES_CREATE_CONTRACT = {
  name: "RoleJobTypesCreate",
  method: "POST",
  route: "/public/v1/role-job-types",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.basis", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["SALARY", "HOURLY", "SEAT", "DAY", "UNIT", "FIXED", "CREDIT", "CUSTOM"] },
    { path: "Body.group", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["PEOPLE", "PARTNERS", "PLATFORM", "CREDITS"] },
    { path: "Body.category", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.quantityUnit", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.note", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.fte", slot: "Body", type: "number", required: true, depth: 0 },
    { path: "Body.parts", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.parts[].key", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.parts[].label", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.parts[].unit", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.parts[].source", slot: "Body", type: "unknown", required: true, depth: 1 },
    { path: "Body.costExpression", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.hoursExpression", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.revenueExpression", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLE_JOB_TYPES_UPDATE_CONTRACT = {
  name: "RoleJobTypesUpdate",
  method: "PUT",
  route: "/public/v1/role-job-types/:jobTypeId",
  fields: [
    { path: "PathVars.jobTypeId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.basis", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["SALARY", "HOURLY", "SEAT", "DAY", "UNIT", "FIXED", "CREDIT", "CUSTOM"] },
    { path: "Body.group", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["PEOPLE", "PARTNERS", "PLATFORM", "CREDITS"] },
    { path: "Body.category", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.quantityUnit", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.note", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.fte", slot: "Body", type: "number", required: true, depth: 0 },
    { path: "Body.parts", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.parts[].key", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.parts[].label", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.parts[].unit", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.parts[].source", slot: "Body", type: "unknown", required: true, depth: 1 },
    { path: "Body.costExpression", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.hoursExpression", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.revenueExpression", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_ATTACH_RESOURCE_CONTRACT = {
  name: "RolesAttachResource",
  method: "POST",
  route: "/public/v1/roles/:roleId/resources",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.resourceType", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["agent", "workflow", "deployment", "ai_task", "document_template"] },
    { path: "Body.resourceId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_CREATE_BOARD_CONTRACT = {
  name: "RolesCreateBoard",
  method: "POST",
  route: "/public/v1/roles/:roleId/boards",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.accent", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["slate", "indigo", "violet", "sky", "teal", "emerald", "amber", "rose", "surface_base", "surface_secondary", "surface_contrast"] }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_CREATE_PERMISSION_SET_CONTRACT = {
  name: "RolesCreatePermissionSet",
  method: "POST",
  route: "/public/v1/roles/:roleId/permission-sets",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.resourceRelation", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["owner", "editor", "viewer"] },
    { path: "Body.capabilities", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.capabilities[]", slot: "Body", type: "string", required: true, depth: 1, enumValues: ["role.view", "role.update", "role.delete", "team.view", "team.manage", "group.view", "group.manage", "resource.view", "resource.attach", "resource.detach", "collection_grant.view", "collection_grant.manage", "workspace_grant.view", "workspace_grant.manage", "external_tool_grant.view", "external_tool_grant.manage", "coverage.view", "coverage.manage", "board.view", "board.manage", "access_request.view", "access_request.create", "access_request.review"] },
    { path: "Body.surfaces", slot: "Body", type: "array", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_DELETE_BOARD_CONTRACT = {
  name: "RolesDeleteBoard",
  method: "DELETE",
  route: "/public/v1/roles/:roleId/boards/:boardId",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.boardId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_DETACH_RESOURCE_CONTRACT = {
  name: "RolesDetachResource",
  method: "DELETE",
  route: "/public/v1/role-resources/:resourceType/:resourceId",
  fields: [
    { path: "PathVars.resourceType", slot: "PathVars", type: "string", required: true, depth: 0, enumValues: ["agent", "workflow", "deployment", "ai_task", "document_template"] },
    { path: "PathVars.resourceId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_LIST_ACCESS_REQUESTS_CONTRACT = {
  name: "RolesListAccessRequests",
  method: "GET",
  route: "/public/v1/roles/:roleId/access-requests",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["PENDING", "APPROVED", "REJECTED"] }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_LIST_BOARDS_CONTRACT = {
  name: "RolesListBoards",
  method: "GET",
  route: "/public/v1/roles/:roleId/boards",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_MOVE_BOARD_CARD_CONTRACT = {
  name: "RolesMoveBoardCard",
  method: "PATCH",
  route: "/public/v1/roles/:roleId/cards/:cardType/:cardId",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.cardType", slot: "PathVars", type: "string", required: true, depth: 0, enumValues: ["agent", "workflow", "deployment", "ai_task", "document_template", "collection", "workspace", "external_tool"] },
    { path: "PathVars.cardId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.boardId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_REORDER_BOARDS_CONTRACT = {
  name: "RolesReorderBoards",
  method: "PUT",
  route: "/public/v1/roles/:roleId/boards",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.boardIds", slot: "Body", type: "array", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_UPDATE_BOARD_CONTRACT = {
  name: "RolesUpdateBoard",
  method: "PATCH",
  route: "/public/v1/roles/:roleId/boards/:boardId",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.boardId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.accent", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["slate", "indigo", "violet", "sky", "teal", "emerald", "amber", "rose", "surface_base", "surface_secondary", "surface_contrast"] }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_UPDATE_PERMISSION_SET_CONTRACT = {
  name: "RolesUpdatePermissionSet",
  method: "PATCH",
  route: "/public/v1/roles/:roleId/permission-sets/:permissionSetId",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.permissionSetId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.resourceRelation", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["owner", "editor", "viewer"] },
    { path: "Body.capabilities", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.capabilities[]", slot: "Body", type: "string", required: true, depth: 1, enumValues: ["role.view", "role.update", "role.delete", "team.view", "team.manage", "group.view", "group.manage", "resource.view", "resource.attach", "resource.detach", "collection_grant.view", "collection_grant.manage", "workspace_grant.view", "workspace_grant.manage", "external_tool_grant.view", "external_tool_grant.manage", "coverage.view", "coverage.manage", "board.view", "board.manage", "access_request.view", "access_request.create", "access_request.review"] },
    { path: "Body.surfaces", slot: "Body", type: "array", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ROLES_UPSERT_MEMBER_CONTRACT = {
  name: "RolesUpsertMember",
  method: "POST",
  route: "/public/v1/roles/:roleId/members",
  fields: [
    { path: "PathVars.roleId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.userId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.tier", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["ADMIN", "MEMBER"] }
  ]
} as const satisfies ProjectedDescriptor;
