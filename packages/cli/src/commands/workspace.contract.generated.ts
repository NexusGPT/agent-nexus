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
// `workspace.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const WORKSPACE_CREATE_CONTRACT = {
  name: "WorkspaceCreate",
  method: "POST",
  route: "/public/v1/workspaces",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKSPACE_DELETE_CONTRACT = {
  name: "WorkspaceDelete",
  method: "DELETE",
  route: "/public/v1/workspaces/:slug",
  fields: [
    { path: "PathVars.slug", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKSPACE_LIST_CONTRACT = {
  name: "WorkspaceList",
  method: "GET",
  route: "/public/v1/workspaces",
  fields: [
    { path: "Params.include", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKSPACE_RENAME_CONTRACT = {
  name: "WorkspaceRename",
  method: "PATCH",
  route: "/public/v1/workspaces/:slug",
  fields: [
    { path: "PathVars.slug", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKSPACE_RESTORE_CONTRACT = {
  name: "WorkspaceRestore",
  method: "POST",
  route: "/public/v1/workspaces/:slug/restore",
  fields: [
    { path: "PathVars.slug", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.path", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.workspaceId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKSPACE_SEARCH_CONTRACT = {
  name: "WorkspaceSearch",
  method: "GET",
  route: "/public/v1/workspaces/:slug/search",
  fields: [
    { path: "PathVars.slug", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.workspaceId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.query", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.frontmatter", slot: "Params", type: "unknown", required: false, depth: 0 },
    { path: "Params.path", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
