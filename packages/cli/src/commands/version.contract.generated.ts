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
// `version.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const VERSION_LIST__PARAMS_TYPE = {
  path: "VersionList.Params.type",
  contractValues: [
    "AUTO",
    "CHECKPOINT"
  ]
} as const satisfies ContractEnum;

export const VERSION_LIST_CONTRACT = {
  name: "VersionList",
  method: "GET",
  route: "/public/v1/agents/:agentId/versions",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.type", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["AUTO", "CHECKPOINT"] }
  ]
} as const satisfies ProjectedDescriptor;
