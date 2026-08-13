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
// `template.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const SKILLS_CREATE_DOCUMENT_TEMPLATE__BODY_TYPE = {
  path: "SkillsCreateDocumentTemplate.Body.type",
  contractValues: [
    "WORD_FORMAT",
    "WORD_TEMPLATE",
    "WORD_CONTENT",
    "POWERPOINT_TEMPLATE",
    "EXCEL_TEMPLATE"
  ]
} as const satisfies ContractEnum;

export const SKILLS_CREATE_DOCUMENT_TEMPLATE_CONTRACT = {
  name: "SkillsCreateDocumentTemplate",
  method: "POST",
  route: "/public/v1/skills/document-templates",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.type", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["WORD_FORMAT", "WORD_TEMPLATE", "WORD_CONTENT", "POWERPOINT_TEMPLATE", "EXCEL_TEMPLATE"] }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_LIST_DOCUMENT_TEMPLATES_CONTRACT = {
  name: "SkillsListDocumentTemplates",
  method: "GET",
  route: "/public/v1/skills/document-templates",
  fields: [
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.offset", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.folder", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
