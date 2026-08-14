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
// `document.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const DOCUMENT_ADD_WEBSITE__BODY_MODE = {
  path: "DocumentAddWebsite.Body.mode",
  contractValues: [
    "sitemap",
    "crawl"
  ]
} as const satisfies ContractEnum;

export const DOCUMENT_LIST__PARAMS_TYPE = {
  path: "DocumentList.Params.type",
  contractValues: [
    "PDF",
    "CSV",
    "TEXT",
    "IMAGE",
    "AUDIO",
    "WEBSITE_FOLDER",
    "WEBSITE_PAGE",
    "NOTION_PAGE",
    "NOTION_DATABASE",
    "GOOGLE_DOC",
    "GOOGLE_SHEET",
    "GOOGLE_DRIVE",
    "SHAREPOINT",
    "AIRTABLE_BASE",
    "AIRTABLE_TABLE",
    "FOLDER",
    "UNKNOWN"
  ]
} as const satisfies ContractEnum;

export const DOCUMENT_LIST__PARAMS_STATUS = {
  path: "DocumentList.Params.status",
  contractValues: [
    "PENDING",
    "PROCESSING",
    "READY",
    "ERROR",
    "SYNCING"
  ]
} as const satisfies ContractEnum;

export const DOCUMENT_ADD_WEBSITE_CONTRACT = {
  name: "DocumentAddWebsite",
  method: "POST",
  route: "/public/v1/documents/website",
  fields: [
    { path: "Body.url", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.mode", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["sitemap", "crawl"] },
    { path: "Body.config", slot: "Body", type: "object", required: false, depth: 0 },
    { path: "Body.config.urls", slot: "Body", type: "array", required: false, depth: 1 },
    { path: "Body.config.max_depth", slot: "Body", type: "integer", required: false, depth: 1 },
    { path: "Body.config.max_pages", slot: "Body", type: "integer", required: false, depth: 1 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.metadata", slot: "Body", type: "object", required: false, depth: 0, opaque: true }
  ]
} as const satisfies ProjectedDescriptor;

export const DOCUMENT_LIST_CONTRACT = {
  name: "DocumentList",
  method: "GET",
  route: "/public/v1/documents",
  fields: [
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.type", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["PDF", "CSV", "TEXT", "IMAGE", "AUDIO", "WEBSITE_FOLDER", "WEBSITE_PAGE", "NOTION_PAGE", "NOTION_DATABASE", "GOOGLE_DOC", "GOOGLE_SHEET", "GOOGLE_DRIVE", "SHAREPOINT", "AIRTABLE_BASE", "AIRTABLE_TABLE", "FOLDER", "UNKNOWN"] },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["PENDING", "PROCESSING", "READY", "ERROR", "SYNCING"] },
    { path: "Params.parentId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.collectionId", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.isFolder", slot: "Params", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
