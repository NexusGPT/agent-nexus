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
// `vibe.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const VIBE_REGISTER_APP_AS_TOOL_CONTRACT = {
  name: "VibeRegisterAppAsTool",
  method: "POST",
  route: "/public/v1/vibe/apps/:appId/register-as-tool",
  fields: [
    { path: "PathVars.appId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.openApiSpec", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.auth", slot: "Body", type: "unknown", required: false, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
