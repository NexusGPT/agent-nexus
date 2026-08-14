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
// `tool.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const TOOL_DISCOVERY_SEARCH__PARAMS_TYPE = {
  path: "ToolDiscoverySearch.Params.type",
  contractValues: [
    "TASK",
    "INTERNAL_TOOL",
    "COLLECTION",
    "EXTERNAL_TOOL",
    "FLOW",
    "WORKFLOW",
    "IMAGE_GENERATION",
    "WHATSAPP",
    "PIPEDREAM",
    "PLUGIN",
    "END_CONVERSATION",
    "DOCUMENT_TEMPLATE"
  ]
} as const satisfies ContractEnum;

export const TOOL_DISCOVERY_SKILLS__PARAMS_TYPE = {
  path: "ToolDiscoverySkills.Params.type",
  contractValues: [
    "TASK",
    "WORKFLOW",
    "COLLECTION"
  ]
} as const satisfies ContractEnum;

export const TOOL_DISCOVERY_SEARCH_CONTRACT = {
  name: "ToolDiscoverySearch",
  method: "GET",
  route: "/public/v1/tools/search",
  fields: [
    { path: "Params.q", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.category", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.type", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["TASK", "INTERNAL_TOOL", "COLLECTION", "EXTERNAL_TOOL", "FLOW", "WORKFLOW", "IMAGE_GENERATION", "WHATSAPP", "PIPEDREAM", "PLUGIN", "END_CONVERSATION", "DOCUMENT_TEMPLATE"] },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.offset", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TOOL_DISCOVERY_SKILLS_CONTRACT = {
  name: "ToolDiscoverySkills",
  method: "GET",
  route: "/public/v1/tools/skills",
  fields: [
    { path: "Params.type", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["TASK", "WORKFLOW", "COLLECTION"] },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.offset", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
