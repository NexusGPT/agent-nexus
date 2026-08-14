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
// `conversation.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const CONVERSATION_GET__PARAMS_SATISFACTION = {
  path: "ConversationGet.Params.satisfaction",
  contractValues: [
    "latest",
    "all",
    "summary"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_LIST__PARAMS_STATUS = {
  path: "ConversationList.Params.status",
  contractValues: [
    "OPEN",
    "RUNNING",
    "ARCHIVED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_LIST__PARAMS_TICKET_STATUS = {
  path: "ConversationList.Params.ticketStatus",
  contractValues: [
    "SUBMITTED",
    "IN_PROGRESS",
    "WAITING_ON_CUSTOMER",
    "RESOLVED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_LIST__PARAMS_TICKET_STATUS_IN_ITEM = {
  path: "ConversationList.Params.ticketStatusIn[]",
  contractValues: [
    "SUBMITTED",
    "IN_PROGRESS",
    "WAITING_ON_CUSTOMER",
    "RESOLVED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_LIST__PARAMS_TICKET_STATUS_NOT = {
  path: "ConversationList.Params.ticketStatusNot",
  contractValues: [
    "SUBMITTED",
    "IN_PROGRESS",
    "WAITING_ON_CUSTOMER",
    "RESOLVED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_LIST__PARAMS_RESPONSE_HANDLING = {
  path: "ConversationList.Params.responseHandling",
  contractValues: [
    "AUTO",
    "ON_APPROVAL",
    "MANUAL"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_LIST__PARAMS_ASSIGNED_TO = {
  path: "ConversationList.Params.assignedTo",
  contractValues: [
    "me",
    "none"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_LIST__PARAMS_LAST_MESSAGE_TYPE_IN_ITEM = {
  path: "ConversationList.Params.lastMessageTypeIn[]",
  contractValues: [
    "USER",
    "AGENT",
    "SYSTEM"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_UPDATE_STATUSES__BODY_STATUS = {
  path: "ConversationUpdateStatuses.Body.status",
  contractValues: [
    "OPEN",
    "RUNNING",
    "ARCHIVED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_UPDATE_STATUSES__BODY_TICKET_STATUS = {
  path: "ConversationUpdateStatuses.Body.ticketStatus",
  contractValues: [
    "SUBMITTED",
    "IN_PROGRESS",
    "WAITING_ON_CUSTOMER",
    "RESOLVED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_UPDATE_STATUSES__BODY_RESPONSE_HANDLING = {
  path: "ConversationUpdateStatuses.Body.responseHandling",
  contractValues: [
    "AUTO",
    "ON_APPROVAL",
    "MANUAL"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_GET_CONTRACT = {
  name: "ConversationGet",
  method: "GET",
  route: "/public/v1/conversations/:conversationId",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "unknown", required: true, depth: 0 },
    { path: "Params.satisfaction", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["latest", "all", "summary"] }
  ]
} as const satisfies ProjectedDescriptor;

export const CONVERSATION_LIST_CONTRACT = {
  name: "ConversationList",
  method: "GET",
  route: "/public/v1/conversations",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["OPEN", "RUNNING", "ARCHIVED"] },
    { path: "Params.ticketStatus", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["SUBMITTED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED"] },
    { path: "Params.ticketStatusIn", slot: "Params", type: "array", required: false, depth: 0 },
    { path: "Params.ticketStatusIn[]", slot: "Params", type: "string", required: true, depth: 1, enumValues: ["SUBMITTED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED"] },
    { path: "Params.ticketStatusNot", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["SUBMITTED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED"] },
    { path: "Params.responseHandling", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["AUTO", "ON_APPROVAL", "MANUAL"] },
    { path: "Params.deploymentId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.assignedTo", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["me", "none"] },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.lastMessageBefore", slot: "Params", type: "unknown", required: false, depth: 0 },
    { path: "Params.lastMessageAfter", slot: "Params", type: "unknown", required: false, depth: 0 },
    { path: "Params.lastMessageTypeIn", slot: "Params", type: "array", required: false, depth: 0 },
    { path: "Params.lastMessageTypeIn[]", slot: "Params", type: "string", required: true, depth: 1, enumValues: ["USER", "AGENT", "SYSTEM"] },
    { path: "Params.commentContains", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.commentNotContains", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CONVERSATION_UPDATE_STATUSES_CONTRACT = {
  name: "ConversationUpdateStatuses",
  method: "PATCH",
  route: "/public/v1/conversations/:conversationId/statuses",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "unknown", required: true, depth: 0 },
    { path: "Body.status", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["OPEN", "RUNNING", "ARCHIVED"] },
    { path: "Body.ticketStatus", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["SUBMITTED", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED"] },
    { path: "Body.responseHandling", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["AUTO", "ON_APPROVAL", "MANUAL"] }
  ]
} as const satisfies ProjectedDescriptor;
