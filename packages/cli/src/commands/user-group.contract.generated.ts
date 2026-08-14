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
// `user-group.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const USER_GROUPS_ADD_MEMBER_CONTRACT = {
  name: "UserGroupsAddMember",
  method: "POST",
  route: "/public/v1/user-groups/:userGroupId/members/add",
  fields: [
    { path: "PathVars.userGroupId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.userId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const USER_GROUPS_CREATE_CONTRACT = {
  name: "UserGroupsCreate",
  method: "POST",
  route: "/public/v1/user-groups",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.userIds", slot: "Body", type: "array", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const USER_GROUPS_DELETE_CONTRACT = {
  name: "UserGroupsDelete",
  method: "DELETE",
  route: "/public/v1/user-groups/:userGroupId",
  fields: [
    { path: "PathVars.userGroupId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const USER_GROUPS_LIST_CONTRACT = {
  name: "UserGroupsList",
  method: "GET",
  route: "/public/v1/user-groups",
  fields: [

  ]
} as const satisfies ProjectedDescriptor;

export const USER_GROUPS_REMOVE_MEMBER_CONTRACT = {
  name: "UserGroupsRemoveMember",
  method: "POST",
  route: "/public/v1/user-groups/:userGroupId/members/remove",
  fields: [
    { path: "PathVars.userGroupId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.userId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const USER_GROUPS_UPDATE_CONTRACT = {
  name: "UserGroupsUpdate",
  method: "PUT",
  route: "/public/v1/user-groups/:userGroupId",
  fields: [
    { path: "PathVars.userGroupId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.userIds", slot: "Body", type: "array", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
