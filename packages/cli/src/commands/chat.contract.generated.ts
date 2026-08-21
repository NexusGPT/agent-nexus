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
// `chat.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const CHAT_RESUME_STREAM_CONTRACT = {
  name: "ChatResumeStream",
  method: "GET",
  route: "/public/v1/deployments/:deploymentId/chat/stream",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CHAT_SEND_MESSAGE_STREAM_CONTRACT = {
  name: "ChatSendMessageStream",
  method: "POST",
  route: "/public/v1/deployments/:deploymentId/chat",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.content", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.messages", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.messages[].id", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.messages[].role", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.messages[].parts", slot: "Body", type: "array", required: false, depth: 1 },
    { path: "Body.messages[].parts[].type", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.messages[].parts[].text", slot: "Body", type: "string", required: false, depth: 2 },
    { path: "Body.id", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.trigger", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.messageId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.knowledgeIds", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.images", slot: "Body", type: "array", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CHAT_STOP_TURN_CONTRACT = {
  name: "ChatStopTurn",
  method: "POST",
  route: "/public/v1/deployments/:deploymentId/chat/stop",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.turnId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const CHAT_TURN_STATUS_CONTRACT = {
  name: "ChatTurnStatus",
  method: "GET",
  route: "/public/v1/deployments/:deploymentId/chat/status",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const DEPLOYMENT_CHAT_SESSION_CREATE_CONTRACT = {
  name: "DeploymentChatSessionCreate",
  method: "POST",
  route: "/public/v1/deployments/:deploymentId/chat-session",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.externalUserId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.identityHash", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.chatId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
