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
// `tracing.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const TRACING_ANALYTICS_TIMELINE__PARAMS_GRANULARITY = {
  path: "TracingAnalyticsTimeline.Params.granularity",
  contractValues: [
    "hour",
    "day",
    "week"
  ]
} as const satisfies ContractEnum;

export const TRACING_EXPORT_BULK__BODY_FORMAT = {
  path: "TracingExportBulk.Body.format",
  contractValues: [
    "json",
    "csv"
  ]
} as const satisfies ContractEnum;

export const TRACING_EXPORT_BULK__BODY_STATUS = {
  path: "TracingExportBulk.Body.status",
  contractValues: [
    "IN_PROGRESS",
    "COMPLETED",
    "FAILED"
  ]
} as const satisfies ContractEnum;

export const TRACING_EXPORT_TRACE__BODY_FORMAT = {
  path: "TracingExportTrace.Body.format",
  contractValues: [
    "json",
    "csv"
  ]
} as const satisfies ContractEnum;

export const TRACING_ANALYTICS_TIMELINE_CONTRACT = {
  name: "TracingAnalyticsTimeline",
  method: "GET",
  route: "/public/v1/tracing/analytics/timeline",
  fields: [
    { path: "Params.startDate", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.endDate", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.granularity", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["hour", "day", "week"] }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACING_EXPORT_BULK_CONTRACT = {
  name: "TracingExportBulk",
  method: "POST",
  route: "/public/v1/tracing/export",
  fields: [
    { path: "Body.format", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["json", "csv"] },
    { path: "Body.status", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["IN_PROGRESS", "COMPLETED", "FAILED"] },
    { path: "Body.agentId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.workflowId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.startDate", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.endDate", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.limit", slot: "Body", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACING_EXPORT_TRACE_CONTRACT = {
  name: "TracingExportTrace",
  method: "POST",
  route: "/public/v1/tracing/traces/:traceId/export",
  fields: [
    { path: "PathVars.traceId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.format", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["json", "csv"] }
  ]
} as const satisfies ProjectedDescriptor;
