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
// `mcp-server.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const MCP_SERVER_GET_CONTRACT = {
  name: "McpServerGet",
  method: "GET",
  route: "/public/v1/mcp-servers/:serverId",
  fields: [
    { path: "PathVars.serverId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const MCP_SERVER_LIST_CONTRACT = {
  name: "McpServerList",
  method: "GET",
  route: "/public/v1/mcp-servers",
  fields: [

  ]
} as const satisfies ProjectedDescriptor;

export const MCP_SERVER_TOOL_CALL_CONTRACT = {
  name: "McpServerToolCall",
  method: "POST",
  route: "/public/v1/mcp-servers/:serverId/tools/call",
  fields: [
    { path: "PathVars.serverId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.toolName", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.arguments", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.credentialId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.accessCardId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.cardVariableValues", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.expectedSchemaHash", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
