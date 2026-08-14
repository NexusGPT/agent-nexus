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
// `agent-tool.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const TOOL_CREATE__BODY_TYPE = {
  path: "ToolCreate.Body.type",
  contractValues: [
    "WORKFLOW",
    "PLUGIN",
    "TASK",
    "COLLECTION",
    "DOCUMENT_TEMPLATE"
  ]
} as const satisfies ContractEnum;

export const TOOL_UPDATE__BODY_TYPE = {
  path: "ToolUpdate.Body.type",
  contractValues: [
    "WORKFLOW",
    "PLUGIN",
    "TASK",
    "COLLECTION",
    "DOCUMENT_TEMPLATE"
  ]
} as const satisfies ContractEnum;

export const TOOL_ATTACH_COLLECTION_CONTRACT = {
  name: "ToolAttachCollection",
  method: "POST",
  route: "/public/v1/agents/:agentId/tools/attach-collection",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.collectionId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.label", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.instructions", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TOOL_CREATE_CONTRACT = {
  name: "ToolCreate",
  method: "POST",
  route: "/public/v1/agents/:agentId/tools",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.label", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.iconUrl", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.iconType", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.type", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["WORKFLOW", "PLUGIN", "TASK", "COLLECTION", "DOCUMENT_TEMPLATE"] },
    { path: "Body.agentInputSchema", slot: "Body", type: "object", required: true, depth: 0, opaque: true },
    { path: "Body.config", slot: "Body", type: "object", required: true, depth: 0 },
    { path: "Body.config.toolId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.workflowId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.collectionId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.action", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.toolCredentialId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.instructions", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.parameters", slot: "Body", type: "object", required: false, depth: 1, opaque: true },
    { path: "Body.isActive", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.fireAndForget", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TOOL_DELETE_CONTRACT = {
  name: "ToolDelete",
  method: "DELETE",
  route: "/public/v1/agents/:agentId/tools/:toolId",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.toolId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TOOL_GET_CONTRACT = {
  name: "ToolGet",
  method: "GET",
  route: "/public/v1/agents/:agentId/tools/:toolId",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.toolId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TOOL_LIST_CONTRACT = {
  name: "ToolList",
  method: "GET",
  route: "/public/v1/agents/:agentId/tools",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TOOL_UPDATE_CONTRACT = {
  name: "ToolUpdate",
  method: "PATCH",
  route: "/public/v1/agents/:agentId/tools/:toolId",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.toolId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.label", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.iconUrl", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.iconType", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.type", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["WORKFLOW", "PLUGIN", "TASK", "COLLECTION", "DOCUMENT_TEMPLATE"] },
    { path: "Body.agentInputSchema", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.config", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.config.toolId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.workflowId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.collectionId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.action", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.toolCredentialId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.instructions", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.config.parameters", slot: "Body", type: "object", required: false, depth: 1, opaque: true },
    { path: "Body.isActive", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.fireAndForget", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
