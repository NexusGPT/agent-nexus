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
// `customer.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const CUSTOMER_LIST__PARAMS_SORT_BY = {
  path: "CustomerList.Params.sortBy",
  contractValues: [
    "lastSeenAt",
    "totalMessages",
    "createdAt",
    "displayName",
    "totalSessions",
    "primaryEmail",
    "firstSeenAt"
  ]
} as const satisfies ContractEnum;

export const CUSTOMER_LIST__PARAMS_SORT_ORDER = {
  path: "CustomerList.Params.sortOrder",
  contractValues: [
    "asc",
    "desc"
  ]
} as const satisfies ContractEnum;

export const CUSTOMER_LIST__PARAMS_CHANNEL = {
  path: "CustomerList.Params.channel",
  contractValues: [
    "GMAIL",
    "OUTLOOK",
    "IMAP",
    "SMTP",
    "SLACK",
    "TEAMS",
    "TELEGRAM",
    "FB_MESSENGER",
    "INSTAGRAM",
    "WHATSAPP",
    "TWILIO_SMS",
    "TWILIO_VOICE",
    "GOOGLE_SHEETS",
    "EXCEL_ADDIN",
    "OUTLOOK_ADDIN",
    "POWERPOINT_ADDIN",
    "WORD_ADDIN",
    "AIRTABLE",
    "GOOGLE_MEET",
    "ZOOM",
    "EMBED",
    "API"
  ]
} as const satisfies ContractEnum;

export const CUSTOMER_ADD_NOTE_CONTRACT = {
  name: "CustomerAddNote",
  method: "POST",
  route: "/public/v1/customers/:id/notes",
  fields: [
    { path: "PathVars.id", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.content", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOMER_CREATE_CONTRACT = {
  name: "CustomerCreate",
  method: "POST",
  route: "/public/v1/customers",
  fields: [
    { path: "Body.displayName", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.externalUserId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.primaryEmail", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.primaryPhone", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.tags", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.customFields", slot: "Body", type: "object", required: false, depth: 0, opaque: true }
  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOMER_DELETE_CONTRACT = {
  name: "CustomerDelete",
  method: "DELETE",
  route: "/public/v1/customers/:id",
  fields: [
    { path: "PathVars.id", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOMER_GET_CONTRACT = {
  name: "CustomerGet",
  method: "GET",
  route: "/public/v1/customers/:id",
  fields: [
    { path: "PathVars.id", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOMER_GET_BY_EXTERNAL_ID_CONTRACT = {
  name: "CustomerGetByExternalId",
  method: "GET",
  route: "/public/v1/customers/by-external-id/:externalUserId",
  fields: [
    { path: "PathVars.externalUserId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOMER_LIST_CONTRACT = {
  name: "CustomerList",
  method: "GET",
  route: "/public/v1/customers",
  fields: [
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.sortBy", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["lastSeenAt", "totalMessages", "createdAt", "displayName", "totalSessions", "primaryEmail", "firstSeenAt"] },
    { path: "Params.sortOrder", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["asc", "desc"] },
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.channel", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["GMAIL", "OUTLOOK", "IMAP", "SMTP", "SLACK", "TEAMS", "TELEGRAM", "FB_MESSENGER", "INSTAGRAM", "WHATSAPP", "TWILIO_SMS", "TWILIO_VOICE", "GOOGLE_SHEETS", "EXCEL_ADDIN", "OUTLOOK_ADDIN", "POWERPOINT_ADDIN", "WORD_ADDIN", "AIRTABLE", "GOOGLE_MEET", "ZOOM", "EMBED", "API"] },
    { path: "Params.tag", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUSTOMER_UPDATE_CONTRACT = {
  name: "CustomerUpdate",
  method: "PATCH",
  route: "/public/v1/customers/:id",
  fields: [
    { path: "PathVars.id", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.displayName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.externalUserId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.primaryEmail", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.primaryPhone", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.avatarUrl", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.tags", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.customFields", slot: "Body", type: "object", required: false, depth: 0, opaque: true }
  ]
} as const satisfies ProjectedDescriptor;
