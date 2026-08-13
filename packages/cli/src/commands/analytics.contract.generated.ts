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
// `analytics.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const ANALYTICS_EXPORT__PARAMS_TIME_PERIOD = {
  path: "AnalyticsExport.Params.timePeriod",
  contractValues: [
    "last_24_hours",
    "last_7_days",
    "last_30_days",
    "last_90_days",
    "last_12_months",
    "all_time"
  ]
} as const satisfies ContractEnum;

export const ANALYTICS_FEEDBACK__PARAMS_TIME_PERIOD = {
  path: "AnalyticsFeedback.Params.timePeriod",
  contractValues: [
    "last_24_hours",
    "last_7_days",
    "last_30_days",
    "last_90_days",
    "last_12_months",
    "all_time"
  ]
} as const satisfies ContractEnum;

export const ANALYTICS_OVERVIEW__PARAMS_TIME_PERIOD = {
  path: "AnalyticsOverview.Params.timePeriod",
  contractValues: [
    "last_24_hours",
    "last_7_days",
    "last_30_days",
    "last_90_days",
    "last_12_months",
    "all_time"
  ]
} as const satisfies ContractEnum;

export const ANALYTICS_QUERY_STRUCTURED__BODY_VIEW = {
  path: "AnalyticsQueryStructured.Body.view",
  contractValues: [
    "generations",
    "traces",
    "conversations",
    "messages",
    "executions",
    "node_runs",
    "scores",
    "score_events"
  ]
} as const satisfies ContractEnum;

export const ANALYTICS_QUERY_STRUCTURED__BODY_FILTERS_ITEM_OP = {
  path: "AnalyticsQueryStructured.Body.filters[].op",
  contractValues: [
    "eq",
    "neq",
    "in",
    "gt",
    "gte",
    "lt",
    "lte"
  ]
} as const satisfies ContractEnum;

export const ANALYTICS_QUERY_STRUCTURED__BODY_GRANULARITY = {
  path: "AnalyticsQueryStructured.Body.granularity",
  contractValues: [
    "hour",
    "day",
    "week",
    "month"
  ]
} as const satisfies ContractEnum;

export const ANALYTICS_QUERY_STRUCTURED__BODY_PERIOD = {
  path: "AnalyticsQueryStructured.Body.period",
  contractValues: [
    "last_24_hours",
    "last_7_days",
    "last_30_days",
    "last_90_days",
    "last_12_months",
    "all_time"
  ]
} as const satisfies ContractEnum;

export const ANALYTICS_QUERY_STRUCTURED__BODY_ORDER = {
  path: "AnalyticsQueryStructured.Body.order",
  contractValues: [
    "asc",
    "desc"
  ]
} as const satisfies ContractEnum;

export const ANALYTICS_EXPORT_CONTRACT = {
  name: "AnalyticsExport",
  method: "GET",
  route: "/public/v1/analytics/export",
  fields: [
    { path: "Params.timePeriod", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["last_24_hours", "last_7_days", "last_30_days", "last_90_days", "last_12_months", "all_time"] },
    { path: "Params.deploymentId", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ANALYTICS_FEEDBACK_CONTRACT = {
  name: "AnalyticsFeedback",
  method: "GET",
  route: "/public/v1/analytics/feedback",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.timePeriod", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["last_24_hours", "last_7_days", "last_30_days", "last_90_days", "last_12_months", "all_time"] },
    { path: "Params.deploymentId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.score", slot: "Params", type: "number", required: false, depth: 0 },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ANALYTICS_OVERVIEW_CONTRACT = {
  name: "AnalyticsOverview",
  method: "GET",
  route: "/public/v1/analytics/overview",
  fields: [
    { path: "Params.timePeriod", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["last_24_hours", "last_7_days", "last_30_days", "last_90_days", "last_12_months", "all_time"] },
    { path: "Params.deploymentId", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ANALYTICS_QUERY_CONTRACT = {
  name: "AnalyticsQuery",
  method: "POST",
  route: "/public/v1/analytics/query",
  fields: [
    { path: "Body.query", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ANALYTICS_QUERY_STRUCTURED_CONTRACT = {
  name: "AnalyticsQueryStructured",
  method: "POST",
  route: "/public/v1/analytics/query/structured",
  fields: [
    { path: "Body.view", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["generations", "traces", "conversations", "messages", "executions", "node_runs", "scores", "score_events"] },
    { path: "Body.metrics", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.groupBy", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.filters", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.filters[].field", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.filters[].op", slot: "Body", type: "string", required: true, depth: 1, enumValues: ["eq", "neq", "in", "gt", "gte", "lt", "lte"] },
    { path: "Body.filters[].value", slot: "Body", type: "unknown", required: true, depth: 1 },
    { path: "Body.granularity", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["hour", "day", "week", "month"] },
    { path: "Body.period", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["last_24_hours", "last_7_days", "last_30_days", "last_90_days", "last_12_months", "all_time"] },
    { path: "Body.limit", slot: "Body", type: "integer", required: false, depth: 0 },
    { path: "Body.orderBy", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.order", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["asc", "desc"] }
  ]
} as const satisfies ProjectedDescriptor;
