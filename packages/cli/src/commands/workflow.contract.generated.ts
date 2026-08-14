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
// `workflow.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const WORKFLOW_BATCH_EXECUTE__BODY_EDGES_ITEM_TYPE = {
  path: "WorkflowBatchExecute.Body.edges[].type",
  contractValues: [
    "main",
    "rewind"
  ]
} as const satisfies ContractEnum;

export const WORKFLOW_BATCH_EXECUTE__BODY_TRIGGER_TYPE = {
  path: "WorkflowBatchExecute.Body.triggerType",
  contractValues: [
    "webhookTrigger",
    "agentInputTrigger",
    "scheduleTrigger",
    "pluginTrigger",
    "manualTrigger",
    "platformListenerTrigger"
  ]
} as const satisfies ContractEnum;

export const WORKFLOW_EDGE_CREATE__BODY_TYPE = {
  path: "WorkflowEdgeCreate.Body.type",
  contractValues: [
    "main",
    "rewind"
  ]
} as const satisfies ContractEnum;

export const WORKFLOW_LIST__PARAMS_STATUS = {
  path: "WorkflowList.Params.status",
  contractValues: [
    "DRAFT",
    "PUBLISHED",
    "ARCHIVED"
  ]
} as const satisfies ContractEnum;

export const WORKFLOW_NODE_REPLACE_TRIGGER__BODY_TYPE = {
  path: "WorkflowNodeReplaceTrigger.Body.type",
  contractValues: [
    "webhookTrigger",
    "agentInputTrigger",
    "scheduleTrigger",
    "pluginTrigger",
    "manualTrigger",
    "platformListenerTrigger"
  ]
} as const satisfies ContractEnum;

export const WORKFLOW_BATCH_EXECUTE_CONTRACT = {
  name: "WorkflowBatchExecute",
  method: "POST",
  route: "/public/v1/workflows/:workflowId/batch",
  fields: [
    { path: "PathVars.workflowId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.nodes", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.nodes[].ref", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.nodes[].type", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.nodes[].label", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.nodes[].data", slot: "Body", type: "object", required: false, depth: 1, opaque: true },
    { path: "Body.nodes[].parentId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.nodes[].branches", slot: "Body", type: "array", required: false, depth: 1 },
    { path: "Body.nodes[].branches[].ref", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.nodes[].branches[].name", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.nodes[].branches[].description", slot: "Body", type: "string", required: false, depth: 2 },
    { path: "Body.edges", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.edges[].source", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.edges[].target", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.edges[].sourceHandle", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.edges[].type", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["main", "rewind"] },
    { path: "Body.deleteEdges", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.triggerType", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["webhookTrigger", "agentInputTrigger", "scheduleTrigger", "pluginTrigger", "manualTrigger", "platformListenerTrigger"] }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_EDGE_CREATE_CONTRACT = {
  name: "WorkflowEdgeCreate",
  method: "POST",
  route: "/public/v1/workflows/:workflowId/edges",
  fields: [
    { path: "PathVars.workflowId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.source", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.target", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.sourceHandle", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.type", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["main", "rewind"] }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_LIST_CONTRACT = {
  name: "WorkflowList",
  method: "GET",
  route: "/public/v1/workflows",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["DRAFT", "PUBLISHED", "ARCHIVED"] },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.folder", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_NODE_REPLACE_TRIGGER_CONTRACT = {
  name: "WorkflowNodeReplaceTrigger",
  method: "PUT",
  route: "/public/v1/workflows/:workflowId/trigger",
  fields: [
    { path: "PathVars.workflowId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.type", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["webhookTrigger", "agentInputTrigger", "scheduleTrigger", "pluginTrigger", "manualTrigger", "platformListenerTrigger"] }
  ]
} as const satisfies ProjectedDescriptor;
