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
// `execution.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

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
