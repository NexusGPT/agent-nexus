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
// `prompt.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const PROMPT_VARIANT_LIST__PARAMS_INCLUDE_ARCHIVED = {
  path: "PromptVariantList.Params.includeArchived",
  contractValues: [
    "true",
    "false"
  ]
} as const satisfies ContractEnum;

export const PROMPT_COMPARE_CONTRACT = {
  name: "PromptCompare",
  method: "GET",
  route: "/public/v1/agents/:agentId/prompt-compare",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.a", slot: "Params", type: "string", required: true, depth: 0 },
    { path: "Params.b", slot: "Params", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_GRAPH_CONTRACT = {
  name: "PromptGraph",
  method: "GET",
  route: "/public/v1/agents/:agentId/prompt-graph",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_VARIANT_ARCHIVE_CONTRACT = {
  name: "PromptVariantArchive",
  method: "DELETE",
  route: "/public/v1/agents/:agentId/prompt-variants/:variantRef",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.variantRef", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_VARIANT_CREATE_CONTRACT = {
  name: "PromptVariantCreate",
  method: "POST",
  route: "/public/v1/agents/:agentId/prompt-variants",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.fromVersionId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_VARIANT_LIST_CONTRACT = {
  name: "PromptVariantList",
  method: "GET",
  route: "/public/v1/agents/:agentId/prompt-variants",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.includeArchived", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["true", "false"] }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_VARIANT_PROMOTE_CONTRACT = {
  name: "PromptVariantPromote",
  method: "POST",
  route: "/public/v1/agents/:agentId/prompt-variants/:variantRef/promote",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.variantRef", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.publish", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_VARIANT_RENAME_CONTRACT = {
  name: "PromptVariantRename",
  method: "PATCH",
  route: "/public/v1/agents/:agentId/prompt-variants/:variantRef",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.variantRef", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_VARIANT_SAVE_VERSION_CONTRACT = {
  name: "PromptVariantSaveVersion",
  method: "POST",
  route: "/public/v1/agents/:agentId/prompt-variants/:variantRef/versions",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.variantRef", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.prompt", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_VARIANT_VERSION_LIST_CONTRACT = {
  name: "PromptVariantVersionList",
  method: "GET",
  route: "/public/v1/agents/:agentId/prompt-variants/:variantRef/versions",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.variantRef", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
