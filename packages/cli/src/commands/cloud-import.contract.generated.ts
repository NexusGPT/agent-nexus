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
// `cloud-import.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const CLOUD_IMPORT_BROWSE_CONTRACT = {
  name: "CloudImportBrowse",
  method: "GET",
  route: "/public/v1/documents/imports/:provider/items",
  fields: [
    { path: "PathVars.provider", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.connectionId", slot: "Params", type: "string", required: true, depth: 0 },
    { path: "Params.folderId", slot: "Params", type: "string", required: true, depth: 0 },
    { path: "Params.siteId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.pageToken", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CLOUD_IMPORT_ITEMS_CONTRACT = {
  name: "CloudImportItems",
  method: "POST",
  route: "/public/v1/documents/imports/:provider/import",
  fields: [
    { path: "PathVars.provider", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.connectionId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.itemIds", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.parentId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.siteId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CLOUD_IMPORT_LIST_PROVIDERS_CONTRACT = {
  name: "CloudImportListProviders",
  method: "GET",
  route: "/public/v1/documents/imports/providers",
  fields: [

  ]
} as const satisfies ProjectedDescriptor;

export const CLOUD_IMPORT_SEARCH_CONTRACT = {
  name: "CloudImportSearch",
  method: "GET",
  route: "/public/v1/documents/imports/:provider/search",
  fields: [
    { path: "PathVars.provider", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.connectionId", slot: "Params", type: "string", required: true, depth: 0 },
    { path: "Params.query", slot: "Params", type: "string", required: true, depth: 0 },
    { path: "Params.folderId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.siteId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.pageToken", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
