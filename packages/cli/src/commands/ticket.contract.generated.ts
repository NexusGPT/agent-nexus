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
// `ticket.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const TICKET_CREATE__BODY_TYPE = {
  path: "TicketCreate.Body.type",
  contractValues: [
    "BUG",
    "FEATURE_REQUEST",
    "IMPROVEMENT"
  ]
} as const satisfies ContractEnum;

export const TICKET_CREATE__BODY_PRIORITY = {
  path: "TicketCreate.Body.priority",
  contractValues: [
    "NONE",
    "URGENT",
    "HIGH",
    "MEDIUM",
    "LOW"
  ]
} as const satisfies ContractEnum;

export const TICKET_LIST__PARAMS_TYPE = {
  path: "TicketList.Params.type",
  contractValues: [
    "BUG",
    "FEATURE_REQUEST",
    "IMPROVEMENT"
  ]
} as const satisfies ContractEnum;

export const TICKET_LIST__PARAMS_PRIORITY = {
  path: "TicketList.Params.priority",
  contractValues: [
    "NONE",
    "URGENT",
    "HIGH",
    "MEDIUM",
    "LOW"
  ]
} as const satisfies ContractEnum;

export const TICKET_UPDATE__BODY_TYPE = {
  path: "TicketUpdate.Body.type",
  contractValues: [
    "BUG",
    "FEATURE_REQUEST",
    "IMPROVEMENT"
  ]
} as const satisfies ContractEnum;

export const TICKET_UPDATE__BODY_PRIORITY = {
  path: "TicketUpdate.Body.priority",
  contractValues: [
    "NONE",
    "URGENT",
    "HIGH",
    "MEDIUM",
    "LOW"
  ]
} as const satisfies ContractEnum;

export const TICKET_CREATE_CONTRACT = {
  name: "TicketCreate",
  method: "POST",
  route: "/public/v1/tickets",
  fields: [
    { path: "Body.title", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.type", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["BUG", "FEATURE_REQUEST", "IMPROVEMENT"] },
    { path: "Body.priority", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["NONE", "URGENT", "HIGH", "MEDIUM", "LOW"] },
    { path: "Body.context", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.context.endpoint", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.method", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.statusCode", slot: "Body", type: "integer", required: false, depth: 1 },
    { path: "Body.context.errorCode", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.requestBody", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.responseBody", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.reproductionSteps", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.expectedBehavior", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.actualBehavior", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.environment", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.sdkVersion", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.context.agentId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.labels", slot: "Body", type: "array", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TICKET_LIST_CONTRACT = {
  name: "TicketList",
  method: "GET",
  route: "/public/v1/tickets",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.type", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["BUG", "FEATURE_REQUEST", "IMPROVEMENT"] },
    { path: "Params.priority", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["NONE", "URGENT", "HIGH", "MEDIUM", "LOW"] },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TICKET_UPDATE_CONTRACT = {
  name: "TicketUpdate",
  method: "PATCH",
  route: "/public/v1/tickets/:ticketId",
  fields: [
    { path: "PathVars.ticketId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.title", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.type", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["BUG", "FEATURE_REQUEST", "IMPROVEMENT"] },
    { path: "Body.priority", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["NONE", "URGENT", "HIGH", "MEDIUM", "LOW"] },
    { path: "Body.status", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.labels", slot: "Body", type: "array", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
