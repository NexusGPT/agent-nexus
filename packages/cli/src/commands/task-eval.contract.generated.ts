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
// `task-eval.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const EVALUATION_CREATE_CONTRACT = {
  name: "EvaluationCreate",
  method: "POST",
  route: "/public/v1/skills/tasks/:taskId/evaluations",
  fields: [
    { path: "PathVars.taskId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const EVALUATION_FORMATS_CONTRACT = {
  name: "EvaluationFormats",
  method: "GET",
  route: "/public/v1/skills/evaluations/formats",
  fields: [

  ]
} as const satisfies ProjectedDescriptor;

export const EVALUATION_JUDGES_CONTRACT = {
  name: "EvaluationJudges",
  method: "GET",
  route: "/public/v1/skills/evaluations/judges",
  fields: [

  ]
} as const satisfies ProjectedDescriptor;

export const EVALUATION_LIST_CONTRACT = {
  name: "EvaluationList",
  method: "GET",
  route: "/public/v1/skills/tasks/:taskId/evaluations",
  fields: [
    { path: "PathVars.taskId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
