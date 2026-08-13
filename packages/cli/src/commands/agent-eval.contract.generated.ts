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
// `agent-eval.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const CONVERSATION_EVAL_BATCH_LIST__PARAMS_STATUS = {
  path: "ConversationEvalBatchList.Params.status",
  contractValues: [
    "QUEUED",
    "RUNNING",
    "COMPLETED",
    "PARTIAL",
    "FAILED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_RUN_CREATE__BODY_SOURCE_MODE = {
  path: "ConversationEvalRunCreate.Body.sourceMode",
  contractValues: [
    "SIMULATED",
    "INBOX"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_RUN_CREATE__BODY_TARGET_VERSION_MODE = {
  path: "ConversationEvalRunCreate.Body.targetVersionMode",
  contractValues: [
    "DRAFT",
    "PRODUCTION",
    "PINNED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_RUN_CREATE__BODY_JUDGE_CONFIGS_ITEM_PROVIDER = {
  path: "ConversationEvalRunCreate.Body.judgeConfigs[].provider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_RUN_CREATE__BODY_SUMMARY_CONFIG_PROVIDER = {
  path: "ConversationEvalRunCreate.Body.summaryConfig.provider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_RUN_LIST__PARAMS_STATUS = {
  path: "ConversationEvalRunList.Params.status",
  contractValues: [
    "DRAFT",
    "QUEUED",
    "INGESTING",
    "SIMULATING",
    "SIMULATED",
    "JUDGING",
    "SUMMARIZING",
    "COMPLETED",
    "FAILED",
    "TIMED_OUT",
    "BUDGET_EXCEEDED",
    "ABORTED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_RUN_LIST__PARAMS_SOURCE_MODE = {
  path: "ConversationEvalRunList.Params.sourceMode",
  contractValues: [
    "SIMULATED",
    "INBOX"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_SCHEDULE_LIST__PARAMS_STATUS = {
  path: "ConversationEvalScheduleList.Params.status",
  contractValues: [
    "ACTIVE",
    "PAUSED"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_TEMPLATE_LIST__PARAMS_KIND = {
  path: "ConversationEvalTemplateList.Params.kind",
  contractValues: [
    "TESTER_PERSONA",
    "JUDGE_RUBRIC",
    "SUMMARY_PROMPT"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_TEMPLATE_LIST__PARAMS_SCOPE = {
  path: "ConversationEvalTemplateList.Params.scope",
  contractValues: [
    "GLOBAL",
    "AGENT"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_TEMPLATE_LIST_IMPORTABLE__PARAMS_KIND = {
  path: "ConversationEvalTemplateListImportable.Params.kind",
  contractValues: [
    "TESTER_PERSONA",
    "JUDGE_RUBRIC",
    "SUMMARY_PROMPT"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_TRIGGER_LIST__PARAMS_KIND = {
  path: "ConversationEvalTriggerList.Params.kind",
  contractValues: [
    "AUTO_ON_CLOSE",
    "SCHEDULED_SAMPLE"
  ]
} as const satisfies ContractEnum;

export const CONVERSATION_EVAL_BATCH_LIST_CONTRACT = {
  name: "ConversationEvalBatchList",
  method: "GET",
  route: "/public/v1/agent-evals/batches",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["QUEUED", "RUNNING", "COMPLETED", "PARTIAL", "FAILED"] }
  ]
} as const satisfies ProjectedDescriptor;

export const CONVERSATION_EVAL_RUN_CREATE_CONTRACT = {
  name: "ConversationEvalRunCreate",
  method: "POST",
  route: "/public/v1/agent-evals/runs",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.sourceMode", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["SIMULATED", "INBOX"] },
    { path: "Body.targetAgentId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.targetDeploymentId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.targetVersionMode", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["DRAFT", "PRODUCTION", "PINNED"] },
    { path: "Body.targetPromptVersionId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.sourceChatId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.testerConfig", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.testerConfig.templateId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.testerConfig.resolvedSystemPrompt", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.testerConfig.goal", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.testerConfig.endSignal", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.testerConfig.endConversationSchema", slot: "Body", type: "object", required: false, depth: 1, opaque: true },
    { path: "Body.judgeConfigs", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.judgeConfigs[].templateId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.judgeConfigs[].criterion", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.judgeConfigs[].resolvedRubric", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.judgeConfigs[].provider", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI"] },
    { path: "Body.judgeConfigs[].model", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.judgeConfigs[].kRepetitions", slot: "Body", type: "integer", required: false, depth: 1 },
    { path: "Body.judgeConfigs[].outputJsonSchema", slot: "Body", type: "object", required: false, depth: 1, opaque: true },
    { path: "Body.summaryConfig", slot: "Body", type: "object", required: true, depth: 0 },
    { path: "Body.summaryConfig.templateId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.summaryConfig.resolvedPrompt", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.summaryConfig.provider", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI"] },
    { path: "Body.summaryConfig.model", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.maxTurns", slot: "Body", type: "integer", required: false, depth: 0 },
    { path: "Body.runTimeoutMs", slot: "Body", type: "integer", required: false, depth: 0 },
    { path: "Body.budgetCapUsdTenThousandths", slot: "Body", type: "integer", required: false, depth: 0 },
    { path: "Body.thresholdConfig", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.thresholdConfig.minOverallScore", slot: "Body", type: "number", required: true, depth: 1 },
    { path: "Body.thresholdConfig.perCriterionMin", slot: "Body", type: "number", required: false, depth: 1 },
    { path: "Body.thresholdConfig.requireNoLowAgreement", slot: "Body", type: "boolean", required: false, depth: 1 },
    { path: "Body.baselineRunId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.webhookConfigId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CONVERSATION_EVAL_RUN_LIST_CONTRACT = {
  name: "ConversationEvalRunList",
  method: "GET",
  route: "/public/v1/agent-evals/runs",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["DRAFT", "QUEUED", "INGESTING", "SIMULATING", "SIMULATED", "JUDGING", "SUMMARIZING", "COMPLETED", "FAILED", "TIMED_OUT", "BUDGET_EXCEEDED", "ABORTED"] },
    { path: "Params.agentId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.sourceMode", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["SIMULATED", "INBOX"] }
  ]
} as const satisfies ProjectedDescriptor;

export const CONVERSATION_EVAL_SCHEDULE_LIST_CONTRACT = {
  name: "ConversationEvalScheduleList",
  method: "GET",
  route: "/public/v1/agent-evals/schedules",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["ACTIVE", "PAUSED"] }
  ]
} as const satisfies ProjectedDescriptor;

export const CONVERSATION_EVAL_TEMPLATE_LIST_CONTRACT = {
  name: "ConversationEvalTemplateList",
  method: "GET",
  route: "/public/v1/agent-evals/templates",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.agentId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.kind", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["TESTER_PERSONA", "JUDGE_RUBRIC", "SUMMARY_PROMPT"] },
    { path: "Params.scope", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["GLOBAL", "AGENT"] }
  ]
} as const satisfies ProjectedDescriptor;

export const CONVERSATION_EVAL_TEMPLATE_LIST_IMPORTABLE_CONTRACT = {
  name: "ConversationEvalTemplateListImportable",
  method: "GET",
  route: "/public/v1/agent-evals/templates/importable",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.agentId", slot: "Params", type: "string", required: true, depth: 0 },
    { path: "Params.kind", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["TESTER_PERSONA", "JUDGE_RUBRIC", "SUMMARY_PROMPT"] }
  ]
} as const satisfies ProjectedDescriptor;

export const CONVERSATION_EVAL_TRIGGER_LIST_CONTRACT = {
  name: "ConversationEvalTriggerList",
  method: "GET",
  route: "/public/v1/agent-evals/triggers",
  fields: [
    { path: "Params.agentId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.deploymentId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.kind", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["AUTO_ON_CLOSE", "SCHEDULED_SAMPLE"] },
    { path: "Params.enabledOnly", slot: "Params", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
