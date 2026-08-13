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
// `external-tool.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const SKILLS_CREATE_EXTERNAL_TOOL_CONTRACT = {
  name: "SkillsCreateExternalTool",
  method: "POST",
  route: "/public/v1/skills/external-tools",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.imageUrl", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.documentation", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.openApiSpec", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.endpointUrl", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.auth", slot: "Body", type: "unknown", required: true, depth: 0 },
    { path: "Body.customHeaders", slot: "Body", type: "object", required: false, depth: 0, opaque: true }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_DELETE_EXTERNAL_TOOL_CONTRACT = {
  name: "SkillsDeleteExternalTool",
  method: "DELETE",
  route: "/public/v1/skills/external-tools/:externalToolId",
  fields: [
    { path: "PathVars.externalToolId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.force", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_GET_EXTERNAL_TOOL_CONTRACT = {
  name: "SkillsGetExternalTool",
  method: "GET",
  route: "/public/v1/skills/external-tools/:externalToolId",
  fields: [
    { path: "PathVars.externalToolId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_LIST_EXTERNAL_TOOLS_CONTRACT = {
  name: "SkillsListExternalTools",
  method: "GET",
  route: "/public/v1/skills/external-tools",
  fields: [
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.offset", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.folder", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_TEST_EXTERNAL_TOOL_CONTRACT = {
  name: "SkillsTestExternalTool",
  method: "POST",
  route: "/public/v1/skills/external-tools/:externalToolId/test",
  fields: [
    { path: "PathVars.externalToolId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.operationId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.input", slot: "Body", type: "object", required: true, depth: 0, opaque: true },
    { path: "Body.toolCredentialId", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_UPDATE_EXTERNAL_TOOL_CONTRACT = {
  name: "SkillsUpdateExternalTool",
  method: "PATCH",
  route: "/public/v1/skills/external-tools/:externalToolId",
  fields: [
    { path: "PathVars.externalToolId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.force", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.documentation", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.openApiSpec", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.endpointUrl", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.auth", slot: "Body", type: "unknown", required: false, depth: 0 },
    { path: "Body.customHeaders", slot: "Body", type: "object", required: false, depth: 0, opaque: true }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_UPLOAD_EXTERNAL_TOOL_ICON_CONTRACT = {
  name: "SkillsUploadExternalToolIcon",
  method: "POST",
  route: "/public/v1/skills/external-tools/:externalToolId/upload-icon",
  fields: [
    { path: "PathVars.externalToolId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
