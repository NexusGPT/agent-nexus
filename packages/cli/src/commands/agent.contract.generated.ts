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
// `agent.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const AGENT_CREATE__BODY_MODEL = {
  path: "AgentCreate.Body.model",
  contractValues: [
    "DEFAULT",
    "GPT_4_TURBO",
    "GPT_4",
    "GPT_4_5",
    "GPT_4_1",
    "GPT_4_1_MINI",
    "GPT_4_1_NANO",
    "GPT_3_5_TURBO",
    "GPT_3_5_TURBO_16K",
    "MISTRAL_LARGE",
    "OPENAI_O1",
    "OPENAI_O1_MINI",
    "OPENAI_O3_MINI",
    "OPENAI_O3",
    "OPENAI_O3_PRO",
    "OPENAI_O4_MINI"
  ]
} as const satisfies ContractEnum;

export const AGENT_CREATE__BODY_MODEL_CONFIG_MODEL_PROVIDER = {
  path: "AgentCreate.Body.modelConfig.modelProvider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI"
  ]
} as const satisfies ContractEnum;

export const AGENT_CREATE__BODY_MODEL_CONFIG_THINKING_LEVEL = {
  path: "AgentCreate.Body.modelConfig.thinkingLevel",
  contractValues: [
    "fast",
    "detailed",
    "extended",
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
  ]
} as const satisfies ContractEnum;

export const AGENT_CREATE__BODY_MODEL_CONFIG_THINKING_DISPLAY = {
  path: "AgentCreate.Body.modelConfig.thinkingDisplay",
  contractValues: [
    "summarized",
    "omitted"
  ]
} as const satisfies ContractEnum;

export const AGENT_CREATE__BODY_MODEL_CONFIG_REASONING_EFFORT = {
  path: "AgentCreate.Body.modelConfig.reasoningEffort",
  contractValues: [
    "low",
    "medium",
    "high",
    "xhigh"
  ]
} as const satisfies ContractEnum;

export const AGENT_CREATE__BODY_MODEL_CONFIG_GEMINI_THINKING_LEVEL = {
  path: "AgentCreate.Body.modelConfig.geminiThinkingLevel",
  contractValues: [
    "dynamic",
    "low",
    "medium",
    "high",
    "minimal"
  ]
} as const satisfies ContractEnum;

export const AGENT_CREATE__BODY_MODEL_CONFIG_KIMI_REASONING_EFFORT = {
  path: "AgentCreate.Body.modelConfig.kimiReasoningEffort",
  contractValues: [
    "low",
    "high",
    "max"
  ]
} as const satisfies ContractEnum;

export const AGENT_CREATE__BODY_MODEL_PROVIDER = {
  path: "AgentCreate.Body.modelProvider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI"
  ]
} as const satisfies ContractEnum;

export const AGENT_LIST__PARAMS_STATUS = {
  path: "AgentList.Params.status",
  contractValues: [
    "ACTIVE",
    "DRAFT"
  ]
} as const satisfies ContractEnum;

export const AGENT_UPDATE__BODY_MODEL = {
  path: "AgentUpdate.Body.model",
  contractValues: [
    "DEFAULT",
    "GPT_4_TURBO",
    "GPT_4",
    "GPT_4_5",
    "GPT_4_1",
    "GPT_4_1_MINI",
    "GPT_4_1_NANO",
    "GPT_3_5_TURBO",
    "GPT_3_5_TURBO_16K",
    "MISTRAL_LARGE",
    "OPENAI_O1",
    "OPENAI_O1_MINI",
    "OPENAI_O3_MINI",
    "OPENAI_O3",
    "OPENAI_O3_PRO",
    "OPENAI_O4_MINI"
  ]
} as const satisfies ContractEnum;

export const AGENT_UPDATE__BODY_MODEL_CONFIG_MODEL_PROVIDER = {
  path: "AgentUpdate.Body.modelConfig.modelProvider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI"
  ]
} as const satisfies ContractEnum;

export const AGENT_UPDATE__BODY_MODEL_CONFIG_THINKING_LEVEL = {
  path: "AgentUpdate.Body.modelConfig.thinkingLevel",
  contractValues: [
    "fast",
    "detailed",
    "extended",
    "low",
    "medium",
    "high",
    "xhigh",
    "max"
  ]
} as const satisfies ContractEnum;

export const AGENT_UPDATE__BODY_MODEL_CONFIG_THINKING_DISPLAY = {
  path: "AgentUpdate.Body.modelConfig.thinkingDisplay",
  contractValues: [
    "summarized",
    "omitted"
  ]
} as const satisfies ContractEnum;

