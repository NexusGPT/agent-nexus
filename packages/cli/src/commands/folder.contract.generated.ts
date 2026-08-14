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
// `folder.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const FOLDER_ASSIGN_AGENT_CONTRACT = {
  name: "FolderAssignAgent",
  method: "POST",
  route: "/public/v1/folders/assign",
  fields: [
    { path: "Body.agentId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.folderId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const FOLDER_CREATE_CONTRACT = {
  name: "FolderCreate",
  method: "POST",
  route: "/public/v1/folders",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.parentId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const FOLDER_DELETE_CONTRACT = {
  name: "FolderDelete",
  method: "DELETE",
  route: "/public/v1/folders/:folderId",
  fields: [
    { path: "PathVars.folderId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const FOLDER_LIST_CONTRACT = {
  name: "FolderList",
  method: "GET",
  route: "/public/v1/folders",
  fields: [

  ]
} as const satisfies ProjectedDescriptor;

export const FOLDER_UPDATE_CONTRACT = {
  name: "FolderUpdate",
  method: "PATCH",
  route: "/public/v1/folders/:folderId",
  fields: [
    { path: "PathVars.folderId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.parentId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
