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
// `prompt-assistant.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const PROMPT_ASSISTANT_CHAT__BODY_MODE = {
  path: "PromptAssistantChat.Body.mode",
  contractValues: [
    "agent",
    "ai-task"
  ]
} as const satisfies ContractEnum;

export const PROMPT_ASSISTANT_CHAT_CONTRACT = {
  name: "PromptAssistantChat",
  method: "POST",
  route: "/public/v1/prompt-assistant/chat",
  fields: [
    { path: "Body.message", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.threadId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.mode", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["agent", "ai-task"] }
  ]
} as const satisfies ProjectedDescriptor;
