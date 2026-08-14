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
// `phone-number.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const PHONE_NUMBER_SEARCH_AVAILABLE__PARAMS_TYPE = {
  path: "PhoneNumberSearchAvailable.Params.type",
  contractValues: [
    "mobile",
    "local"
  ]
} as const satisfies ContractEnum;

export const PHONE_NUMBER_SEARCH_AVAILABLE_CONTRACT = {
  name: "PhoneNumberSearchAvailable",
  method: "GET",
  route: "/public/v1/phone-numbers/available",
  fields: [
    { path: "Params.country", slot: "Params", type: "string", required: true, depth: 0 },
    { path: "Params.areaCode", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.type", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["mobile", "local"] },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.sms", slot: "Params", type: "boolean", required: true, depth: 0 },
    { path: "Params.mms", slot: "Params", type: "boolean", required: true, depth: 0 },
    { path: "Params.voice", slot: "Params", type: "boolean", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
