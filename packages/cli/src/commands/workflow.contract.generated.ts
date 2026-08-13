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
// `workflow.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

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