export const AGENT_UPDATE__BODY_MODEL_CONFIG_REASONING_EFFORT = {
  path: "AgentUpdate.Body.modelConfig.reasoningEffort",
  contractValues: [
    "low",
    "medium",
    "high",
    "xhigh"
  ]
} as const satisfies ContractEnum;

export const AGENT_UPDATE__BODY_MODEL_CONFIG_GEMINI_THINKING_LEVEL = {
  path: "AgentUpdate.Body.modelConfig.geminiThinkingLevel",
  contractValues: [
    "dynamic",
    "low",
    "medium",
    "high",
    "minimal"
  ]
} as const satisfies ContractEnum;

export const AGENT_UPDATE__BODY_MODEL_CONFIG_KIMI_REASONING_EFFORT = {
  path: "AgentUpdate.Body.modelConfig.kimiReasoningEffort",
  contractValues: [
    "low",
    "high",
    "max"
  ]
} as const satisfies ContractEnum;

export const AGENT_UPDATE__BODY_MODEL_PROVIDER = {
  path: "AgentUpdate.Body.modelProvider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI"
  ]
} as const satisfies ContractEnum;

export const AGENT_CREATE_CONTRACT = {
  name: "AgentCreate",
  method: "POST",
  route: "/public/v1/agents",
  fields: [
    { path: "Body.firstName", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.lastName", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.role", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.shortBio", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.bio", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.tags", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.gender", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.model", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["DEFAULT", "GPT_4_TURBO", "GPT_4", "GPT_4_5", "GPT_4_1", "GPT_4_1_MINI", "GPT_4_1_NANO", "GPT_3_5_TURBO", "GPT_3_5_TURBO_16K", "MISTRAL_LARGE", "OPENAI_O1", "OPENAI_O1_MINI", "OPENAI_O3_MINI", "OPENAI_O3", "OPENAI_O3_PRO", "OPENAI_O4_MINI"] },
    { path: "Body.modelConfig", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.modelConfig.modelName", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.modelConfig.modelProvider", slot: "Body", type: "string", required: true, depth: 1, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI"] },
    { path: "Body.modelConfig.thinkingLevel", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["fast", "detailed", "extended", "low", "medium", "high", "xhigh", "max"] },
    { path: "Body.modelConfig.thinkingDisplay", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["summarized", "omitted"] },
    { path: "Body.modelConfig.reasoningEffort", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["low", "medium", "high", "xhigh"] },
    { path: "Body.modelConfig.geminiThinkingLevel", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["dynamic", "low", "medium", "high", "minimal"] },
    { path: "Body.modelConfig.kimiReasoningEffort", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["low", "high", "max"] },
    { path: "Body.modelConfig.temperature", slot: "Body", type: "number", required: false, depth: 1 },
    { path: "Body.modelConfig.customModelId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.modelName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.modelProvider", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI"] },
    { path: "Body.playgroundFirstMessage", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.prompt", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const AGENT_LIST_CONTRACT = {
  name: "AgentList",
  method: "GET",
  route: "/public/v1/agents",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["ACTIVE", "DRAFT"] },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const AGENT_UPDATE_CONTRACT = {
  name: "AgentUpdate",
  method: "PATCH",
  route: "/public/v1/agents/:agentId",
  fields: [
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.firstName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.lastName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.role", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.shortBio", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.bio", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.tags", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.gender", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.model", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["DEFAULT", "GPT_4_TURBO", "GPT_4", "GPT_4_5", "GPT_4_1", "GPT_4_1_MINI", "GPT_4_1_NANO", "GPT_3_5_TURBO", "GPT_3_5_TURBO_16K", "MISTRAL_LARGE", "OPENAI_O1", "OPENAI_O1_MINI", "OPENAI_O3_MINI", "OPENAI_O3", "OPENAI_O3_PRO", "OPENAI_O4_MINI"] },
    { path: "Body.modelConfig", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.modelConfig.modelName", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.modelConfig.modelProvider", slot: "Body", type: "string", required: true, depth: 1, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI"] },
    { path: "Body.modelConfig.thinkingLevel", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["fast", "detailed", "extended", "low", "medium", "high", "xhigh", "max"] },
    { path: "Body.modelConfig.thinkingDisplay", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["summarized", "omitted"] },
    { path: "Body.modelConfig.reasoningEffort", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["low", "medium", "high", "xhigh"] },
    { path: "Body.modelConfig.geminiThinkingLevel", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["dynamic", "low", "medium", "high", "minimal"] },
    { path: "Body.modelConfig.kimiReasoningEffort", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["low", "high", "max"] },
    { path: "Body.modelConfig.temperature", slot: "Body", type: "number", required: false, depth: 1 },
    { path: "Body.modelConfig.customModelId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.modelName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.modelProvider", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI"] },
    { path: "Body.playgroundFirstMessage", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.prompt", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.autoPublish", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
