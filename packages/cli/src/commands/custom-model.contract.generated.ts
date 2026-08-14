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
// `custom-model.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const CUSTOM_MODEL_CREATE__BODY_PROTOCOL = {
  path: "CustomModelCreate.Body.protocol",
  contractValues: [
    "openai"
  ]
} as const satisfies ContractEnum;

export const CUSTOM_MODEL_UPDATE__BODY_PROTOCOL = {
  path: "CustomModelUpdate.Body.protocol",
  contractValues: [
    "openai"
  ]
} as const satisfies ContractEnum;

export const CUSTOM_MODEL_CREATE_CONTRACT = {
  name: "CustomModelCreate",
  method: "POST",
  route: "/public/v1/custom-models",
  fields: [
    { path: "Body.displayName", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.modelName", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.baseUrl", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.protocol", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["openai"] },
    { path: "Body.apiKey", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.enabled", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOM_MODEL_DELETE_CONTRACT = {
  name: "CustomModelDelete",
  method: "DELETE",
  route: "/public/v1/custom-models/:customModelId",
  fields: [
    { path: "PathVars.customModelId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOM_MODEL_GET_CONTRACT = {
  name: "CustomModelGet",
  method: "GET",
  route: "/public/v1/custom-models/:customModelId",
  fields: [
    { path: "PathVars.customModelId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOM_MODEL_LIST_CONTRACT = {
  name: "CustomModelList",
  method: "GET",
  route: "/public/v1/custom-models",
  fields: [

  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOM_MODEL_UPDATE_CONTRACT = {
  name: "CustomModelUpdate",
  method: "PATCH",
  route: "/public/v1/custom-models/:customModelId",
  fields: [
    { path: "PathVars.customModelId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.displayName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.modelName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.baseUrl", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.protocol", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["openai"] },
    { path: "Body.apiKey", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.enabled", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
