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
// `html-template.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const HTML_MESSAGE_TEMPLATE_CREATE_CONTRACT = {
  name: "HtmlMessageTemplateCreate",
  method: "POST",
  route: "/public/v1/html-message-templates",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.htmlContent", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.inputSchema", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.deploymentId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const HTML_MESSAGE_TEMPLATE_GET_CONTRACT = {
  name: "HtmlMessageTemplateGet",
  method: "GET",
  route: "/public/v1/html-message-templates/:templateId",
  fields: [
    { path: "PathVars.templateId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const HTML_MESSAGE_TEMPLATE_LIST_CONTRACT = {
  name: "HtmlMessageTemplateList",
  method: "GET",
  route: "/public/v1/html-message-templates",
  fields: [
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.deploymentId", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
