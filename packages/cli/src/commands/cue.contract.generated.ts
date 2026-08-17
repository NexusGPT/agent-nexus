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
// `cue.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const CUE_TRANSCRIPTS_EXPORT__PARAMS_FORMAT = {
  path: "CueTranscriptsExport.Params.format",
  contractValues: [
    "ndjson",
    "json"
  ]
} as const satisfies ContractEnum;

export const CUE_TRANSCRIPTS_EXPORT_CONTRACT = {
  name: "CueTranscriptsExport",
  method: "GET",
  route: "/public/v1/cue/transcripts/export",
  fields: [
    { path: "Params.startDate", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.endDate", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.format", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["ndjson", "json"] },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUE_TRANSCRIPTS_GET_TRANSCRIPT_CONTRACT = {
  name: "CueTranscriptsGetTranscript",
  method: "GET",
  route: "/public/v1/cue/conversations/:conversationId/transcript",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CUE_TRANSCRIPTS_LIST_CONVERSATIONS_CONTRACT = {
  name: "CueTranscriptsListConversations",
  method: "GET",
  route: "/public/v1/cue/conversations",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.startDate", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.endDate", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
