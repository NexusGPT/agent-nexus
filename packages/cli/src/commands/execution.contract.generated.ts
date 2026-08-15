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
// `execution.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const WORKFLOW_EXECUTION_LIST__PARAMS_STATUS = {
  path: "WorkflowExecutionList.Params.status",
  contractValues: [
    "PENDING",
    "RUNNING",
    "COMPLETED",
    "FAILED",
    "CANCELLED"
  ]
} as const satisfies ContractEnum;

export const WORKFLOW_EXECUTION_LIST__PARAMS_SORT_BY = {
  path: "WorkflowExecutionList.Params.sortBy",
  contractValues: [
    "createdAt",
    "status"
  ]
} as const satisfies ContractEnum;

export const WORKFLOW_EXECUTION_LIST__PARAMS_ORDER = {
  path: "WorkflowExecutionList.Params.order",
  contractValues: [
    "asc",
    "desc"
  ]
} as const satisfies ContractEnum;

export const WORKFLOW_EXECUTION_CANCEL_CONTRACT = {
  name: "WorkflowExecutionCancel",
  method: "POST",
  route: "/public/v1/workflows/executions/:executionId/cancel",
  fields: [
    { path: "PathVars.executionId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_EXECUTION_DIAGNOSE_CONTRACT = {
  name: "WorkflowExecutionDiagnose",
  method: "GET",
  route: "/public/v1/workflows/executions/:executionId/diagnose",
  fields: [
    { path: "PathVars.executionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.verbose", slot: "Params", type: "unknown", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_EXECUTION_EXPORT_CONTRACT = {
  name: "WorkflowExecutionExport",
  method: "POST",
  route: "/public/v1/workflows/executions/:executionId/export",
  fields: [
    { path: "PathVars.executionId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_EXECUTION_GET_CONTRACT = {
  name: "WorkflowExecutionGet",
  method: "GET",
  route: "/public/v1/workflows/executions/:executionId",
  fields: [
    { path: "PathVars.executionId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_EXECUTION_GET_NODE_RESULT_CONTRACT = {
  name: "WorkflowExecutionGetNodeResult",
  method: "GET",
  route: "/public/v1/workflows/executions/:executionId/nodes/:nodeId",
  fields: [
    { path: "PathVars.executionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.nodeId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_EXECUTION_GET_OUTPUT_CONTRACT = {
  name: "WorkflowExecutionGetOutput",
  method: "GET",
  route: "/public/v1/workflows/executions/:executionId/output",
  fields: [
    { path: "PathVars.executionId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_EXECUTION_LIST_CONTRACT = {
  name: "WorkflowExecutionList",
  method: "GET",
  route: "/public/v1/workflows/executions",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.workflowId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"] },
    { path: "Params.startDate", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.endDate", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.sortBy", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["createdAt", "status"] },
    { path: "Params.order", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["asc", "desc"] },
    { path: "Params.includeChildExecutions", slot: "Params", type: "unknown", required: false, depth: 0 },
    { path: "Params.includeTestRuns", slot: "Params", type: "unknown", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_EXECUTION_POLL_CONTRACT = {
  name: "WorkflowExecutionPoll",
  method: "GET",
  route: "/public/v1/workflows/executions/:executionId/poll",
  fields: [
    { path: "PathVars.executionId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const WORKFLOW_EXECUTION_RETRY_NODE_CONTRACT = {
  name: "WorkflowExecutionRetryNode",
  method: "POST",
  route: "/public/v1/workflows/executions/:executionId/nodes/:nodeId/retry",
  fields: [
    { path: "PathVars.executionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.nodeId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
