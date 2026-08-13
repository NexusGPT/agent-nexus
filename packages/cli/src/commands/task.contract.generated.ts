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
// `task.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const SKILLS_CREATE_TASK__BODY_MODEL_PROVIDER = {
  path: "SkillsCreateTask.Body.modelProvider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI"
  ]
} as const satisfies ContractEnum;

export const SKILLS_CREATE_TASK__BODY_INPUT_FORMAT = {
  path: "SkillsCreateTask.Body.inputFormat",
  contractValues: [
    "text",
    "json"
  ]
} as const satisfies ContractEnum;

export const SKILLS_CREATE_TASK__BODY_OUTPUT_FORMAT = {
  path: "SkillsCreateTask.Body.outputFormat",
  contractValues: [
    "text",
    "json",
    "template"
  ]
} as const satisfies ContractEnum;

export const SKILLS_UPDATE_TASK__BODY_MODEL_PROVIDER = {
  path: "SkillsUpdateTask.Body.modelProvider",
  contractValues: [
    "OPEN_AI",
    "ANTHROPIC",
    "GOOGLE_AI",
    "KIMI"
  ]
} as const satisfies ContractEnum;

export const SKILLS_UPDATE_TASK__BODY_INPUT_FORMAT = {
  path: "SkillsUpdateTask.Body.inputFormat",
  contractValues: [
    "text",
    "json"
  ]
} as const satisfies ContractEnum;

export const SKILLS_UPDATE_TASK__BODY_OUTPUT_FORMAT = {
  path: "SkillsUpdateTask.Body.outputFormat",
  contractValues: [
    "text",
    "json",
    "template"
  ]
} as const satisfies ContractEnum;

export const SKILLS_CREATE_TASK_CONTRACT = {
  name: "SkillsCreateTask",
  method: "POST",
  route: "/public/v1/skills/tasks",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.modelName", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.modelProvider", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI"] },
    { path: "Body.prompt", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.temperature", slot: "Body", type: "number", required: false, depth: 0 },
    { path: "Body.inputFormat", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["text", "json"] },
    { path: "Body.outputFormat", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["text", "json", "template"] },
    { path: "Body.multimodal", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.allowDuplicate", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.generation", slot: "Body", type: "object", required: true, depth: 0 },
    { path: "Body.generation.multimodal", slot: "Body", type: "boolean", required: false, depth: 1 },
    { path: "Body.generation.prompt", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.generation.expectedInput", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.generation.jsonInputSchema", slot: "Body", type: "object", required: false, depth: 1, opaque: true },
    { path: "Body.generation.expectedOutput", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.generation.jsonOutputSchema", slot: "Body", type: "object", required: false, depth: 1, opaque: true },
    { path: "Body.generation.documentTemplateId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.promptText", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.systemPrompt", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.instructions", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.text", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_UPDATE_TASK_CONTRACT = {
  name: "SkillsUpdateTask",
  method: "PATCH",
  route: "/public/v1/skills/tasks/:taskId",
  fields: [
    { path: "PathVars.taskId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.modelName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.modelProvider", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["OPEN_AI", "ANTHROPIC", "GOOGLE_AI", "KIMI"] },
    { path: "Body.prompt", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.temperature", slot: "Body", type: "number", required: false, depth: 0 },
    { path: "Body.inputFormat", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["text", "json"] },
    { path: "Body.outputFormat", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["text", "json", "template"] },
    { path: "Body.multimodal", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.expectedInput", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.jsonInputSchema", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.expectedOutput", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.jsonOutputSchema", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.documentTemplateId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.generation", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.generation.multimodal", slot: "Body", type: "boolean", required: false, depth: 1 },
    { path: "Body.generation.prompt", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.generation.expectedInput", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.generation.jsonInputSchema", slot: "Body", type: "object", required: false, depth: 1, opaque: true },
    { path: "Body.generation.expectedOutput", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.generation.jsonOutputSchema", slot: "Body", type: "object", required: false, depth: 1, opaque: true },
    { path: "Body.generation.documentTemplateId", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.promptText", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.systemPrompt", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.instructions", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.text", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
