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
// `score.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const SCORE_LIST__PARAMS_SCORABLE_TYPE = {
  path: "ScoreList.Params.scorableType",
  contractValues: [
    "MESSAGE",
    "CHAT",
    "GENERATION",
    "TRACE",
    "WORKFLOW_EXECUTION",
    "WORKFLOW_EXECUTION_NODE"
  ]
} as const satisfies ContractEnum;

export const SCORE_RECORD__BODY_SCORABLE_TYPE = {
  path: "ScoreRecord.Body.scorableType",
  contractValues: [
    "MESSAGE",
    "CHAT",
    "GENERATION",
    "TRACE",
    "WORKFLOW_EXECUTION",
    "WORKFLOW_EXECUTION_NODE"
  ]
} as const satisfies ContractEnum;

export const SCORE_LIST_CONTRACT = {
  name: "ScoreList",
  method: "GET",
  route: "/public/v1/scores",
  fields: [
    { path: "Params.scorableType", slot: "Params", type: "string", required: true, depth: 0, enumValues: ["MESSAGE", "CHAT", "GENERATION", "TRACE", "WORKFLOW_EXECUTION", "WORKFLOW_EXECUTION_NODE"] },
    { path: "Params.scorableId", slot: "Params", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SCORE_RECORD_CONTRACT = {
  name: "ScoreRecord",
  method: "POST",
  route: "/public/v1/scores",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.scorableType", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["MESSAGE", "CHAT", "GENERATION", "TRACE", "WORKFLOW_EXECUTION", "WORKFLOW_EXECUTION_NODE"] },
    { path: "Body.scorableId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.emitterId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.emitterName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.reasoning", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.metadata", slot: "Body", type: "unknown", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
