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
// `credential.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const CREDENTIAL_LIST__PARAMS_SOURCE = {
  path: "CredentialList.Params.source",
  contractValues: [
    "oauth_connection",
    "api_key_connection",
    "tool_credential"
  ]
} as const satisfies ContractEnum;

export const CREDENTIAL_LIST__PARAMS_STATUS = {
  path: "CredentialList.Params.status",
  contractValues: [
    "CONNECTED",
    "EXPIRING_SOON",
    "NEEDS_REAUTH",
    "DISCONNECTED"
  ]
} as const satisfies ContractEnum;

export const CREDENTIAL_LIST__PARAMS_SORT_BY = {
  path: "CredentialList.Params.sortBy",
  contractValues: [
    "name",
    "service",
    "status",
    "createdAt"
  ]
} as const satisfies ContractEnum;

export const CREDENTIAL_LIST__PARAMS_SORT_ORDER = {
  path: "CredentialList.Params.sortOrder",
  contractValues: [
    "asc",
    "desc"
  ]
} as const satisfies ContractEnum;

export const CREDENTIAL_LIST_CONTRACT = {
  name: "CredentialList",
  method: "GET",
  route: "/public/v1/credentials",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.source", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["oauth_connection", "api_key_connection", "tool_credential"] },
    { path: "Params.service", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["CONNECTED", "EXPIRING_SOON", "NEEDS_REAUTH", "DISCONNECTED"] },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.sortBy", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["name", "service", "status", "createdAt"] },
    { path: "Params.sortOrder", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["asc", "desc"] }
  ]
} as const satisfies ProjectedDescriptor;
