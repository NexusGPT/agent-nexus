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
// `collection.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const SKILLS_ATTACH_COLLECTION_DOCUMENTS_CONTRACT = {
  name: "SkillsAttachCollectionDocuments",
  method: "POST",
  route: "/public/v1/skills/collections/:collectionId/documents",
  fields: [
    { path: "PathVars.collectionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.documentIds", slot: "Body", type: "array", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_CREATE_COLLECTION_CONTRACT = {
  name: "SkillsCreateCollection",
  method: "POST",
  route: "/public/v1/skills/collections",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.displayName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.k", slot: "Body", type: "integer", required: false, depth: 0 },
    { path: "Body.reranker", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.preciseResponses", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.includeMetadata", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_DELETE_COLLECTION_CONTRACT = {
  name: "SkillsDeleteCollection",
  method: "DELETE",
  route: "/public/v1/skills/collections/:collectionId",
  fields: [
    { path: "PathVars.collectionId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_GET_COLLECTION_CONTRACT = {
  name: "SkillsGetCollection",
  method: "GET",
  route: "/public/v1/skills/collections/:collectionId",
  fields: [
    { path: "PathVars.collectionId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_GET_COLLECTION_STATISTICS_CONTRACT = {
  name: "SkillsGetCollectionStatistics",
  method: "GET",
  route: "/public/v1/skills/collections/:collectionId/statistics",
  fields: [
    { path: "PathVars.collectionId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_LIST_COLLECTION_DOCUMENTS_CONTRACT = {
  name: "SkillsListCollectionDocuments",
  method: "GET",
  route: "/public/v1/skills/collections/:collectionId/documents",
  fields: [
    { path: "PathVars.collectionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.page", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_LIST_COLLECTIONS_CONTRACT = {
  name: "SkillsListCollections",
  method: "GET",
  route: "/public/v1/skills/collections",
  fields: [
    { path: "Params.search", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.offset", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.folder", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_QUERY_COLLECTION_CONTRACT = {
  name: "SkillsQueryCollection",
  method: "POST",
  route: "/public/v1/skills/collections/:collectionId/query",
  fields: [
    { path: "PathVars.collectionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.query", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.limit", slot: "Body", type: "integer", required: false, depth: 0 },
    { path: "Body.includeMetadata", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.metadataFilter", slot: "Body", type: "object", required: false, depth: 0, opaque: true }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_REMOVE_COLLECTION_DOCUMENT_CONTRACT = {
  name: "SkillsRemoveCollectionDocument",
  method: "DELETE",
  route: "/public/v1/skills/collections/:collectionId/documents/:documentId",
  fields: [
    { path: "PathVars.collectionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.documentId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_SEARCH_COLLECTION_CONTRACT = {
  name: "SkillsSearchCollection",
  method: "POST",
  route: "/public/v1/skills/collections/:collectionId/search",
  fields: [
    { path: "PathVars.collectionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.query", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.limit", slot: "Body", type: "integer", required: false, depth: 0 },
    { path: "Body.includeMetadata", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_SEARCH_MULTIPLE_COLLECTIONS_CONTRACT = {
  name: "SkillsSearchMultipleCollections",
  method: "POST",
  route: "/public/v1/skills/collections/search",
  fields: [
    { path: "Body.query", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.collectionIds", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.limit", slot: "Body", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const SKILLS_UPDATE_COLLECTION_CONTRACT = {
  name: "SkillsUpdateCollection",
  method: "PATCH",
  route: "/public/v1/skills/collections/:collectionId",
  fields: [
    { path: "PathVars.collectionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.displayName", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.k", slot: "Body", type: "integer", required: false, depth: 0 },
    { path: "Body.reranker", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.preciseResponses", slot: "Body", type: "boolean", required: false, depth: 0 },
    { path: "Body.includeMetadata", slot: "Body", type: "boolean", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;
