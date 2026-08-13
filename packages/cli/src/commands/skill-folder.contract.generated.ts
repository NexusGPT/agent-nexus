// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/types/src/api/public/v1/contract/, via z.toJSONSchema.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:contract-help
//
// `commands/contract-help.test.ts` re-derives this from the live contract and
// fails when the committed copy drifts, so a contract change cannot ship with
// the CLI still offering the old values.
//
// 🚨 THIS FILE IS ONE OF TWO OPINIONS, NEVER THE AUTHORITY. Where the CLI offers
// fewer values than the contract lists, the reason is declared at the flag in
// `skill-folder.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const SKILL_FOLDER_ASSIGN_CONTRACT = {
  name: "SkillFolderAssign",
  method: "POST",
  route: "/public/v1/skill-folders/assign",
  fields: [
    { path: "Body.skillId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.folderId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILL_FOLDER_CREATE_CONTRACT = {
  name: "SkillFolderCreate",
  method: "POST",
  route: "/public/v1/skill-folders",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.parentId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILL_FOLDER_DELETE_CONTRACT = {
  name: "SkillFolderDelete",
  method: "DELETE",
  route: "/public/v1/skill-folders/:folderId",
  fields: [
    { path: "PathVars.folderId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILL_FOLDER_LIST_CONTRACT = {
  name: "SkillFolderList",
  method: "GET",
  route: "/public/v1/skill-folders",
  fields: [

  ]
} as const satisfies ProjectedDescriptor;

export const SKILL_FOLDER_UPDATE_CONTRACT = {
  name: "SkillFolderUpdate",
  method: "PATCH",
  route: "/public/v1/skill-folders/:folderId",
  fields: [
    { path: "PathVars.folderId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.parentId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
