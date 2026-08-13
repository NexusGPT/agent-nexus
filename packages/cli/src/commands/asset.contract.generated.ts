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
// `asset.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const ASSET_DELETE_CONTRACT = {
  name: "AssetDelete",
  method: "DELETE",
  route: "/public/v1/assets/:assetId",
  fields: [
    { path: "PathVars.assetId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ASSET_GET_CONTRACT = {
  name: "AssetGet",
  method: "GET",
  route: "/public/v1/assets/:assetId",
  fields: [
    { path: "PathVars.assetId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ASSET_LIST_CONTRACT = {
  name: "AssetList",
  method: "GET",
  route: "/public/v1/assets",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ASSET_UPLOAD_CONTRACT = {
  name: "AssetUpload",
  method: "POST",
  route: "/public/v1/assets",
  fields: [

  ]
} as const satisfies ProjectedDescriptor;
