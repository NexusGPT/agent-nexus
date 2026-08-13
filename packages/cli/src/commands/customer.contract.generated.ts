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
// `customer.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

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
