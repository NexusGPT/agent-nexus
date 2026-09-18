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
// `eval.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const PROMPT_EVAL_RUN_CREATE__BODY_JUDGE_PROVIDER = {
  path: "PromptEvalRunCreate.Body.judge.provider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI",
    "JEV"
  ]
} as const satisfies ContractEnum;

export const PROMPT_EVAL_RUN_PREVIEW__BODY_JUDGE_PROVIDER = {
  path: "PromptEvalRunPreview.Body.judge.provider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI",
    "JEV"
  ]
} as const satisfies ContractEnum;

export const GOLDEN_CONVERSATION_ACCEPT_CONTRACT = {
  name: "GoldenConversationAccept",
  method: "POST",
  route: "/public/v1/prompt-eval/golden-conversations/:conversationId/accept",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.content", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const GOLDEN_CONVERSATION_ADD_USER_TURN_CONTRACT = {
  name: "GoldenConversationAddUserTurn",
  method: "POST",
  route: "/public/v1/prompt-eval/golden-conversations/:conversationId/turns/user",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.text", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const GOLDEN_CONVERSATION_CREATE_CONTRACT = {
  name: "GoldenConversationCreate",
  method: "POST",
  route: "/public/v1/prompt-eval/golden-conversations",
  fields: [
    { path: "Body.agentId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.deploymentId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.title", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.variant", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const GOLDEN_CONVERSATION_DELETE_CONTRACT = {
  name: "GoldenConversationDelete",
  method: "DELETE",
  route: "/public/v1/prompt-eval/golden-conversations/:conversationId",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const GOLDEN_CONVERSATION_GENERATE_CONTRACT = {
  name: "GoldenConversationGenerate",
  method: "POST",
  route: "/public/v1/prompt-eval/golden-conversations/:conversationId/generate",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const GOLDEN_CONVERSATION_GET_CONTRACT = {
  name: "GoldenConversationGet",
  method: "GET",
  route: "/public/v1/prompt-eval/golden-conversations/:conversationId",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const GOLDEN_CONVERSATION_LIST_CONTRACT = {
  name: "GoldenConversationList",
  method: "GET",
  route: "/public/v1/prompt-eval/golden-conversations",
  fields: [
    { path: "Params.agentId", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const GOLDEN_CONVERSATION_READY_CONTRACT = {
  name: "GoldenConversationReady",
  method: "POST",
  route: "/public/v1/prompt-eval/golden-conversations/:conversationId/ready",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const GOLDEN_CONVERSATION_SET_CHECKPOINT_CONTRACT = {
  name: "GoldenConversationSetCheckpoint",
  method: "PUT",
  route: "/public/v1/prompt-eval/golden-conversations/:conversationId/turns/:index/checkpoint",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.index", slot: "PathVars", type: "integer", required: true, depth: 0 },
    { path: "Body.isCheckpoint", slot: "Body", type: "boolean", required: true, depth: 0 },
    { path: "Body.criteria", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.criteria[].name", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.criteria[].rubric", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.criteria[].weight", slot: "Body", type: "number", required: false, depth: 1 }
  ]
} as const satisfies ProjectedDescriptor;

export const GOLDEN_CONVERSATION_SET_TURN_CONTENT_CONTRACT = {
  name: "GoldenConversationSetTurnContent",
  method: "PUT",
  route: "/public/v1/prompt-eval/golden-conversations/:conversationId/turns/:index/content",
  fields: [
    { path: "PathVars.conversationId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.index", slot: "PathVars", type: "integer", required: true, depth: 0 },
    { path: "Body.content", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_EVAL_RUN_ABORT_CONTRACT = {
  name: "PromptEvalRunAbort",
  method: "POST",
  route: "/public/v1/prompt-eval/runs/:runId/abort",
  fields: [
    { path: "PathVars.runId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_EVAL_RUN_CREATE_CONTRACT = {
  name: "PromptEvalRunCreate",
  method: "POST",
  route: "/public/v1/prompt-eval/runs",
  fields: [
    { path: "Body.conversationIds", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.checkpoints", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.checkpoints[].conversationId", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.checkpoints[].turnIndexes", slot: "Body", type: "array", required: true, depth: 1 },
    { path: "Body.variants", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.baseline", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.judge", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.judge.model", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.judge.provider", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI", "JEV"] },
    { path: "Body.judge.repetitions", slot: "Body", type: "integer", required: false, depth: 1 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.budgetCapUsdTenThousandths", slot: "Body", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_EVAL_RUN_GET_CONTRACT = {
  name: "PromptEvalRunGet",
  method: "GET",
  route: "/public/v1/prompt-eval/runs/:runId",
  fields: [
    { path: "PathVars.runId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_EVAL_RUN_LIST_CONTRACT = {
  name: "PromptEvalRunList",
  method: "GET",
  route: "/public/v1/prompt-eval/runs",
  fields: [
    { path: "Params.agentId", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_EVAL_RUN_PREVIEW_CONTRACT = {
  name: "PromptEvalRunPreview",
  method: "POST",
  route: "/public/v1/prompt-eval/runs/preview",
  fields: [
    { path: "Body.conversationIds", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.checkpoints", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.checkpoints[].conversationId", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.checkpoints[].turnIndexes", slot: "Body", type: "array", required: true, depth: 1 },
    { path: "Body.variants", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.baseline", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.judge", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.judge.model", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.judge.provider", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI", "JEV"] },
    { path: "Body.judge.repetitions", slot: "Body", type: "integer", required: false, depth: 1 }
  ]
} as const satisfies ProjectedDescriptor;

export const PROMPT_EVAL_RUN_RESULTS_CONTRACT = {
  name: "PromptEvalRunResults",
  method: "GET",
  route: "/public/v1/prompt-eval/runs/:runId/results",
  fields: [
    { path: "PathVars.runId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
