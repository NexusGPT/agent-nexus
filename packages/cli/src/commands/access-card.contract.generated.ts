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
// `access-card.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const ACCESS_CARD_CREATE__BODY_VARIABLES_ITEM_TYPE = {
  path: "AccessCardCreate.Body.variables[].type",
  contractValues: [
    "string",
    "number",
    "boolean",
    "object",
    "array"
  ]
} as const satisfies ContractEnum;

export const ACCESS_CARD_CREATE__BODY_VARIABLES_ITEM_CONSTRAINT_FORMAT = {
  path: "AccessCardCreate.Body.variables[].constraint.format",
  contractValues: [
    "email",
    "uri",
    "uuid",
    "date-time",
    "e164"
  ]
} as const satisfies ContractEnum;

export const ACCESS_CARD_UPDATE__BODY_VARIABLES_ITEM_TYPE = {
  path: "AccessCardUpdate.Body.variables[].type",
  contractValues: [
    "string",
    "number",
    "boolean",
    "object",
    "array"
  ]
} as const satisfies ContractEnum;

export const ACCESS_CARD_UPDATE__BODY_VARIABLES_ITEM_CONSTRAINT_FORMAT = {
  path: "AccessCardUpdate.Body.variables[].constraint.format",
  contractValues: [
    "email",
    "uri",
    "uuid",
    "date-time",
    "e164"
  ]
} as const satisfies ContractEnum;

export const ACCESS_CARD_CREATE_CONTRACT = {
  name: "AccessCardCreate",
  method: "POST",
  route: "/public/v1/credentials/:credentialId/cards",
  fields: [
    { path: "PathVars.credentialId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.policies", slot: "Body", type: "object", required: true, depth: 0, opaque: true },
    { path: "Body.variables", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.variables[].name", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.variables[].title", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.variables[].type", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["string", "number", "boolean", "object", "array"] },
    { path: "Body.variables[].description", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.variables[].required", slot: "Body", type: "boolean", required: false, depth: 1 },
    { path: "Body.variables[].constraint", slot: "Body", type: "object", required: false, depth: 1 },
    { path: "Body.variables[].constraint.pattern", slot: "Body", type: "string", required: false, depth: 2 },
    { path: "Body.variables[].constraint.enum", slot: "Body", type: "array", required: false, depth: 2 },
    { path: "Body.variables[].constraint.maxLength", slot: "Body", type: "integer", required: false, depth: 2 },
    { path: "Body.variables[].constraint.format", slot: "Body", type: "string", required: false, depth: 2, enumValues: ["email", "uri", "uuid", "date-time", "e164"] },
    { path: "Body.color", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const ACCESS_CARD_UPDATE_CONTRACT = {
  name: "AccessCardUpdate",
  method: "PATCH",
  route: "/public/v1/access-cards/:accessCardId",
  fields: [
    { path: "PathVars.accessCardId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.policies", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.variables", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.variables[].name", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.variables[].title", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.variables[].type", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["string", "number", "boolean", "object", "array"] },
    { path: "Body.variables[].description", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.variables[].required", slot: "Body", type: "boolean", required: false, depth: 1 },
    { path: "Body.variables[].constraint", slot: "Body", type: "object", required: false, depth: 1 },
    { path: "Body.variables[].constraint.pattern", slot: "Body", type: "string", required: false, depth: 2 },
    { path: "Body.variables[].constraint.enum", slot: "Body", type: "array", required: false, depth: 2 },
    { path: "Body.variables[].constraint.maxLength", slot: "Body", type: "integer", required: false, depth: 2 },
    { path: "Body.variables[].constraint.format", slot: "Body", type: "string", required: false, depth: 2, enumValues: ["email", "uri", "uuid", "date-time", "e164"] },
    { path: "Body.color", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
