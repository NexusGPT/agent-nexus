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
// `workspace.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const WORKSPACE_MINT_MOUNT_CREDENTIALS__BODY_ACCESS = {
  path: "WorkspaceMintMountCredentials.Body.access",
  contractValues: [
    "read",
    "read-write"
  ]
} as const satisfies ContractEnum;

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

export const WORKSPACE_FILE_HISTORY_CONTRACT = {
  name: "WorkspaceFileHistory",
  method: "GET",
  route: "/public/v1/workspaces/:slug/history",
  fields: [
    { path: "PathVars.slug", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.workspaceId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.path", slot: "Params", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKSPACE_FOLDER_ARCHIVE_CONTRACT = {
  name: "WorkspaceFolderArchive",
  method: "GET",
  route: "/public/v1/workspaces/:slug/folder-archive",
  fields: [
    { path: "PathVars.slug", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.workspaceId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.path", slot: "Params", type: "string", required: false, depth: 0 }
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

export const WORKSPACE_MINT_MOUNT_CREDENTIALS_CONTRACT = {
  name: "WorkspaceMintMountCredentials",
  method: "POST",
  route: "/public/v1/workspaces/:slug/mount-credentials",
  fields: [
    { path: "PathVars.slug", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.workspaceId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.access", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["read", "read-write"] }
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

export const WORKSPACE_REVERT_CONTRACT = {
  name: "WorkspaceRevert",
  method: "POST",
  route: "/public/v1/workspaces/:slug/revert",
  fields: [
    { path: "PathVars.slug", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.path", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.versionId", slot: "Body", type: "string", required: true, depth: 0 },
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

export const WORKSPACE_UPLOAD_BATCH_CONTRACT = {
  name: "WorkspaceUploadBatch",
  method: "POST",
  route: "/public/v1/workspaces/:slug/upload-batch",
  fields: [
    { path: "PathVars.slug", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.paths", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.workspaceId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.noClobber", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
