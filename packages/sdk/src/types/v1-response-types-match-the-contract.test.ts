import { ZPublicApiV1 } from "@nexus/types/public-api-v1";
import { describe, expect, it } from "vitest";

import type { NexusClient } from "../client";
import { collectRoutes, reachedBySdk } from "../resources/v1-route-scan.conformance";
import type { Equals, Expect, Received } from "../v1-contract-equality";

/**
 * THE DRIFT GATE between a v1 route's declared RESPONSE and the return type of
 * the SDK method that calls it.
 *
 * Everything this package SENDS is generated from the contract and gated end to
 * end. Everything it RECEIVES had no contract at all: `HttpClient.request<T>`
 * takes `T` from the CALL SITE, so a resource method may declare any return type
 * it likes and nothing compares it to the wire. A field the server sends and the
 * declared type omits is unreachable from typed code — no error, no `undefined`,
 * the key is simply typed out of existence — and a field the type invents reads
 * `undefined` at runtime.
 *
 * That is not hypothetical. `assets.delete()` was typed as the shared
 * `DeleteResponse`, so `objectRemoved` — the only signal that a deleted asset's
 * public URL stopped serving — could not be read even under `--json` (NEX-3850).
 * `models.list()` was declared `Promise<{ models: ModelSummary[] }>` over a route
 * that returns a bare array, so `nexus model list --json` printed `{}` for 45
 * models, the shape of an empty account (NEX-3868). Both shipped green.
 *
 * ## Why this is a SECOND file rather than more rows in the sibling
 *
 * `./types-match-the-v1-contract.test.ts` keys by SCHEMA NAME — it pairs an
 * exported `XSchema` with the hand-written `X`. That is the right key for a type
 * this package publishes, and it is the wrong key for this question: most of the
 * relevant schemas are not exported from `@nexus/types/public-api-v1` at all, and
 * a route may wrap its schema at the DESCRIPTOR (`.nullable()`, `.array()`) so
 * the named export is only the inner half. This file keys by ROUTE and reads the
 * schema off the descriptor, which is what the caller actually receives.
 *
 * ## What it checks, and what it structurally cannot
 *
 * `Equals` is exact type identity, so this catches BOTH directions at once: a
 * field the SDK omits, a field it invents, a renamed field, an enum member added
 * or dropped, a wrong scalar, and `a?: X` against `a: X | undefined`. That is
 * strictly more than the runtime `V1ResponseValidationInterceptor` can see —
 * Zod objects are non-strict, so a schema that OMITS a key the handler ships
 * passes `safeParse` forever, which is exactly how `ModelSummarySchema.source`
 * survived.
 *
 * It cannot see any of these, and the list is the point:
 *
 * - **A route with no `Response`.** 112 of 434 descriptors declare none, so no
 *   contract-derived gate can ever compare them. That population is roughly
 *   eleven times the size of the drift ledger below, and declaring `Response` on
 *   those routes is a prerequisite for covering them rather than an alternative.
 * - **A route with no SDK method.** Ledgered by
 *   `../resources/v1-routes-have-an-sdk-method.test.ts`, which owns that seam.
 * - **Whether the HANDLER agrees with the schema.** This compares the contract to
 *   this package. `apps/backend/src/public/v1/__tests__/` owns the other half,
 *   and a schema that is wrong about its own handler is wrong here too, silently.
 * - **Any zod refinement.** `.uuid()`, `.min()`, a regex and a length are all
 *   `string` after inference. The production counter
 *   `v1_response_validation_total`, labelled by route and result, is what covers
 *   those — it measures real payloads and no static instrument can reach them.
 *
 * ## The runtime half is a POPULATION ratchet, not a count
 *
 * The list below is hand-committed, so on its own it would be a list somebody
 * has to remember to extend. The `it` block at the bottom derives the population
 * — every descriptor that declares a `Response` AND is reached by an SDK method
 * — and requires it to equal `GATED_ROUTES ∪ V1_RESPONSE_DRIFT`. A new route
 * with a response and a method is therefore RED until it is gated or ledgered
 * with a reason. `reachedBySdk` is imported rather than re-implemented so that
 * both gates agree on what "reached" means.
 *
 * ## Vitest does not enforce the assertions, and the drift tuple is the control
 *
 * The `Expect<Equals<…>>` entries are checked by `tsc`, never by this runner —
 * vitest transpiles per file without running the project's type graph. CI's
 * `Typecheck` job is where a drift lands.
 *
 * 🚨 That leaves one way for the whole file to go quietly vacuous: if
 * `ResponseOf` or `MethodResult` ever resolved to `never` — a moved export, a
 * changed descriptor shape — every `Equals<never, never>` would be `true` and
 * 246 assertions would pass having compared nothing. {@link V1ResponseDrift}
 * closes that: it asserts 33 pairs are NOT equal, so a machinery failure that
 * collapses both sides to `never` turns those 33 RED. A gate whose green depends
 * on its own reds is one that cannot be satisfied by breaking it.
 */

/** The response schema a descriptor declares, as it survives JSON. */
type ResponseOf<K extends keyof typeof ZPublicApiV1> = (typeof ZPublicApiV1)[K] extends {
  Response: infer S extends { _output: unknown };
}
  ? Received<S>
  : never;

/** What a resource method declares it resolves to. */
type MethodResult<F> = F extends (...args: never[]) => Promise<infer R> ? R : never;

/**
 * The items half of a paginated method.
 *
 * `requestPage` / `requestWithMeta` wrap the wire array in `{ data, meta }` —
 * the SDK's own pagination shape, derived rather than served, so the contract's
 * `Response` is the ARRAY and comparing it to `PageResponse<T>` would report
 * drift on every list route. Which form a route takes is read off the HELPER the
 * method calls, not hand-classified: nine of the ten paginated routes cleared
 * this way and `WorkflowList` stayed red, which is the check that the rule
 * excuses a wrapper rather than a family.
 */
type PageItems<P> = P extends { data: infer D } ? D : never;

/**
 * One entry per gated route. A `false` is a compile error on that exact line,
 * and the line names the route, the verb, the path and the method.
 */
export type V1ResponseAssertions = [
  // AgentDelete  DELETE /public/v1/agents/:agentId  ->  client.agents.delete()
  Expect<Equals<ResponseOf<"AgentDelete">, MethodResult<NexusClient["agents"]["delete"]>>>,
  // AgentUploadProfilePicture  POST /public/v1/agents/:agentId/profile-picture  ->  client.agents.uploadProfilePicture()
  Expect<
    Equals<
      ResponseOf<"AgentUploadProfilePicture">,
      MethodResult<NexusClient["agents"]["uploadProfilePicture"]>
    >
  >,
  // ModelList  GET /public/v1/models  ->  client.models.list()
  Expect<Equals<ResponseOf<"ModelList">, MethodResult<NexusClient["models"]["list"]>>>,
  // ToolDelete  DELETE /public/v1/agents/:agentId/tools/:toolId  ->  client.agents.tools.delete()
  Expect<Equals<ResponseOf<"ToolDelete">, MethodResult<NexusClient["agents"]["tools"]["delete"]>>>,
  // FolderList  GET /public/v1/folders  ->  client.folders.list()
  Expect<Equals<ResponseOf<"FolderList">, MethodResult<NexusClient["folders"]["list"]>>>,
  // FolderCreate  POST /public/v1/folders  ->  client.folders.create()
  Expect<Equals<ResponseOf<"FolderCreate">, MethodResult<NexusClient["folders"]["create"]>>>,
  // FolderUpdate  PATCH /public/v1/folders/:folderId  ->  client.folders.update()
  Expect<Equals<ResponseOf<"FolderUpdate">, MethodResult<NexusClient["folders"]["update"]>>>,
  // FolderDelete  DELETE /public/v1/folders/:folderId  ->  client.folders.delete()
  Expect<Equals<ResponseOf<"FolderDelete">, MethodResult<NexusClient["folders"]["delete"]>>>,
  // FolderAssignAgent  POST /public/v1/folders/assign  ->  client.folders.assignAgent()
  Expect<
    Equals<ResponseOf<"FolderAssignAgent">, MethodResult<NexusClient["folders"]["assignAgent"]>>
  >,
  // VersionGet  GET /public/v1/agents/:agentId/versions/:versionId  ->  client.agents.versions.get()
  Expect<Equals<ResponseOf<"VersionGet">, MethodResult<NexusClient["agents"]["versions"]["get"]>>>,
  // VersionCreateCheckpoint  POST /public/v1/agents/:agentId/versions  ->  client.agents.versions.createCheckpoint()
  Expect<
    Equals<
      ResponseOf<"VersionCreateCheckpoint">,
      MethodResult<NexusClient["agents"]["versions"]["createCheckpoint"]>
    >
  >,
  // VersionUpdate  PATCH /public/v1/agents/:agentId/versions/:versionId  ->  client.agents.versions.update()
  Expect<
    Equals<ResponseOf<"VersionUpdate">, MethodResult<NexusClient["agents"]["versions"]["update"]>>
  >,
  // VersionDelete  DELETE /public/v1/agents/:agentId/versions/:versionId  ->  client.agents.versions.delete()
  Expect<
    Equals<ResponseOf<"VersionDelete">, MethodResult<NexusClient["agents"]["versions"]["delete"]>>
  >,
  // VersionRestore  POST /public/v1/agents/:agentId/versions/:versionId/restore  ->  client.agents.versions.restore()
  Expect<
    Equals<ResponseOf<"VersionRestore">, MethodResult<NexusClient["agents"]["versions"]["restore"]>>
  >,
  // VersionPublish  POST /public/v1/agents/:agentId/versions/:versionId/publish  ->  client.agents.versions.publish()
  Expect<
    Equals<ResponseOf<"VersionPublish">, MethodResult<NexusClient["agents"]["versions"]["publish"]>>
  >,
  // ToolDiscoverySearch  GET /public/v1/tools/search  ->  client.tools.search()
  Expect<Equals<ResponseOf<"ToolDiscoverySearch">, MethodResult<NexusClient["tools"]["search"]>>>,
  // ToolDiscoveryGet  GET /public/v1/tools/:toolId  ->  client.tools.get()
  Expect<Equals<ResponseOf<"ToolDiscoveryGet">, MethodResult<NexusClient["tools"]["get"]>>>,
  // ToolDiscoveryCredentials  GET /public/v1/tools/:toolId/credentials  ->  client.tools.credentials()
  Expect<
    Equals<
      ResponseOf<"ToolDiscoveryCredentials">,
      MethodResult<NexusClient["tools"]["credentials"]>
    >
  >,
  // ToolDiscoveryResolveOptions  POST /public/v1/tools/:toolId/resolve-options  ->  client.tools.resolveOptions()
  Expect<
    Equals<
      ResponseOf<"ToolDiscoveryResolveOptions">,
      MethodResult<NexusClient["tools"]["resolveOptions"]>
    >
  >,
  // ToolDiscoverySkills  GET /public/v1/tools/skills  ->  client.tools.skills()
  Expect<Equals<ResponseOf<"ToolDiscoverySkills">, MethodResult<NexusClient["tools"]["skills"]>>>,
  // ToolDiscoveryTest  POST /public/v1/agents/:agentId/tools/:toolConfigId/test  ->  client.tools.test()
  Expect<Equals<ResponseOf<"ToolDiscoveryTest">, MethodResult<NexusClient["tools"]["test"]>>>,
  // SkillsListWorkflows  GET /public/v1/skills/workflows  ->  client.skills.listWorkflows()
  Expect<
    Equals<ResponseOf<"SkillsListWorkflows">, MethodResult<NexusClient["skills"]["listWorkflows"]>>
  >,
  // SkillsGetWorkflow  GET /public/v1/skills/workflows/:workflowId  ->  client.skills.getWorkflow()
  Expect<
    Equals<ResponseOf<"SkillsGetWorkflow">, MethodResult<NexusClient["skills"]["getWorkflow"]>>
  >,
  // SkillsListTasks  GET /public/v1/skills/tasks  ->  client.skills.listTasks()
  Expect<Equals<ResponseOf<"SkillsListTasks">, MethodResult<NexusClient["skills"]["listTasks"]>>>,
  // SkillsDeleteTask  DELETE /public/v1/skills/tasks/:taskId  ->  client.skills.deleteTask()
  Expect<Equals<ResponseOf<"SkillsDeleteTask">, MethodResult<NexusClient["skills"]["deleteTask"]>>>,
  // SkillsListCollections  GET /public/v1/skills/collections  ->  client.skills.listCollections()
  Expect<
    Equals<
      ResponseOf<"SkillsListCollections">,
      MethodResult<NexusClient["skills"]["listCollections"]>
    >
  >,
  // SkillsGetCollection  GET /public/v1/skills/collections/:collectionId  ->  client.skills.getCollection()
  Expect<
    Equals<ResponseOf<"SkillsGetCollection">, MethodResult<NexusClient["skills"]["getCollection"]>>
  >,
  // SkillsListDocumentTemplates  GET /public/v1/skills/document-templates  ->  client.skills.listDocumentTemplates()
  Expect<
    Equals<
      ResponseOf<"SkillsListDocumentTemplates">,
      MethodResult<NexusClient["skills"]["listDocumentTemplates"]>
    >
  >,
  // SkillsGetDocumentTemplate  GET /public/v1/skills/document-templates/:templateId  ->  client.skills.getDocumentTemplate()
  Expect<
    Equals<
      ResponseOf<"SkillsGetDocumentTemplate">,
      MethodResult<NexusClient["skills"]["getDocumentTemplate"]>
    >
  >,
  // SkillsCreateDocumentTemplate  POST /public/v1/skills/document-templates  ->  client.skills.createDocumentTemplate()
  Expect<
    Equals<
      ResponseOf<"SkillsCreateDocumentTemplate">,
      MethodResult<NexusClient["skills"]["createDocumentTemplate"]>
    >
  >,
  // SkillsUploadDocumentTemplateFile  POST /public/v1/skills/document-templates/:templateId/upload-file  ->  client.skills.uploadDocumentTemplateFile()
  Expect<
    Equals<
      ResponseOf<"SkillsUploadDocumentTemplateFile">,
      MethodResult<NexusClient["skills"]["uploadDocumentTemplateFile"]>
    >
  >,
  // SkillsCreateCollection  POST /public/v1/skills/collections  ->  client.skills.createCollection()
  Expect<
    Equals<
      ResponseOf<"SkillsCreateCollection">,
      MethodResult<NexusClient["skills"]["createCollection"]>
    >
  >,
  // SkillsGenerateDocumentTemplate  POST /public/v1/skills/document-templates/:templateId/generate  ->  client.skills.generateDocumentTemplate()
  Expect<
    Equals<
      ResponseOf<"SkillsGenerateDocumentTemplate">,
      MethodResult<NexusClient["skills"]["generateDocumentTemplate"]>
    >
  >,
  // SkillsExecuteTask  POST /public/v1/skills/tasks/:taskId/execute  ->  client.skills.executeTask()
  Expect<
    Equals<ResponseOf<"SkillsExecuteTask">, MethodResult<NexusClient["skills"]["executeTask"]>>
  >,
  // SkillsAttachCollectionDocuments  POST /public/v1/skills/collections/:collectionId/documents  ->  client.skills.attachDocumentsToCollection()
  Expect<
    Equals<
      ResponseOf<"SkillsAttachCollectionDocuments">,
      MethodResult<NexusClient["skills"]["attachDocumentsToCollection"]>
    >
  >,
  // SkillsUploadExternalToolIcon  POST /public/v1/skills/external-tools/:externalToolId/upload-icon  ->  client.skills.uploadExternalToolIcon()
  Expect<
    Equals<
      ResponseOf<"SkillsUploadExternalToolIcon">,
      MethodResult<NexusClient["skills"]["uploadExternalToolIcon"]>
    >
  >,
  // SkillsGetCollectionStatistics  GET /public/v1/skills/collections/:collectionId/statistics  ->  client.skills.getCollectionStatistics()
  Expect<
    Equals<
      ResponseOf<"SkillsGetCollectionStatistics">,
      MethodResult<NexusClient["skills"]["getCollectionStatistics"]>
    >
  >,
  // SkillsSearchCollection  POST /public/v1/skills/collections/:collectionId/search  ->  client.skills.searchCollection()
  Expect<
    Equals<
      ResponseOf<"SkillsSearchCollection">,
      MethodResult<NexusClient["skills"]["searchCollection"]>
    >
  >,
  // SkillsQueryCollection  POST /public/v1/skills/collections/:collectionId/query  ->  client.skills.queryCollection()
  Expect<
    Equals<
      ResponseOf<"SkillsQueryCollection">,
      MethodResult<NexusClient["skills"]["queryCollection"]>
    >
  >,
  // SkillsSearchMultipleCollections  POST /public/v1/skills/collections/search  ->  client.skills.searchMultipleCollections()
  Expect<
    Equals<
      ResponseOf<"SkillsSearchMultipleCollections">,
      MethodResult<NexusClient["skills"]["searchMultipleCollections"]>
    >
  >,
  // SkillsUpdateCollection  PATCH /public/v1/skills/collections/:collectionId  ->  client.skills.updateCollection()
  Expect<
    Equals<
      ResponseOf<"SkillsUpdateCollection">,
      MethodResult<NexusClient["skills"]["updateCollection"]>
    >
  >,
  // SkillsListExternalTools  GET /public/v1/skills/external-tools  ->  client.skills.listExternalTools()
  Expect<
    Equals<
      ResponseOf<"SkillsListExternalTools">,
      MethodResult<NexusClient["skills"]["listExternalTools"]>
    >
  >,
  // SkillsGetExternalTool  GET /public/v1/skills/external-tools/:externalToolId  ->  client.skills.getExternalTool()
  Expect<
    Equals<
      ResponseOf<"SkillsGetExternalTool">,
      MethodResult<NexusClient["skills"]["getExternalTool"]>
    >
  >,
  // SkillsCreateExternalTool  POST /public/v1/skills/external-tools  ->  client.skills.createExternalTool()
  Expect<
    Equals<
      ResponseOf<"SkillsCreateExternalTool">,
      MethodResult<NexusClient["skills"]["createExternalTool"]>
    >
  >,
  // SkillsUpdateExternalTool  PATCH /public/v1/skills/external-tools/:externalToolId  ->  client.skills.updateExternalToolAuth()
  Expect<
    Equals<
      ResponseOf<"SkillsUpdateExternalTool">,
      MethodResult<NexusClient["skills"]["updateExternalToolAuth"]>
    >
  >,
  // SkillsDeleteExternalTool  DELETE /public/v1/skills/external-tools/:externalToolId  ->  client.skills.deleteExternalTool()
  Expect<
    Equals<
      ResponseOf<"SkillsDeleteExternalTool">,
      MethodResult<NexusClient["skills"]["deleteExternalTool"]>
    >
  >,
  // SkillsTestExternalTool  POST /public/v1/skills/external-tools/:externalToolId/test  ->  client.skills.testExternalTool()
  Expect<
    Equals<
      ResponseOf<"SkillsTestExternalTool">,
      MethodResult<NexusClient["skills"]["testExternalTool"]>
    >
  >,
  // DocumentGet  GET /public/v1/documents/:documentId  ->  client.documents.get()
  Expect<Equals<ResponseOf<"DocumentGet">, MethodResult<NexusClient["documents"]["get"]>>>,
  // DocumentUploadFile  POST /public/v1/documents/file  ->  client.documents.uploadFile()
  Expect<
    Equals<ResponseOf<"DocumentUploadFile">, MethodResult<NexusClient["documents"]["uploadFile"]>>
  >,
  // DocumentCreateText  POST /public/v1/documents/text  ->  client.documents.createText()
  Expect<
    Equals<ResponseOf<"DocumentCreateText">, MethodResult<NexusClient["documents"]["createText"]>>
  >,
  // DocumentAddWebsite  POST /public/v1/documents/website  ->  client.documents.addWebsite()
  Expect<
    Equals<ResponseOf<"DocumentAddWebsite">, MethodResult<NexusClient["documents"]["addWebsite"]>>
  >,
  // DocumentCreateGoogleSheet  POST /public/v1/documents/google-sheet  ->  client.documents.createGoogleSheet()
  Expect<
    Equals<
      ResponseOf<"DocumentCreateGoogleSheet">,
      MethodResult<NexusClient["documents"]["createGoogleSheet"]>
    >
  >,
  // DocumentCreateFolder  POST /public/v1/documents/folder  ->  client.documents.createFolder()
  Expect<
    Equals<
      ResponseOf<"DocumentCreateFolder">,
      MethodResult<NexusClient["documents"]["createFolder"]>
    >
  >,
  // DocumentDownload  GET /public/v1/documents/:documentId/download  ->  client.documents.getDownloadUrl()
  Expect<
    Equals<ResponseOf<"DocumentDownload">, MethodResult<NexusClient["documents"]["getDownloadUrl"]>>
  >,
  // DocumentPreview  GET /public/v1/documents/:documentId/preview  ->  client.documents.getPreviewUrl()
  Expect<
    Equals<ResponseOf<"DocumentPreview">, MethodResult<NexusClient["documents"]["getPreviewUrl"]>>
  >,
  // DocumentUpdate  PATCH /public/v1/documents/:documentId  ->  client.documents.update()
  Expect<Equals<ResponseOf<"DocumentUpdate">, MethodResult<NexusClient["documents"]["update"]>>>,
  // DocumentReprocess  POST /public/v1/documents/:documentId/reprocess  ->  client.documents.reprocess()
  Expect<
    Equals<ResponseOf<"DocumentReprocess">, MethodResult<NexusClient["documents"]["reprocess"]>>
  >,
  // TicketCreate  POST /public/v1/tickets  ->  client.tickets.create()
  Expect<Equals<ResponseOf<"TicketCreate">, MethodResult<NexusClient["tickets"]["create"]>>>,
  // TicketGet  GET /public/v1/tickets/:ticketId  ->  client.tickets.get()
  Expect<Equals<ResponseOf<"TicketGet">, MethodResult<NexusClient["tickets"]["get"]>>>,
  // TicketUpdate  PATCH /public/v1/tickets/:ticketId  ->  client.tickets.update()
  Expect<Equals<ResponseOf<"TicketUpdate">, MethodResult<NexusClient["tickets"]["update"]>>>,
  // TicketAddComment  POST /public/v1/tickets/:ticketId/comments  ->  client.tickets.addComment()
  Expect<
    Equals<ResponseOf<"TicketAddComment">, MethodResult<NexusClient["tickets"]["addComment"]>>
  >,
  // TicketListComments  GET /public/v1/tickets/:ticketId/comments  ->  client.tickets.listComments()
  Expect<
    Equals<ResponseOf<"TicketListComments">, MethodResult<NexusClient["tickets"]["listComments"]>>
  >,
  // TicketUploadAttachment  POST /public/v1/tickets/:ticketId/attachments  ->  client.tickets.uploadAttachment()
  Expect<
    Equals<
      ResponseOf<"TicketUploadAttachment">,
      MethodResult<NexusClient["tickets"]["uploadAttachment"]>
    >
  >,
  // TicketListAttachments  GET /public/v1/tickets/:ticketId/attachments  ->  client.tickets.listAttachments()
  Expect<
    Equals<
      ResponseOf<"TicketListAttachments">,
      MethodResult<NexusClient["tickets"]["listAttachments"]>
    >
  >,
  // CredentialList  GET /public/v1/credentials  ->  client.credentials.list()  [paged]
  Expect<
    Equals<
      ResponseOf<"CredentialList">,
      PageItems<MethodResult<NexusClient["credentials"]["list"]>>
    >
  >,
  // CredentialGet  GET /public/v1/credentials/:credentialId  ->  client.credentials.get()
  Expect<Equals<ResponseOf<"CredentialGet">, MethodResult<NexusClient["credentials"]["get"]>>>,
  // CredentialUpdate  PATCH /public/v1/credentials/:credentialId  ->  client.credentials.update()
  Expect<
    Equals<ResponseOf<"CredentialUpdate">, MethodResult<NexusClient["credentials"]["update"]>>
  >,
  // CredentialDelete  DELETE /public/v1/credentials/:credentialId  ->  client.credentials.delete()
  Expect<
    Equals<ResponseOf<"CredentialDelete">, MethodResult<NexusClient["credentials"]["delete"]>>
  >,
  // ApiKeyConnectionCreate  POST /public/v1/api-key-connections  ->  client.apiKeyConnections.create()
  Expect<
    Equals<
      ResponseOf<"ApiKeyConnectionCreate">,
      MethodResult<NexusClient["apiKeyConnections"]["create"]>
    >
  >,
  // AccessCardListByCredential  GET /public/v1/credentials/:credentialId/cards  ->  client.credentials.cards.listByCredential()
  Expect<
    Equals<
      ResponseOf<"AccessCardListByCredential">,
      MethodResult<NexusClient["credentials"]["cards"]["listByCredential"]>
    >
  >,
  // AccessCardCreate  POST /public/v1/credentials/:credentialId/cards  ->  client.credentials.cards.create()
  Expect<
    Equals<
      ResponseOf<"AccessCardCreate">,
      MethodResult<NexusClient["credentials"]["cards"]["create"]>
    >
  >,
  // AccessCardGet  GET /public/v1/access-cards/:accessCardId  ->  client.credentials.cards.get()
  Expect<
    Equals<ResponseOf<"AccessCardGet">, MethodResult<NexusClient["credentials"]["cards"]["get"]>>
  >,
  // AccessCardUpdate  PATCH /public/v1/access-cards/:accessCardId  ->  client.credentials.cards.update()
  Expect<
    Equals<
      ResponseOf<"AccessCardUpdate">,
      MethodResult<NexusClient["credentials"]["cards"]["update"]>
    >
  >,
  // AccessCardDelete  DELETE /public/v1/access-cards/:accessCardId  ->  client.credentials.cards.delete()
  Expect<
    Equals<
      ResponseOf<"AccessCardDelete">,
      MethodResult<NexusClient["credentials"]["cards"]["delete"]>
    >
  >,
  // AssetUpload  POST /public/v1/assets  ->  client.assets.upload()
  Expect<Equals<ResponseOf<"AssetUpload">, MethodResult<NexusClient["assets"]["upload"]>>>,
  // AssetGet  GET /public/v1/assets/:assetId  ->  client.assets.get()
  Expect<Equals<ResponseOf<"AssetGet">, MethodResult<NexusClient["assets"]["get"]>>>,
  // AssetDelete  DELETE /public/v1/assets/:assetId  ->  client.assets.delete()
  Expect<Equals<ResponseOf<"AssetDelete">, MethodResult<NexusClient["assets"]["delete"]>>>,
  // ConversationList  GET /public/v1/conversations  ->  client.conversations.list()  [paged]
  Expect<
    Equals<
      ResponseOf<"ConversationList">,
      PageItems<MethodResult<NexusClient["conversations"]["list"]>>
    >
  >,
  // ConversationSearch  GET /public/v1/conversations/search  ->  client.conversations.search()
  Expect<
    Equals<ResponseOf<"ConversationSearch">, MethodResult<NexusClient["conversations"]["search"]>>
  >,
  // ConversationListComments  GET /public/v1/conversations/:conversationId/comments  ->  client.conversations.getComments()
  Expect<
    Equals<
      ResponseOf<"ConversationListComments">,
      MethodResult<NexusClient["conversations"]["getComments"]>
    >
  >,
  // ConversationGetMetadata  GET /public/v1/conversations/:conversationId/metadata  ->  client.conversations.getMetadata()
  Expect<
    Equals<
      ResponseOf<"ConversationGetMetadata">,
      MethodResult<NexusClient["conversations"]["getMetadata"]>
    >
  >,
  // ConversationAddComment  POST /public/v1/conversations/:conversationId/comments  ->  client.conversations.addComment()
  Expect<
    Equals<
      ResponseOf<"ConversationAddComment">,
      MethodResult<NexusClient["conversations"]["addComment"]>
    >
  >,
  // ConversationMarkAsRead  POST /public/v1/conversations/:conversationId/mark-as-read  ->  client.conversations.markAsRead()
  Expect<
    Equals<
      ResponseOf<"ConversationMarkAsRead">,
      MethodResult<NexusClient["conversations"]["markAsRead"]>
    >
  >,
  // ConversationClose  DELETE /public/v1/conversations/:conversationId  ->  client.conversations.close()
  Expect<
    Equals<ResponseOf<"ConversationClose">, MethodResult<NexusClient["conversations"]["close"]>>
  >,
  // EvaluationDatasetUpload  POST /public/v1/skills/tasks/:taskId/evaluations/:sessionId/dataset  ->  client.evaluations.uploadDataset()
  Expect<
    Equals<
      ResponseOf<"EvaluationDatasetUpload">,
      MethodResult<NexusClient["evaluations"]["uploadDataset"]>
    >
  >,
  // EvaluationDatasetAddRow  POST /public/v1/skills/tasks/:taskId/evaluations/:sessionId/dataset/rows  ->  client.evaluations.addDatasetRow()
  Expect<
    Equals<
      ResponseOf<"EvaluationDatasetAddRow">,
      MethodResult<NexusClient["evaluations"]["addDatasetRow"]>
    >
  >,
  // EvaluationExecute  POST /public/v1/skills/tasks/:taskId/evaluations/:sessionId/execute  ->  client.evaluations.execute()
  Expect<
    Equals<ResponseOf<"EvaluationExecute">, MethodResult<NexusClient["evaluations"]["execute"]>>
  >,
  // EvaluationJudge  POST /public/v1/skills/tasks/:taskId/evaluations/:sessionId/judge  ->  client.evaluations.judge()
  Expect<Equals<ResponseOf<"EvaluationJudge">, MethodResult<NexusClient["evaluations"]["judge"]>>>,
  // ChannelSetupGet  GET /public/v1/channels/setup  ->  client.channels.getSetupStatus()
  Expect<
    Equals<ResponseOf<"ChannelSetupGet">, MethodResult<NexusClient["channels"]["getSetupStatus"]>>
  >,
  // ChannelSetupAutoProvision  POST /public/v1/channels/setup  ->  client.channels.autoProvision()
  Expect<
    Equals<
      ResponseOf<"ChannelSetupAutoProvision">,
      MethodResult<NexusClient["channels"]["autoProvision"]>
    >
  >,
  // ChannelPhoneNumberSearchAvailable  GET /public/v1/channels/phone-numbers/available  ->  client.channels.searchAvailablePhoneNumbers()
  Expect<
    Equals<
      ResponseOf<"ChannelPhoneNumberSearchAvailable">,
      MethodResult<NexusClient["channels"]["searchAvailablePhoneNumbers"]>
    >
  >,
  // ChannelPhoneNumberBuy  POST /public/v1/channels/phone-numbers/buy  ->  client.channels.buyPhoneNumber()
  Expect<
    Equals<
      ResponseOf<"ChannelPhoneNumberBuy">,
      MethodResult<NexusClient["channels"]["buyPhoneNumber"]>
    >
  >,
  // ChannelPhoneNumberList  GET /public/v1/channels/phone-numbers  ->  client.channels.listPhoneNumbers()  [paged]
  Expect<
    Equals<
      ResponseOf<"ChannelPhoneNumberList">,
      PageItems<MethodResult<NexusClient["channels"]["listPhoneNumbers"]>>
    >
  >,
  // ChannelPhoneNumberGet  GET /public/v1/channels/phone-numbers/:phoneNumberId  ->  client.channels.getPhoneNumber()
  Expect<
    Equals<
      ResponseOf<"ChannelPhoneNumberGet">,
      MethodResult<NexusClient["channels"]["getPhoneNumber"]>
    >
  >,
  // DeploymentList  GET /public/v1/deployments  ->  client.deployments.list()  [paged]
  Expect<
    Equals<
      ResponseOf<"DeploymentList">,
      PageItems<MethodResult<NexusClient["deployments"]["list"]>>
    >
  >,
  // DeploymentCreate  POST /public/v1/deployments  ->  client.deployments.create()
  Expect<
    Equals<ResponseOf<"DeploymentCreate">, MethodResult<NexusClient["deployments"]["create"]>>
  >,
  // DeploymentGet  GET /public/v1/deployments/:deploymentId  ->  client.deployments.get()
  Expect<Equals<ResponseOf<"DeploymentGet">, MethodResult<NexusClient["deployments"]["get"]>>>,
  // DeploymentUpdate  PATCH /public/v1/deployments/:deploymentId  ->  client.deployments.update()
  Expect<
    Equals<ResponseOf<"DeploymentUpdate">, MethodResult<NexusClient["deployments"]["update"]>>
  >,
  // DeploymentStatistics  GET /public/v1/deployments/:deploymentId/statistics  ->  client.deployments.getStatistics()
  Expect<
    Equals<
      ResponseOf<"DeploymentStatistics">,
      MethodResult<NexusClient["deployments"]["getStatistics"]>
    >
  >,
  // DeploymentGetEmbedConfig  GET /public/v1/deployments/:deploymentId/embed-config  ->  client.deployments.getEmbedConfig()
  Expect<
    Equals<
      ResponseOf<"DeploymentGetEmbedConfig">,
      MethodResult<NexusClient["deployments"]["getEmbedConfig"]>
    >
  >,
  // DeploymentUpdateEmbedConfig  PATCH /public/v1/deployments/:deploymentId/embed-config  ->  client.deployments.updateEmbedConfig()
  Expect<
    Equals<
      ResponseOf<"DeploymentUpdateEmbedConfig">,
      MethodResult<NexusClient["deployments"]["updateEmbedConfig"]>
    >
  >,
  // DeploymentFolderList  GET /public/v1/deployment-folders  ->  client.deploymentFolders.list()
  Expect<
    Equals<
      ResponseOf<"DeploymentFolderList">,
      MethodResult<NexusClient["deploymentFolders"]["list"]>
    >
  >,
  // DeploymentFolderCreate  POST /public/v1/deployment-folders  ->  client.deploymentFolders.create()
  Expect<
    Equals<
      ResponseOf<"DeploymentFolderCreate">,
      MethodResult<NexusClient["deploymentFolders"]["create"]>
    >
  >,
  // DeploymentFolderUpdate  PATCH /public/v1/deployment-folders/:folderId  ->  client.deploymentFolders.update()
  Expect<
    Equals<
      ResponseOf<"DeploymentFolderUpdate">,
      MethodResult<NexusClient["deploymentFolders"]["update"]>
    >
  >,
  // DeploymentFolderDelete  DELETE /public/v1/deployment-folders/:folderId  ->  client.deploymentFolders.delete()
  Expect<
    Equals<
      ResponseOf<"DeploymentFolderDelete">,
      MethodResult<NexusClient["deploymentFolders"]["delete"]>
    >
  >,
  // DeploymentFolderAssign  POST /public/v1/deployment-folders/assign  ->  client.deploymentFolders.assign()
  Expect<
    Equals<
      ResponseOf<"DeploymentFolderAssign">,
      MethodResult<NexusClient["deploymentFolders"]["assign"]>
    >
  >,
  // PhoneNumberSearchAvailable  GET /public/v1/phone-numbers/available  ->  client.phoneNumbers.searchAvailable()
  Expect<
    Equals<
      ResponseOf<"PhoneNumberSearchAvailable">,
      MethodResult<NexusClient["phoneNumbers"]["searchAvailable"]>
    >
  >,
  // PhoneNumberBuy  POST /public/v1/phone-numbers/buy  ->  client.phoneNumbers.buy()
  Expect<Equals<ResponseOf<"PhoneNumberBuy">, MethodResult<NexusClient["phoneNumbers"]["buy"]>>>,
  // PhoneNumberList  GET /public/v1/phone-numbers  ->  client.phoneNumbers.list()  [paged]
  Expect<
    Equals<
      ResponseOf<"PhoneNumberList">,
      PageItems<MethodResult<NexusClient["phoneNumbers"]["list"]>>
    >
  >,
  // PhoneNumberGet  GET /public/v1/phone-numbers/:phoneNumberId  ->  client.phoneNumbers.get()
  Expect<Equals<ResponseOf<"PhoneNumberGet">, MethodResult<NexusClient["phoneNumbers"]["get"]>>>,
  // CustomerAddNote  POST /public/v1/customers/:id/notes  ->  client.customers.addNote()
  Expect<Equals<ResponseOf<"CustomerAddNote">, MethodResult<NexusClient["customers"]["addNote"]>>>,
  // WorkflowNodeCreate  POST /public/v1/workflows/:workflowId/nodes  ->  client.workflows.createNode()
  Expect<
    Equals<ResponseOf<"WorkflowNodeCreate">, MethodResult<NexusClient["workflows"]["createNode"]>>
  >,
  // WorkflowNodeGet  GET /public/v1/workflows/:workflowId/nodes/:nodeId  ->  client.workflows.getNode()
  Expect<Equals<ResponseOf<"WorkflowNodeGet">, MethodResult<NexusClient["workflows"]["getNode"]>>>,
  // WorkflowNodeUpdate  PATCH /public/v1/workflows/:workflowId/nodes/:nodeId  ->  client.workflows.updateNode()
  Expect<
    Equals<ResponseOf<"WorkflowNodeUpdate">, MethodResult<NexusClient["workflows"]["updateNode"]>>
  >,
  // WorkflowExecutionPollByToken  GET /public/v1/workflows/executions/poll/:pollingToken  ->  client.workflowExecutions.pollByToken()
  Expect<
    Equals<
      ResponseOf<"WorkflowExecutionPollByToken">,
      MethodResult<NexusClient["workflowExecutions"]["pollByToken"]>
    >
  >,
  // WorkflowExecutionPoll  GET /public/v1/workflows/executions/:executionId/poll  ->  client.workflowExecutions.poll()
  Expect<
    Equals<
      ResponseOf<"WorkflowExecutionPoll">,
      MethodResult<NexusClient["workflowExecutions"]["poll"]>
    >
  >,
  // WorkflowExecutionGet  GET /public/v1/workflows/executions/:executionId  ->  client.workflowExecutions.get()
  Expect<
    Equals<
      ResponseOf<"WorkflowExecutionGet">,
      MethodResult<NexusClient["workflowExecutions"]["get"]>
    >
  >,
  // WorkflowExecutionGetNodeResult  GET /public/v1/workflows/executions/:executionId/nodes/:nodeId  ->  client.workflowExecutions.getNodeResult()
  Expect<
    Equals<
      ResponseOf<"WorkflowExecutionGetNodeResult">,
      MethodResult<NexusClient["workflowExecutions"]["getNodeResult"]>
    >
  >,
  // WorkflowExecutionGetOutput  GET /public/v1/workflows/executions/:executionId/output  ->  client.workflowExecutions.getOutput()
  Expect<
    Equals<
      ResponseOf<"WorkflowExecutionGetOutput">,
      MethodResult<NexusClient["workflowExecutions"]["getOutput"]>
    >
  >,
  // WorkflowExecutionRetryNode  POST /public/v1/workflows/executions/:executionId/nodes/:nodeId/retry  ->  client.workflowExecutions.retryNode()
  Expect<
    Equals<
      ResponseOf<"WorkflowExecutionRetryNode">,
      MethodResult<NexusClient["workflowExecutions"]["retryNode"]>
    >
  >,
  // WorkflowExecutionCancel  POST /public/v1/workflows/executions/:executionId/cancel  ->  client.workflowExecutions.cancel()
  Expect<
    Equals<
      ResponseOf<"WorkflowExecutionCancel">,
      MethodResult<NexusClient["workflowExecutions"]["cancel"]>
    >
  >,
  // WorkflowExecutionExport  POST /public/v1/workflows/executions/:executionId/export  ->  client.workflowExecutions.export()
  Expect<
    Equals<
      ResponseOf<"WorkflowExecutionExport">,
      MethodResult<NexusClient["workflowExecutions"]["export"]>
    >
  >,
  // WorkflowBuilderListNodeTypes  GET /public/v1/workflows/node-types  ->  client.workflows.listNodeTypes()
  Expect<
    Equals<
      ResponseOf<"WorkflowBuilderListNodeTypes">,
      MethodResult<NexusClient["workflows"]["listNodeTypes"]>
    >
  >,
  // WorkflowBuilderGetNodeTypeSchema  GET /public/v1/workflows/node-types/:nodeType  ->  client.workflows.getNodeTypeSchema()
  Expect<
    Equals<
      ResponseOf<"WorkflowBuilderGetNodeTypeSchema">,
      MethodResult<NexusClient["workflows"]["getNodeTypeSchema"]>
    >
  >,
  // WorkflowBuilderListPlatformListenerEvents  GET /public/v1/workflows/platform-listener-events  ->  client.workflows.listPlatformListenerEvents()
  Expect<
    Equals<
      ResponseOf<"WorkflowBuilderListPlatformListenerEvents">,
      MethodResult<NexusClient["workflows"]["listPlatformListenerEvents"]>
    >
  >,
  // CloudImportBrowse  GET /public/v1/documents/imports/:provider/items  ->  client.cloudImports.browse()
  Expect<
    Equals<ResponseOf<"CloudImportBrowse">, MethodResult<NexusClient["cloudImports"]["browse"]>>
  >,
  // CloudImportSearch  GET /public/v1/documents/imports/:provider/search  ->  client.cloudImports.search()
  Expect<
    Equals<ResponseOf<"CloudImportSearch">, MethodResult<NexusClient["cloudImports"]["search"]>>
  >,
  // CloudImportItems  POST /public/v1/documents/imports/:provider/import  ->  client.cloudImports.import()
  Expect<
    Equals<ResponseOf<"CloudImportItems">, MethodResult<NexusClient["cloudImports"]["import"]>>
  >,
  // TracingListTraces  GET /public/v1/tracing/traces  ->  client.tracing.listTraces()  [paged]
  Expect<
    Equals<
      ResponseOf<"TracingListTraces">,
      PageItems<MethodResult<NexusClient["tracing"]["listTraces"]>>
    >
  >,
  // TracingGetTrace  GET /public/v1/tracing/traces/:traceId  ->  client.tracing.getTrace()
  Expect<Equals<ResponseOf<"TracingGetTrace">, MethodResult<NexusClient["tracing"]["getTrace"]>>>,
  // CueTranscriptsListConversations  GET /public/v1/cue/conversations  ->  client.cueTranscripts.listConversations()  [paged]
  Expect<
    Equals<
      ResponseOf<"CueTranscriptsListConversations">,
      PageItems<MethodResult<NexusClient["cueTranscripts"]["listConversations"]>>
    >
  >,
  // CueTranscriptsGetTranscript  GET /public/v1/cue/conversations/:conversationId/transcript  ->  client.cueTranscripts.getTranscript()
  Expect<
    Equals<
      ResponseOf<"CueTranscriptsGetTranscript">,
      MethodResult<NexusClient["cueTranscripts"]["getTranscript"]>
    >
  >,
  // TracingListGenerations  GET /public/v1/tracing/generations  ->  client.tracing.listGenerations()  [paged]
  Expect<
    Equals<
      ResponseOf<"TracingListGenerations">,
      PageItems<MethodResult<NexusClient["tracing"]["listGenerations"]>>
    >
  >,
  // TracingGetGeneration  GET /public/v1/tracing/generations/:generationId  ->  client.tracing.getGeneration()
  Expect<
    Equals<
      ResponseOf<"TracingGetGeneration">,
      MethodResult<NexusClient["tracing"]["getGeneration"]>
    >
  >,
  // TracingListModels  GET /public/v1/tracing/models  ->  client.tracing.listModels()
  Expect<
    Equals<ResponseOf<"TracingListModels">, MethodResult<NexusClient["tracing"]["listModels"]>>
  >,
  // TracingAnalyticsSummary  GET /public/v1/tracing/analytics/summary  ->  client.tracing.getSummary()
  Expect<
    Equals<
      ResponseOf<"TracingAnalyticsSummary">,
      MethodResult<NexusClient["tracing"]["getSummary"]>
    >
  >,
  // TracingAnalyticsCostBreakdown  GET /public/v1/tracing/analytics/cost-breakdown  ->  client.tracing.getCostBreakdown()
  Expect<
    Equals<
      ResponseOf<"TracingAnalyticsCostBreakdown">,
      MethodResult<NexusClient["tracing"]["getCostBreakdown"]>
    >
  >,
  // TracingAnalyticsTimeline  GET /public/v1/tracing/analytics/timeline  ->  client.tracing.getTimeline()
  Expect<
    Equals<
      ResponseOf<"TracingAnalyticsTimeline">,
      MethodResult<NexusClient["tracing"]["getTimeline"]>
    >
  >,
  // TracingExportTrace  POST /public/v1/tracing/traces/:traceId/export  ->  client.tracing.exportTrace()
  Expect<
    Equals<ResponseOf<"TracingExportTrace">, MethodResult<NexusClient["tracing"]["exportTrace"]>>
  >,
  // TracingExportBulk  POST /public/v1/tracing/export  ->  client.tracing.bulkExport()
  Expect<
    Equals<ResponseOf<"TracingExportBulk">, MethodResult<NexusClient["tracing"]["bulkExport"]>>
  >,
  // WorkspaceList  GET /public/v1/workspaces  ->  client.workspaces.list()
  Expect<Equals<ResponseOf<"WorkspaceList">, MethodResult<NexusClient["workspaces"]["list"]>>>,
  // WorkspaceCreate  POST /public/v1/workspaces  ->  client.workspaces.create()
  Expect<Equals<ResponseOf<"WorkspaceCreate">, MethodResult<NexusClient["workspaces"]["create"]>>>,
  // WorkspaceRename  PATCH /public/v1/workspaces/:slug  ->  client.workspaces.rename()
  Expect<Equals<ResponseOf<"WorkspaceRename">, MethodResult<NexusClient["workspaces"]["rename"]>>>,
  // WorkspaceGetFile  GET /public/v1/workspaces/:slug/file  ->  client.workspaces.getFileUrl()
  Expect<
    Equals<ResponseOf<"WorkspaceGetFile">, MethodResult<NexusClient["workspaces"]["getFileUrl"]>>
  >,
  // WorkspaceSearch  GET /public/v1/workspaces/:slug/search  ->  client.workspaces.search()
  Expect<Equals<ResponseOf<"WorkspaceSearch">, MethodResult<NexusClient["workspaces"]["search"]>>>,
  // WorkspaceRestore  POST /public/v1/workspaces/:slug/restore  ->  client.workspaces.restore()
  Expect<
    Equals<ResponseOf<"WorkspaceRestore">, MethodResult<NexusClient["workspaces"]["restore"]>>
  >,
  // AgentCollectionList  GET /public/v1/agents/:agentId/collections  ->  client.agentCollections.list()
  Expect<
    Equals<ResponseOf<"AgentCollectionList">, MethodResult<NexusClient["agentCollections"]["list"]>>
  >,
  // AgentCollectionAttach  POST /public/v1/agents/:agentId/collections  ->  client.agentCollections.attach()
  Expect<
    Equals<
      ResponseOf<"AgentCollectionAttach">,
      MethodResult<NexusClient["agentCollections"]["attach"]>
    >
  >,
  // AgentCollectionDetach  DELETE /public/v1/agents/:agentId/collections  ->  client.agentCollections.detach()
  Expect<
    Equals<
      ResponseOf<"AgentCollectionDetach">,
      MethodResult<NexusClient["agentCollections"]["detach"]>
    >
  >,
  // AgentSkillList  GET /public/v1/agents/:agentId/skills  ->  client.agents.skills.list()
  Expect<
    Equals<ResponseOf<"AgentSkillList">, MethodResult<NexusClient["agents"]["skills"]["list"]>>
  >,
  // AgentSkillCreate  POST /public/v1/agents/:agentId/skills  ->  client.agents.skills.create()
  Expect<
    Equals<ResponseOf<"AgentSkillCreate">, MethodResult<NexusClient["agents"]["skills"]["create"]>>
  >,
  // AgentSkillGet  GET /public/v1/agents/:agentId/skills/:skillId  ->  client.agents.skills.get()
  Expect<Equals<ResponseOf<"AgentSkillGet">, MethodResult<NexusClient["agents"]["skills"]["get"]>>>,
  // AgentSkillUpdate  PATCH /public/v1/agents/:agentId/skills/:skillId  ->  client.agents.skills.update()
  Expect<
    Equals<ResponseOf<"AgentSkillUpdate">, MethodResult<NexusClient["agents"]["skills"]["update"]>>
  >,
  // AgentSkillDelete  DELETE /public/v1/agents/:agentId/skills/:skillId  ->  client.agents.skills.delete()
  Expect<
    Equals<ResponseOf<"AgentSkillDelete">, MethodResult<NexusClient["agents"]["skills"]["delete"]>>
  >,
  // AgentSkillUpload  POST /public/v1/agents/:agentId/skills/:skillId/upload  ->  client.agents.skills.uploadZip()
  Expect<
    Equals<
      ResponseOf<"AgentSkillUpload">,
      MethodResult<NexusClient["agents"]["skills"]["uploadZip"]>
    >
  >,
  // AgentSkillDownloadUrl  GET /public/v1/agents/:agentId/skills/:skillId/download  ->  client.agents.skills.getDownloadUrl()
  Expect<
    Equals<
      ResponseOf<"AgentSkillDownloadUrl">,
      MethodResult<NexusClient["agents"]["skills"]["getDownloadUrl"]>
    >
  >,
  // AnalyticsOverview  GET /public/v1/analytics/overview  ->  client.analytics.getOverview()
  Expect<
    Equals<ResponseOf<"AnalyticsOverview">, MethodResult<NexusClient["analytics"]["getOverview"]>>
  >,
  // AnalyticsFeedback  GET /public/v1/analytics/feedback  ->  client.analytics.listFeedback()  [paged]
  Expect<
    Equals<
      ResponseOf<"AnalyticsFeedback">,
      PageItems<MethodResult<NexusClient["analytics"]["listFeedback"]>>
    >
  >,
  // AnalyticsQuery  POST /public/v1/analytics/query  ->  client.analytics.query()
  Expect<Equals<ResponseOf<"AnalyticsQuery">, MethodResult<NexusClient["analytics"]["query"]>>>,
  // AnalyticsQueryStructured  POST /public/v1/analytics/query/structured  ->  client.analytics.queryStructured()
  Expect<
    Equals<
      ResponseOf<"AnalyticsQueryStructured">,
      MethodResult<NexusClient["analytics"]["queryStructured"]>
    >
  >,
  // CustomModelList  GET /public/v1/custom-models  ->  client.customModels.list()
  Expect<Equals<ResponseOf<"CustomModelList">, MethodResult<NexusClient["customModels"]["list"]>>>,
  // CustomModelCreate  POST /public/v1/custom-models  ->  client.customModels.create()
  Expect<
    Equals<ResponseOf<"CustomModelCreate">, MethodResult<NexusClient["customModels"]["create"]>>
  >,
  // CustomModelGet  GET /public/v1/custom-models/:customModelId  ->  client.customModels.get()
  Expect<Equals<ResponseOf<"CustomModelGet">, MethodResult<NexusClient["customModels"]["get"]>>>,
  // CustomModelUpdate  PATCH /public/v1/custom-models/:customModelId  ->  client.customModels.update()
  Expect<
    Equals<ResponseOf<"CustomModelUpdate">, MethodResult<NexusClient["customModels"]["update"]>>
  >,
  // DocsSearch  POST /public/v1/docs/search  ->  client.docs.search()
  Expect<Equals<ResponseOf<"DocsSearch">, MethodResult<NexusClient["docs"]["search"]>>>,
  // DocumentTemplateFolderList  GET /public/v1/document-template-folders  ->  client.documentTemplateFolders.list()
  Expect<
    Equals<
      ResponseOf<"DocumentTemplateFolderList">,
      MethodResult<NexusClient["documentTemplateFolders"]["list"]>
    >
  >,
  // DocumentTemplateFolderCreate  POST /public/v1/document-template-folders  ->  client.documentTemplateFolders.create()
  Expect<
    Equals<
      ResponseOf<"DocumentTemplateFolderCreate">,
      MethodResult<NexusClient["documentTemplateFolders"]["create"]>
    >
  >,
  // DocumentTemplateFolderUpdate  PATCH /public/v1/document-template-folders/:folderId  ->  client.documentTemplateFolders.update()
  Expect<
    Equals<
      ResponseOf<"DocumentTemplateFolderUpdate">,
      MethodResult<NexusClient["documentTemplateFolders"]["update"]>
    >
  >,
  // DocumentTemplateFolderDelete  DELETE /public/v1/document-template-folders/:folderId  ->  client.documentTemplateFolders.delete()
  Expect<
    Equals<
      ResponseOf<"DocumentTemplateFolderDelete">,
      MethodResult<NexusClient["documentTemplateFolders"]["delete"]>
    >
  >,
  // DocumentTemplateFolderAssign  POST /public/v1/document-template-folders/assign  ->  client.documentTemplateFolders.assign()
  Expect<
    Equals<
      ResponseOf<"DocumentTemplateFolderAssign">,
      MethodResult<NexusClient["documentTemplateFolders"]["assign"]>
    >
  >,
  // HtmlMessageTemplateDelete  DELETE /public/v1/html-message-templates/:templateId  ->  client.htmlMessageTemplates.delete()
  Expect<
    Equals<
      ResponseOf<"HtmlMessageTemplateDelete">,
      MethodResult<NexusClient["htmlMessageTemplates"]["delete"]>
    >
  >,
  // HtmlMessageTemplateRender  POST /public/v1/html-message-templates/:templateId/render  ->  client.htmlMessageTemplates.render()
  Expect<
    Equals<
      ResponseOf<"HtmlMessageTemplateRender">,
      MethodResult<NexusClient["htmlMessageTemplates"]["render"]>
    >
  >,
  // HtmlMessageTemplateFill  POST /public/v1/html-message-templates/:templateId/fill  ->  client.htmlMessageTemplates.fill()
  Expect<
    Equals<
      ResponseOf<"HtmlMessageTemplateFill">,
      MethodResult<NexusClient["htmlMessageTemplates"]["fill"]>
    >
  >,
  // KnownIssuesForRoute  GET /public/v1/known-issues  ->  client.knownIssues.forRoute()
  Expect<
    Equals<ResponseOf<"KnownIssuesForRoute">, MethodResult<NexusClient["knownIssues"]["forRoute"]>>
  >,
  // PromptAssistantChat  POST /public/v1/prompt-assistant/chat  ->  client.promptAssistant.chat()
  Expect<
    Equals<ResponseOf<"PromptAssistantChat">, MethodResult<NexusClient["promptAssistant"]["chat"]>>
  >,
  // PromptAssistantListThreads  GET /public/v1/prompt-assistant/threads  ->  client.promptAssistant.listThreads()  [paged]
  Expect<
    Equals<
      ResponseOf<"PromptAssistantListThreads">,
      PageItems<MethodResult<NexusClient["promptAssistant"]["listThreads"]>>
    >
  >,
  // SkillFolderList  GET /public/v1/skill-folders  ->  client.skillFolders.list()
  Expect<Equals<ResponseOf<"SkillFolderList">, MethodResult<NexusClient["skillFolders"]["list"]>>>,
  // SkillFolderCreate  POST /public/v1/skill-folders  ->  client.skillFolders.create()
  Expect<
    Equals<ResponseOf<"SkillFolderCreate">, MethodResult<NexusClient["skillFolders"]["create"]>>
  >,
  // SkillFolderUpdate  PATCH /public/v1/skill-folders/:folderId  ->  client.skillFolders.update()
  Expect<
    Equals<ResponseOf<"SkillFolderUpdate">, MethodResult<NexusClient["skillFolders"]["update"]>>
  >,
  // SkillFolderDelete  DELETE /public/v1/skill-folders/:folderId  ->  client.skillFolders.delete()
  Expect<
    Equals<ResponseOf<"SkillFolderDelete">, MethodResult<NexusClient["skillFolders"]["delete"]>>
  >,
  // SkillFolderAssign  POST /public/v1/skill-folders/assign  ->  client.skillFolders.assign()
  Expect<
    Equals<ResponseOf<"SkillFolderAssign">, MethodResult<NexusClient["skillFolders"]["assign"]>>
  >,
  // ToolConnectionGetHandshakeStatus  GET /public/v1/tools/connect/:handshakeId/status  ->  client.toolConnection.pollStatus()
  Expect<
    Equals<
      ResponseOf<"ToolConnectionGetHandshakeStatus">,
      MethodResult<NexusClient["toolConnection"]["pollStatus"]>
    >
  >,
  // PermissionsListResourceAccess  GET /public/v1/permissions/:resourceType/:resourceId/access  ->  client.permissions.listResourceAccess()
  Expect<
    Equals<
      ResponseOf<"PermissionsListResourceAccess">,
      MethodResult<NexusClient["permissions"]["listResourceAccess"]>
    >
  >,
  // PermissionsGrant  POST /public/v1/permissions/grant  ->  client.permissions.grant()
  Expect<Equals<ResponseOf<"PermissionsGrant">, MethodResult<NexusClient["permissions"]["grant"]>>>,
  // PermissionsRevoke  POST /public/v1/permissions/revoke  ->  client.permissions.revoke()
  Expect<
    Equals<ResponseOf<"PermissionsRevoke">, MethodResult<NexusClient["permissions"]["revoke"]>>
  >,
  // PermissionsGetOrgSettings  GET /public/v1/permissions/org-settings  ->  client.permissions.getOrgSettings()
  Expect<
    Equals<
      ResponseOf<"PermissionsGetOrgSettings">,
      MethodResult<NexusClient["permissions"]["getOrgSettings"]>
    >
  >,
  // PermissionsUpdateResourceTypeVisibility  PATCH /public/v1/permissions/org-settings/resource-type  ->  client.permissions.updateResourceTypeVisibility()
  Expect<
    Equals<
      ResponseOf<"PermissionsUpdateResourceTypeVisibility">,
      MethodResult<NexusClient["permissions"]["updateResourceTypeVisibility"]>
    >
  >,
  // UserGroupsList  GET /public/v1/user-groups  ->  client.userGroups.list()
  Expect<Equals<ResponseOf<"UserGroupsList">, MethodResult<NexusClient["userGroups"]["list"]>>>,
  // UserGroupsCreate  POST /public/v1/user-groups  ->  client.userGroups.create()
  Expect<Equals<ResponseOf<"UserGroupsCreate">, MethodResult<NexusClient["userGroups"]["create"]>>>,
  // UserGroupsUpdate  PUT /public/v1/user-groups/:userGroupId  ->  client.userGroups.update()
  Expect<Equals<ResponseOf<"UserGroupsUpdate">, MethodResult<NexusClient["userGroups"]["update"]>>>,
  // UserGroupsDelete  DELETE /public/v1/user-groups/:userGroupId  ->  client.userGroups.delete()
  Expect<Equals<ResponseOf<"UserGroupsDelete">, MethodResult<NexusClient["userGroups"]["delete"]>>>,
  // UserGroupsAddMember  POST /public/v1/user-groups/:userGroupId/members/add  ->  client.userGroups.addMember()
  Expect<
    Equals<ResponseOf<"UserGroupsAddMember">, MethodResult<NexusClient["userGroups"]["addMember"]>>
  >,
  // UserGroupsRemoveMember  POST /public/v1/user-groups/:userGroupId/members/remove  ->  client.userGroups.removeMember()
  Expect<
    Equals<
      ResponseOf<"UserGroupsRemoveMember">,
      MethodResult<NexusClient["userGroups"]["removeMember"]>
    >
  >,
  // RolesList  GET /public/v1/roles  ->  client.roles.list()
  Expect<Equals<ResponseOf<"RolesList">, MethodResult<NexusClient["roles"]["list"]>>>,
  // RolesGet  GET /public/v1/roles/:roleId  ->  client.roles.get()
  Expect<Equals<ResponseOf<"RolesGet">, MethodResult<NexusClient["roles"]["get"]>>>,
  // RolesListResources  GET /public/v1/roles/:roleId/resources  ->  client.roles.listSystems()
  Expect<
    Equals<ResponseOf<"RolesListResources">, MethodResult<NexusClient["roles"]["listSystems"]>>
  >,
  // RolesListMembers  GET /public/v1/roles/:roleId/members  ->  client.roles.listMembers()
  Expect<Equals<ResponseOf<"RolesListMembers">, MethodResult<NexusClient["roles"]["listMembers"]>>>,
  // RolesListPermissionSets  GET /public/v1/roles/:roleId/permission-sets  ->  client.roles.listPermissionSets()
  Expect<
    Equals<
      ResponseOf<"RolesListPermissionSets">,
      MethodResult<NexusClient["roles"]["listPermissionSets"]>
    >
  >,
  // RolesListCollectionGrants  GET /public/v1/roles/:roleId/collection-grants  ->  client.roles.listCollectionGrants()
  Expect<
    Equals<
      ResponseOf<"RolesListCollectionGrants">,
      MethodResult<NexusClient["roles"]["listCollectionGrants"]>
    >
  >,
  // RolesListWorkspaceGrants  GET /public/v1/roles/:roleId/workspace-grants  ->  client.roles.listWorkspaceGrants()
  Expect<
    Equals<
      ResponseOf<"RolesListWorkspaceGrants">,
      MethodResult<NexusClient["roles"]["listWorkspaceGrants"]>
    >
  >,
  // RolesListAccessRequests  GET /public/v1/roles/:roleId/access-requests  ->  client.roles.listAccessRequests()
  Expect<
    Equals<
      ResponseOf<"RolesListAccessRequests">,
      MethodResult<NexusClient["roles"]["listAccessRequests"]>
    >
  >,
  // RolesListBoards  GET /public/v1/roles/:roleId/boards  ->  client.roles.listBoards()
  Expect<Equals<ResponseOf<"RolesListBoards">, MethodResult<NexusClient["roles"]["listBoards"]>>>,
  // RolesCreateBoard  POST /public/v1/roles/:roleId/boards  ->  client.roles.createBoard()
  Expect<Equals<ResponseOf<"RolesCreateBoard">, MethodResult<NexusClient["roles"]["createBoard"]>>>,
  // RolesReorderBoards  PUT /public/v1/roles/:roleId/boards  ->  client.roles.reorderBoards()
  Expect<
    Equals<ResponseOf<"RolesReorderBoards">, MethodResult<NexusClient["roles"]["reorderBoards"]>>
  >,
  // RolesUpdateBoard  PATCH /public/v1/roles/:roleId/boards/:boardId  ->  client.roles.updateBoard()
  Expect<Equals<ResponseOf<"RolesUpdateBoard">, MethodResult<NexusClient["roles"]["updateBoard"]>>>,
  // RolesDeleteBoard  DELETE /public/v1/roles/:roleId/boards/:boardId  ->  client.roles.deleteBoard()
  Expect<Equals<ResponseOf<"RolesDeleteBoard">, MethodResult<NexusClient["roles"]["deleteBoard"]>>>,
  // RolesMoveBoardCard  PATCH /public/v1/roles/:roleId/cards/:cardType/:cardId  ->  client.roles.moveBoardCard()
  Expect<
    Equals<ResponseOf<"RolesMoveBoardCard">, MethodResult<NexusClient["roles"]["moveBoardCard"]>>
  >,
  // RolesGetCoverage  GET /public/v1/roles/:roleId/coverage  ->  client.roles.getCoverage()
  Expect<Equals<ResponseOf<"RolesGetCoverage">, MethodResult<NexusClient["roles"]["getCoverage"]>>>,
  // RoleJobTypesList  GET /public/v1/role-job-types  ->  client.roles.listJobTypes()
  Expect<
    Equals<ResponseOf<"RoleJobTypesList">, MethodResult<NexusClient["roles"]["listJobTypes"]>>
  >,
  // RolesCreateCollectionGrant  POST /public/v1/roles/:roleId/collection-grants  ->  client.roles.grantCollection()
  Expect<
    Equals<
      ResponseOf<"RolesCreateCollectionGrant">,
      MethodResult<NexusClient["roles"]["grantCollection"]>
    >
  >,
  // RolesDeleteCollectionGrant  DELETE /public/v1/roles/:roleId/collection-grants/:grantId  ->  client.roles.revokeCollection()
  Expect<
    Equals<
      ResponseOf<"RolesDeleteCollectionGrant">,
      MethodResult<NexusClient["roles"]["revokeCollection"]>
    >
  >,
  // RolesCreateWorkspaceGrant  POST /public/v1/roles/:roleId/workspace-grants  ->  client.roles.grantWorkspace()
  Expect<
    Equals<
      ResponseOf<"RolesCreateWorkspaceGrant">,
      MethodResult<NexusClient["roles"]["grantWorkspace"]>
    >
  >,
  // RolesDeleteWorkspaceGrant  DELETE /public/v1/roles/:roleId/workspace-grants/:grantId  ->  client.roles.revokeWorkspace()
  Expect<
    Equals<
      ResponseOf<"RolesDeleteWorkspaceGrant">,
      MethodResult<NexusClient["roles"]["revokeWorkspace"]>
    >
  >,
  // RolesCreatePermissionSet  POST /public/v1/roles/:roleId/permission-sets  ->  client.roles.createPermissionSet()
  Expect<
    Equals<
      ResponseOf<"RolesCreatePermissionSet">,
      MethodResult<NexusClient["roles"]["createPermissionSet"]>
    >
  >,
  // RolesUpdatePermissionSet  PATCH /public/v1/roles/:roleId/permission-sets/:permissionSetId  ->  client.roles.updatePermissionSet()
  Expect<
    Equals<
      ResponseOf<"RolesUpdatePermissionSet">,
      MethodResult<NexusClient["roles"]["updatePermissionSet"]>
    >
  >,
  // RolesDeletePermissionSet  DELETE /public/v1/roles/:roleId/permission-sets/:permissionSetId  ->  client.roles.deletePermissionSet()
  Expect<
    Equals<
      ResponseOf<"RolesDeletePermissionSet">,
      MethodResult<NexusClient["roles"]["deletePermissionSet"]>
    >
  >,
  // RoleAccessRequestsCreate  POST /public/v1/roles/:roleId/access-requests  ->  client.roles.createAccessRequest()
  Expect<
    Equals<
      ResponseOf<"RoleAccessRequestsCreate">,
      MethodResult<NexusClient["roles"]["createAccessRequest"]>
    >
  >,
  // RoleAccessRequestsReview  PATCH /public/v1/roles/:roleId/access-requests/:requestId  ->  client.roles.reviewAccessRequest()
  Expect<
    Equals<
      ResponseOf<"RoleAccessRequestsReview">,
      MethodResult<NexusClient["roles"]["reviewAccessRequest"]>
    >
  >,
  // RoleCreationRequestsList  GET /public/v1/role-creation-requests  ->  client.roles.listCreationRequests()
  Expect<
    Equals<
      ResponseOf<"RoleCreationRequestsList">,
      MethodResult<NexusClient["roles"]["listCreationRequests"]>
    >
  >,
  // RoleCreationRequestsGet  GET /public/v1/role-creation-requests/:requestId  ->  client.roles.getCreationRequest()
  Expect<
    Equals<
      ResponseOf<"RoleCreationRequestsGet">,
      MethodResult<NexusClient["roles"]["getCreationRequest"]>
    >
  >,
  // RoleCreationRequestsReview  PATCH /public/v1/role-creation-requests/:requestId  ->  client.roles.reviewCreationRequest()
  Expect<
    Equals<
      ResponseOf<"RoleCreationRequestsReview">,
      MethodResult<NexusClient["roles"]["reviewCreationRequest"]>
    >
  >,
  // RoleDeletionRequestsList  GET /public/v1/role-deletion-requests  ->  client.roles.listDeletionRequests()
  Expect<
    Equals<
      ResponseOf<"RoleDeletionRequestsList">,
      MethodResult<NexusClient["roles"]["listDeletionRequests"]>
    >
  >,
  // RoleDeletionRequestsGet  GET /public/v1/role-deletion-requests/:requestId  ->  client.roles.getDeletionRequest()
  Expect<
    Equals<
      ResponseOf<"RoleDeletionRequestsGet">,
      MethodResult<NexusClient["roles"]["getDeletionRequest"]>
    >
  >,
  // RoleDeletionRequestsReview  PATCH /public/v1/role-deletion-requests/:requestId  ->  client.roles.reviewDeletionRequest()
  Expect<
    Equals<
      ResponseOf<"RoleDeletionRequestsReview">,
      MethodResult<NexusClient["roles"]["reviewDeletionRequest"]>
    >
  >,
  // RoleManagementSettingsGet  GET /public/v1/role-management-settings  ->  client.roles.getManagementSettings()
  Expect<
    Equals<
      ResponseOf<"RoleManagementSettingsGet">,
      MethodResult<NexusClient["roles"]["getManagementSettings"]>
    >
  >,
  // RoleJobTypesCreate  POST /public/v1/role-job-types  ->  client.roles.createJobType()
  Expect<
    Equals<ResponseOf<"RoleJobTypesCreate">, MethodResult<NexusClient["roles"]["createJobType"]>>
  >,
  // RoleJobTypesUpdate  PUT /public/v1/role-job-types/:jobTypeId  ->  client.roles.updateJobType()
  Expect<
    Equals<ResponseOf<"RoleJobTypesUpdate">, MethodResult<NexusClient["roles"]["updateJobType"]>>
  >,
  // RoleJobTypesDelete  DELETE /public/v1/role-job-types/:jobTypeId  ->  client.roles.deleteJobType()
  Expect<
    Equals<ResponseOf<"RoleJobTypesDelete">, MethodResult<NexusClient["roles"]["deleteJobType"]>>
  >,
  // RoleAutomationSettingsGet  GET /public/v1/role-automation-settings  ->  client.roles.getAutomationSettings()
  Expect<
    Equals<
      ResponseOf<"RoleAutomationSettingsGet">,
      MethodResult<NexusClient["roles"]["getAutomationSettings"]>
    >
  >,
  // RoleAutomationSettingsUpsert  PUT /public/v1/role-automation-settings  ->  client.roles.upsertAutomationSettings()
  Expect<
    Equals<
      ResponseOf<"RoleAutomationSettingsUpsert">,
      MethodResult<NexusClient["roles"]["upsertAutomationSettings"]>
    >
  >,
  // RolesListScopeLines  GET /public/v1/roles/:roleId/scope-lines  ->  client.roles.listScopeLines()
  Expect<
    Equals<ResponseOf<"RolesListScopeLines">, MethodResult<NexusClient["roles"]["listScopeLines"]>>
  >,
  // RolesReplaceScopeLines  PUT /public/v1/roles/:roleId/scope-lines  ->  client.roles.replaceScopeLines()
  Expect<
    Equals<
      ResponseOf<"RolesReplaceScopeLines">,
      MethodResult<NexusClient["roles"]["replaceScopeLines"]>
    >
  >,
  // RolesListVariables  GET /public/v1/roles/:roleId/variables  ->  client.roles.listVariables()
  Expect<
    Equals<ResponseOf<"RolesListVariables">, MethodResult<NexusClient["roles"]["listVariables"]>>
  >,
  // RolesReplaceVariables  PUT /public/v1/roles/:roleId/variables  ->  client.roles.replaceVariables()
  Expect<
    Equals<
      ResponseOf<"RolesReplaceVariables">,
      MethodResult<NexusClient["roles"]["replaceVariables"]>
    >
  >,
  // RolesGetWorkingYear  GET /public/v1/roles/:roleId/working-year  ->  client.roles.getWorkingYear()
  Expect<
    Equals<ResponseOf<"RolesGetWorkingYear">, MethodResult<NexusClient["roles"]["getWorkingYear"]>>
  >,
  // RolesUpsertWorkingYear  PUT /public/v1/roles/:roleId/working-year  ->  client.roles.upsertWorkingYear()
  Expect<
    Equals<
      ResponseOf<"RolesUpsertWorkingYear">,
      MethodResult<NexusClient["roles"]["upsertWorkingYear"]>
    >
  >,
  // RolesGetSystemPolicy  GET /public/v1/roles/:roleId/system-policy  ->  client.roles.getSystemPolicy()
  Expect<
    Equals<
      ResponseOf<"RolesGetSystemPolicy">,
      MethodResult<NexusClient["roles"]["getSystemPolicy"]>
    >
  >,
  // RolesUpsertSystemPolicy  PUT /public/v1/roles/:roleId/system-policy  ->  client.roles.upsertSystemPolicy()
  Expect<
    Equals<
      ResponseOf<"RolesUpsertSystemPolicy">,
      MethodResult<NexusClient["roles"]["upsertSystemPolicy"]>
    >
  >,
  // RolesListResponsibilities  GET /public/v1/roles/:roleId/responsibilities  ->  client.roles.listResponsibilities()
  Expect<
    Equals<
      ResponseOf<"RolesListResponsibilities">,
      MethodResult<NexusClient["roles"]["listResponsibilities"]>
    >
  >,
  // RolesAddResponsibility  POST /public/v1/roles/:roleId/responsibilities  ->  client.roles.addResponsibility()
  Expect<
    Equals<
      ResponseOf<"RolesAddResponsibility">,
      MethodResult<NexusClient["roles"]["addResponsibility"]>
    >
  >,
  // RolesRemoveResponsibility  DELETE /public/v1/roles/:roleId/responsibilities/:responsibilityId  ->  client.roles.removeResponsibility()
  Expect<
    Equals<
      ResponseOf<"RolesRemoveResponsibility">,
      MethodResult<NexusClient["roles"]["removeResponsibility"]>
    >
  >,
  // RolesListTasks  GET /public/v1/roles/:roleId/tasks  ->  client.roles.listTasks()
  Expect<Equals<ResponseOf<"RolesListTasks">, MethodResult<NexusClient["roles"]["listTasks"]>>>,
  // RolesReplaceTasks  PUT /public/v1/roles/:roleId/tasks  ->  client.roles.replaceTasks()
  Expect<
    Equals<ResponseOf<"RolesReplaceTasks">, MethodResult<NexusClient["roles"]["replaceTasks"]>>
  >,
  // RolesListTaskDuties  GET /public/v1/roles/:roleId/tasks/:taskId/duties  ->  client.roles.listTaskDuties()
  Expect<
    Equals<ResponseOf<"RolesListTaskDuties">, MethodResult<NexusClient["roles"]["listTaskDuties"]>>
  >,
  // RolesReplaceTaskDuties  PUT /public/v1/roles/:roleId/tasks/:taskId/duties  ->  client.roles.replaceTaskDuties()
  Expect<
    Equals<
      ResponseOf<"RolesReplaceTaskDuties">,
      MethodResult<NexusClient["roles"]["replaceTaskDuties"]>
    >
  >,
  // RolesCreate  POST /public/v1/roles  ->  client.roles.create()
  Expect<Equals<ResponseOf<"RolesCreate">, MethodResult<NexusClient["roles"]["create"]>>>,
  // RolesUpdate  PATCH /public/v1/roles/:roleId  ->  client.roles.update()
  Expect<Equals<ResponseOf<"RolesUpdate">, MethodResult<NexusClient["roles"]["update"]>>>,
  // RolesDelete  DELETE /public/v1/roles/:roleId  ->  client.roles.delete()
  Expect<Equals<ResponseOf<"RolesDelete">, MethodResult<NexusClient["roles"]["delete"]>>>,
  // RolesPause  POST /public/v1/roles/:roleId/pause  ->  client.roles.pause()
  Expect<Equals<ResponseOf<"RolesPause">, MethodResult<NexusClient["roles"]["pause"]>>>,
  // RolesResume  POST /public/v1/roles/:roleId/resume  ->  client.roles.resume()
  Expect<Equals<ResponseOf<"RolesResume">, MethodResult<NexusClient["roles"]["resume"]>>>,
  // RolesAttachResource  POST /public/v1/roles/:roleId/resources  ->  client.roles.attachSystem()
  Expect<
    Equals<ResponseOf<"RolesAttachResource">, MethodResult<NexusClient["roles"]["attachSystem"]>>
  >,
  // RolesDetachResource  DELETE /public/v1/role-resources/:resourceType/:resourceId  ->  client.roles.detachSystem()
  Expect<
    Equals<ResponseOf<"RolesDetachResource">, MethodResult<NexusClient["roles"]["detachSystem"]>>
  >,
  // RolesUpsertMember  POST /public/v1/roles/:roleId/members  ->  client.roles.upsertMember()
  Expect<
    Equals<ResponseOf<"RolesUpsertMember">, MethodResult<NexusClient["roles"]["upsertMember"]>>
  >,
  // RolesRemoveMember  DELETE /public/v1/roles/:roleId/members/:userId  ->  client.roles.removeMember()
  Expect<
    Equals<ResponseOf<"RolesRemoveMember">, MethodResult<NexusClient["roles"]["removeMember"]>>
  >,
  // RolesAddPermissionSetMember  POST /public/v1/roles/:roleId/permission-sets/:permissionSetId/members  ->  client.roles.addPermissionSetMember()
  Expect<
    Equals<
      ResponseOf<"RolesAddPermissionSetMember">,
      MethodResult<NexusClient["roles"]["addPermissionSetMember"]>
    >
  >,
  // RolesRemovePermissionSetMember  DELETE /public/v1/roles/:roleId/permission-sets/:permissionSetId/members/:userId  ->  client.roles.removePermissionSetMember()
  Expect<
    Equals<
      ResponseOf<"RolesRemovePermissionSetMember">,
      MethodResult<NexusClient["roles"]["removePermissionSetMember"]>
    >
  >
];

/**
 * The routes above, for the population ratchet.
 *
 * Hand-committed beside the assertions rather than derived from them: a runtime
 * list cannot read a type tuple, and deriving both sides of a check from one
 * source makes it agree with itself for free.
 */
const GATED_ROUTES = [
  "CueTranscriptsListConversations",
  "CueTranscriptsGetTranscript",
  "AgentDelete",
  "AgentUploadProfilePicture",
  "ModelList",
  "ToolDelete",
  "FolderList",
  "FolderCreate",
  "FolderUpdate",
  "FolderDelete",
  "FolderAssignAgent",
  "VersionGet",
  "VersionCreateCheckpoint",
  "VersionUpdate",
  "VersionDelete",
  "VersionRestore",
  "VersionPublish",
  "ToolDiscoverySearch",
  "ToolDiscoveryGet",
  "ToolDiscoveryCredentials",
  "ToolDiscoveryResolveOptions",
  "ToolDiscoverySkills",
  "ToolDiscoveryTest",
  "SkillsListWorkflows",
  "SkillsGetWorkflow",
  "SkillsListTasks",
  "SkillsDeleteTask",
  "SkillsListCollections",
  "SkillsGetCollection",
  "SkillsListDocumentTemplates",
  "SkillsGetDocumentTemplate",
  "SkillsCreateDocumentTemplate",
  "SkillsUploadDocumentTemplateFile",
  "SkillsCreateCollection",
  "SkillsGenerateDocumentTemplate",
  "SkillsExecuteTask",
  "SkillsAttachCollectionDocuments",
  "SkillsUploadExternalToolIcon",
  "SkillsGetCollectionStatistics",
  "SkillsSearchCollection",
  "SkillsQueryCollection",
  "SkillsSearchMultipleCollections",
  "SkillsUpdateCollection",
  "SkillsListExternalTools",
  "SkillsGetExternalTool",
  "SkillsCreateExternalTool",
  "SkillsUpdateExternalTool",
  "SkillsDeleteExternalTool",
  "SkillsTestExternalTool",
  "DocumentGet",
  "DocumentUploadFile",
  "DocumentCreateText",
  "DocumentAddWebsite",
  "DocumentCreateGoogleSheet",
  "DocumentCreateFolder",
  "DocumentDownload",
  "DocumentPreview",
  "DocumentUpdate",
  "DocumentReprocess",
  "TicketCreate",
  "TicketGet",
  "TicketUpdate",
  "TicketAddComment",
  "TicketListComments",
  "TicketUploadAttachment",
  "TicketListAttachments",
  "CredentialList",
  "CredentialGet",
  "CredentialUpdate",
  "CredentialDelete",
  "ApiKeyConnectionCreate",
  "AccessCardListByCredential",
  "AccessCardCreate",
  "AccessCardGet",
  "AccessCardUpdate",
  "AccessCardDelete",
  "AssetUpload",
  "AssetGet",
  "AssetDelete",
  "ConversationList",
  "ConversationSearch",
  "ConversationListComments",
  "ConversationGetMetadata",
  "ConversationAddComment",
  "ConversationMarkAsRead",
  "ConversationClose",
  "EvaluationDatasetUpload",
  "EvaluationDatasetAddRow",
  "EvaluationExecute",
  "EvaluationJudge",
  "ChannelSetupGet",
  "ChannelSetupAutoProvision",
  "ChannelPhoneNumberSearchAvailable",
  "ChannelPhoneNumberBuy",
  "ChannelPhoneNumberList",
  "ChannelPhoneNumberGet",
  "DeploymentList",
  "DeploymentCreate",
  "DeploymentGet",
  "DeploymentUpdate",
  "DeploymentStatistics",
  "DeploymentGetEmbedConfig",
  "DeploymentUpdateEmbedConfig",
  "DeploymentFolderList",
  "DeploymentFolderCreate",
  "DeploymentFolderUpdate",
  "DeploymentFolderDelete",
  "DeploymentFolderAssign",
  "PhoneNumberSearchAvailable",
  "PhoneNumberBuy",
  "PhoneNumberList",
  "PhoneNumberGet",
  "CustomerAddNote",
  "WorkflowNodeCreate",
  "WorkflowNodeGet",
  "WorkflowNodeUpdate",
  "WorkflowExecutionPollByToken",
  "WorkflowExecutionPoll",
  "WorkflowExecutionGet",
  "WorkflowExecutionGetNodeResult",
  "WorkflowExecutionGetOutput",
  "WorkflowExecutionRetryNode",
  "WorkflowExecutionCancel",
  "WorkflowExecutionExport",
  "WorkflowBuilderListNodeTypes",
  "WorkflowBuilderGetNodeTypeSchema",
  "WorkflowBuilderListPlatformListenerEvents",
  "CloudImportBrowse",
  "CloudImportSearch",
  "CloudImportItems",
  "TracingListTraces",
  "TracingGetTrace",
  "TracingListGenerations",
  "TracingGetGeneration",
  "TracingListModels",
  "TracingAnalyticsSummary",
  "TracingAnalyticsCostBreakdown",
  "TracingAnalyticsTimeline",
  "TracingExportTrace",
  "TracingExportBulk",
  "WorkspaceList",
  "WorkspaceCreate",
  "WorkspaceRename",
  "WorkspaceGetFile",
  "WorkspaceSearch",
  "WorkspaceRestore",
  "AgentCollectionList",
  "AgentCollectionAttach",
  "AgentCollectionDetach",
  "AgentSkillList",
  "AgentSkillCreate",
  "AgentSkillGet",
  "AgentSkillUpdate",
  "AgentSkillDelete",
  "AgentSkillUpload",
  "AgentSkillDownloadUrl",
  "AnalyticsOverview",
  "AnalyticsFeedback",
  "AnalyticsQuery",
  "AnalyticsQueryStructured",
  "CustomModelList",
  "CustomModelCreate",
  "CustomModelGet",
  "CustomModelUpdate",
  "DocsSearch",
  "DocumentTemplateFolderList",
  "DocumentTemplateFolderCreate",
  "DocumentTemplateFolderUpdate",
  "DocumentTemplateFolderDelete",
  "DocumentTemplateFolderAssign",
  "HtmlMessageTemplateDelete",
  "HtmlMessageTemplateRender",
  "HtmlMessageTemplateFill",
  "KnownIssuesForRoute",
  "PromptAssistantChat",
  "PromptAssistantListThreads",
  "SkillFolderList",
  "SkillFolderCreate",
  "SkillFolderUpdate",
  "SkillFolderDelete",
  "SkillFolderAssign",
  "ToolConnectionGetHandshakeStatus",
  "PermissionsListResourceAccess",
  "PermissionsGrant",
  "PermissionsRevoke",
  "PermissionsGetOrgSettings",
  "PermissionsUpdateResourceTypeVisibility",
  "UserGroupsList",
  "UserGroupsCreate",
  "UserGroupsUpdate",
  "UserGroupsDelete",
  "UserGroupsAddMember",
  "UserGroupsRemoveMember",
  "RolesList",
  "RolesGet",
  "RolesListResources",
  "RolesListMembers",
  "RolesListPermissionSets",
  "RolesListCollectionGrants",
  "RolesListWorkspaceGrants",
  "RolesListAccessRequests",
  "RolesListBoards",
  "RolesCreateBoard",
  "RolesReorderBoards",
  "RolesUpdateBoard",
  "RolesDeleteBoard",
  "RolesMoveBoardCard",
  "RolesGetCoverage",
  "RoleJobTypesList",
  "RolesCreateCollectionGrant",
  "RolesDeleteCollectionGrant",
  "RolesCreateWorkspaceGrant",
  "RolesDeleteWorkspaceGrant",
  "RolesCreatePermissionSet",
  "RolesUpdatePermissionSet",
  "RolesDeletePermissionSet",
  "RoleAccessRequestsCreate",
  "RoleAccessRequestsReview",
  "RoleCreationRequestsList",
  "RoleCreationRequestsGet",
  "RoleCreationRequestsReview",
  "RoleDeletionRequestsList",
  "RoleDeletionRequestsGet",
  "RoleDeletionRequestsReview",
  "RoleManagementSettingsGet",
  "RoleJobTypesCreate",
  "RoleJobTypesUpdate",
  "RoleJobTypesDelete",
  "RoleAutomationSettingsGet",
  "RoleAutomationSettingsUpsert",
  "RolesListScopeLines",
  "RolesReplaceScopeLines",
  "RolesListVariables",
  "RolesReplaceVariables",
  "RolesGetWorkingYear",
  "RolesUpsertWorkingYear",
  "RolesGetSystemPolicy",
  "RolesUpsertSystemPolicy",
  "RolesListResponsibilities",
  "RolesAddResponsibility",
  "RolesRemoveResponsibility",
  "RolesListTasks",
  "RolesReplaceTasks",
  "RolesListTaskDuties",
  "RolesReplaceTaskDuties",
  "RolesCreate",
  "RolesUpdate",
  "RolesDelete",
  "RolesPause",
  "RolesResume",
  "RolesAttachResource",
  "RolesDetachResource",
  "RolesUpsertMember",
  "RolesRemoveMember",
  "RolesAddPermissionSetMember",
  "RolesRemovePermissionSetMember"
] as const;

/**
 * Routes whose response type does NOT match the contract today, with the reason
 * measured field by field rather than guessed.
 *
 * 🚨 THIS LEDGER ONLY SHRINKS, AND IT IS ENFORCED BY {@link V1ResponseDrift}
 * RATHER THAN BY ANYONE REMEMBERING. Each entry has a companion assertion that
 * the pair is NOT equal, so repairing one turns that line RED until the route is
 * moved up into `V1ResponseAssertions` and `GATED_ROUTES`. A ledger nobody
 * prunes grows into a list of everything; this one cannot.
 *
 * Every reason was produced by walking both types with a real `ts.Program`
 * checker — property by property, to depth 7, comparing by mutual assignability
 * rather than by printed name, because `FolderRef` and `{ id: string; name:
 * string }` are the same type and a string comparison called them drift.
 *
 * 🚨 That diagnostic is WEAKER than the gate, in one direction that matters:
 * **mutual assignability cannot see a MISSING OPTIONAL property.** `{ a: string }`
 * and `{ a: string; b?: number }` are assignable both ways, so a reason written
 * from it can be incomplete while reading as complete. That is not hypothetical —
 * the `AccessCard` entry named only `CardVariable.constraint`, the repair did not
 * turn its negative assertion red, and `ParameterPolicy.constraint` was the half
 * the diagnostic could not report. `Equals` saw both. A ledger reason is a
 * STARTING POINT for whoever picks the row up, never a specification of the fix.
 *
 * They are NOT all defects, and the split matters when picking one up:
 *
 * - **The SDK omits a field the server sends** — 2 routes. A fact no caller can
 *   reach any other way. This is the class NEX-3850 came from, and the class the
 *   four `AccessCard*` routes LEFT this ledger by: `constraint` was missing from
 *   `CardVariable` AND from `ParameterPolicy`, and adding it to both made all
 *   four pairs equal.
 *
 * 🔑 THE SELF-PRUNING IS NOT THEORETICAL — IT FIRED ON SOMEONE ELSE'S FIX,
 * UNPROMPTED. `WorkspaceList` / `WorkspaceCreate` / `WorkspaceRename` were
 * ledgered here for omitting `kind` and `vibeGitProjectId`. Staging's
 * `888c141c60` added both to the SDK `Workspace` type for an unrelated reason,
 * CI tests the MERGE rather than the branch head, and the three negative
 * assertions went red naming themselves within the hour. Nobody coordinated
 * that, and no row had to be remembered.
 * - **The SDK is WIDER than the contract** — a literal union flattened to
 *   `string`. Nothing is hidden; a caller cannot exhaust the values.
 * - **The SDK is NARROWER than the contract** — a closed union over a field the
 *   schema leaves open. A value outside the union arrives and typed code cannot
 *   name it, which is the direction that makes an exhaustive switch fall
 *   through.
 * - **Required here, optional in the contract** — the SDK claims a key is always
 *   present that the server may omit. The value reads `undefined` under a
 *   `string | null` type, so a `=== null` check misses it.
 */
const V1_RESPONSE_DRIFT: Record<string, string> = {
  // GET /public/v1/agents/:agentId  ->  client.agents.get()
  AgentGet:
    "`model` is `string | null` in the contract and `AgentModel | null` here. The SDK is NARROWER than the server: it publishes a closed 16-member union over a field the schema does not constrain, so a legacy or newly-added identifier arrives as a value no caller can name and an exhaustive switch falls through silently. Fixing it is a decision about whether the server should narrow or this package should widen, not a type edit.",
  // POST /public/v1/agents  ->  client.agents.create()
  AgentCreate:
    "`model` is `string | null` in the contract and `AgentModel | null` here. The SDK is NARROWER than the server: it publishes a closed 16-member union over a field the schema does not constrain, so a legacy or newly-added identifier arrives as a value no caller can name and an exhaustive switch falls through silently. Fixing it is a decision about whether the server should narrow or this package should widen, not a type edit.",
  // PATCH /public/v1/agents/:agentId  ->  client.agents.update()
  AgentUpdate:
    "`model` is `string | null` in the contract and `AgentModel | null` here. The SDK is NARROWER than the server: it publishes a closed 16-member union over a field the schema does not constrain, so a legacy or newly-added identifier arrives as a value no caller can name and an exhaustive switch falls through silently. Fixing it is a decision about whether the server should narrow or this package should widen, not a type edit.",
  // POST /public/v1/agents/:agentId/duplicate  ->  client.agents.duplicate()
  AgentDuplicate:
    "`model` is `string | null` in the contract and `AgentModel | null` here. The SDK is NARROWER than the server: it publishes a closed 16-member union over a field the schema does not constrain, so a legacy or newly-added identifier arrives as a value no caller can name and an exhaustive switch falls through silently. Fixing it is a decision about whether the server should narrow or this package should widen, not a type edit.",
  // GET /public/v1/agents/:agentId/tools  ->  client.agents.tools.list()
  ToolList:
    "`AgentToolConfig.config` is `unknown` here against a seven-key object in the contract (`toolId`, `workflowId`, `collectionId`, `action`, `toolCredentialId`, `instructions`, `parameters`). Opaque BY DESIGN — the shape varies by tool type and the SDK deliberately refuses to pick one. Typing it means modelling the per-type union first.",
  // GET /public/v1/agents/:agentId/tools/:toolId  ->  client.agents.tools.get()
  ToolGet:
    "`AgentToolConfig.config` is `unknown` here against a seven-key object in the contract (`toolId`, `workflowId`, `collectionId`, `action`, `toolCredentialId`, `instructions`, `parameters`). Opaque BY DESIGN — the shape varies by tool type and the SDK deliberately refuses to pick one. Typing it means modelling the per-type union first.",
  // POST /public/v1/agents/:agentId/tools  ->  client.agents.tools.create()
  ToolCreate:
    "`AgentToolConfig.config` is `unknown` here against a seven-key object in the contract (`toolId`, `workflowId`, `collectionId`, `action`, `toolCredentialId`, `instructions`, `parameters`). Opaque BY DESIGN — the shape varies by tool type and the SDK deliberately refuses to pick one. Typing it means modelling the per-type union first.",
  // PATCH /public/v1/agents/:agentId/tools/:toolId  ->  client.agents.tools.update()
  ToolUpdate:
    "`AgentToolConfig.config` is `unknown` here against a seven-key object in the contract (`toolId`, `workflowId`, `collectionId`, `action`, `toolCredentialId`, `instructions`, `parameters`). Opaque BY DESIGN — the shape varies by tool type and the SDK deliberately refuses to pick one. Typing it means modelling the per-type union first.",
  // POST /public/v1/agents/:agentId/tools/attach-collection  ->  client.agents.tools.attachCollection()
  ToolAttachCollection:
    "`AgentToolConfig.config` is `unknown` here against a seven-key object in the contract (`toolId`, `workflowId`, `collectionId`, `action`, `toolCredentialId`, `instructions`, `parameters`). Opaque BY DESIGN — the shape varies by tool type and the SDK deliberately refuses to pick one. Typing it means modelling the per-type union first.",
  // GET /public/v1/skills/tasks/:taskId  ->  client.skills.getTask()
  SkillsGetTask:
    "Five reasoning knobs — `thinkingLevel`, `thinkingDisplay`, `reasoningEffort`, `geminiThinkingLevel`, `kimiReasoningEffort` — are `string` here against literal unions in the contract. The SDK is WIDER, so no field is hidden; what is lost is the ability to name a legal value. The unions are provider-specific and belong to delphi's surface, so narrowing them here is a contract question rather than a transcription fix.",
  // POST /public/v1/skills/tasks  ->  client.skills.createTask()
  SkillsCreateTask:
    "Five reasoning knobs — `thinkingLevel`, `thinkingDisplay`, `reasoningEffort`, `geminiThinkingLevel`, `kimiReasoningEffort` — are `string` here against literal unions in the contract. The SDK is WIDER, so no field is hidden; what is lost is the ability to name a legal value. The unions are provider-specific and belong to delphi's surface, so narrowing them here is a contract question rather than a transcription fix.",
  // POST /public/v1/skills/tasks/:taskId/duplicate  ->  client.skills.duplicateTask()
  SkillsDuplicateTask:
    "Five reasoning knobs — `thinkingLevel`, `thinkingDisplay`, `reasoningEffort`, `geminiThinkingLevel`, `kimiReasoningEffort` — are `string` here against literal unions in the contract. The SDK is WIDER, so no field is hidden; what is lost is the ability to name a legal value. The unions are provider-specific and belong to delphi's surface, so narrowing them here is a contract question rather than a transcription fix.",
  // PATCH /public/v1/skills/tasks/:taskId  ->  client.skills.updateTask()
  SkillsUpdateTask:
    "Five reasoning knobs — `thinkingLevel`, `thinkingDisplay`, `reasoningEffort`, `geminiThinkingLevel`, `kimiReasoningEffort` — are `string` here against literal unions in the contract. The SDK is WIDER, so no field is hidden; what is lost is the ability to name a legal value. The unions are provider-specific and belong to delphi's surface, so narrowing them here is a contract question rather than a transcription fix.",
  // GET /public/v1/access-cards/available-actions  ->  client.credentials.cards.availableActions()
  AccessCardAvailableActions:
    "`ParameterDefinition.type` is `string` here against a nine-member literal union (`string`/`number`/`boolean`/`object`/`array`/`text`/`url`/`email`/`phone`). The SDK is WIDER, so nothing is hidden; a caller rendering a form input per type cannot exhaust it.",
  // GET /public/v1/conversations/:conversationId  ->  client.conversations.get()
  ConversationGet:
    "Two independent causes on `ConversationDetail`. (1) All five `contact` fields are REQUIRED here and optional in the contract, so the SDK claims a key is always present that the server may omit — the value reads `undefined` under a `string | null` type and a `=== null` check misses it. (2) `Satisfaction`'s `framework` and `source` are this package's own unions and do not equal the contract's, which is a member-set difference behind an identical NAME.",
  // GET /public/v1/conversations/:conversationId/messages  ->  client.conversations.getMessages()
  ConversationListMessages:
    "`Message.toolCalls` is absent from this package — NEX-3487 added it to the contract with a docblock saying the payload lives there and nowhere else, so an agent's tool activity is unreadable from typed code. Thirteen further fields (`author.*`, `sender.*`, `tool.*`, `nextBefore`) are REQUIRED here and optional in the contract.",
  // GET /public/v1/conversations/:conversationId/assigned-users  ->  client.conversations.getAssignedUsers()
  ConversationGetAssignedUsers:
    '`responseHandling` is `string` here against `"AUTO" | "ON_APPROVAL" | "MANUAL"`. The SDK is WIDER, so nothing is hidden; the three modes cannot be named by a caller switching on them.',
  // PATCH /public/v1/conversations/:conversationId/statuses  ->  client.conversations.updateStatuses()
  ConversationUpdateStatuses:
    "Two independent causes on `ConversationDetail`. (1) All five `contact` fields are REQUIRED here and optional in the contract, so the SDK claims a key is always present that the server may omit — the value reads `undefined` under a `string | null` type and a `=== null` check misses it. (2) `Satisfaction`'s `framework` and `source` are this package's own unions and do not equal the contract's, which is a member-set difference behind an identical NAME.",
  // PATCH /public/v1/conversations/:conversationId/topic  ->  client.conversations.updateTopic()
  ConversationUpdateTopic:
    "Two independent causes on `ConversationDetail`. (1) All five `contact` fields are REQUIRED here and optional in the contract, so the SDK claims a key is always present that the server may omit — the value reads `undefined` under a `string | null` type and a `=== null` check misses it. (2) `Satisfaction`'s `framework` and `source` are this package's own unions and do not equal the contract's, which is a member-set difference behind an identical NAME.",
  // PATCH /public/v1/conversations/:conversationId/metadata  ->  client.conversations.updateMetadata()
  ConversationUpdateMetadata:
    "Two independent causes on `ConversationDetail`. (1) All five `contact` fields are REQUIRED here and optional in the contract, so the SDK claims a key is always present that the server may omit — the value reads `undefined` under a `string | null` type and a `=== null` check misses it. (2) `Satisfaction`'s `framework` and `source` are this package's own unions and do not equal the contract's, which is a member-set difference behind an identical NAME.",
  // PUT /public/v1/conversations/:conversationId/assigned-users  ->  client.conversations.setAssignedUsers()
  ConversationSetAssignedUsers:
    "Two independent causes on `ConversationDetail`. (1) All five `contact` fields are REQUIRED here and optional in the contract, so the SDK claims a key is always present that the server may omit — the value reads `undefined` under a `string | null` type and a `=== null` check misses it. (2) `Satisfaction`'s `framework` and `source` are this package's own unions and do not equal the contract's, which is a member-set difference behind an identical NAME.",
  // GET /public/v1/workflows  ->  client.workflows.list()
  WorkflowList:
    "`status` is `WorkflowStatus` here and bare `string` in the contract. The SDK is NARROWER than the server on a field the schema does not constrain — same shape as the agent `model` entry above, and the same open question: narrow the contract or widen this package.",
  // POST /public/v1/workflows  ->  client.workflows.create()
  WorkflowCreate:
    "`status` is `WorkflowStatus` here and bare `string` in the contract. The SDK is NARROWER than the server on a field the schema does not constrain — same shape as the agent `model` entry above, and the same open question: narrow the contract or widen this package.",
  // GET /public/v1/workflows/:workflowId  ->  client.workflows.get()
  WorkflowGet:
    "`status` is `WorkflowStatus` here and bare `string` in the contract. The SDK is NARROWER than the server on a field the schema does not constrain — same shape as the agent `model` entry above, and the same open question: narrow the contract or widen this package.",
  // PATCH /public/v1/workflows/:workflowId  ->  client.workflows.update()
  WorkflowUpdate:
    "`status` is `WorkflowStatus` here and bare `string` in the contract. The SDK is NARROWER than the server on a field the schema does not constrain — same shape as the agent `model` entry above, and the same open question: narrow the contract or widen this package.",
  // POST /public/v1/workflows/:workflowId/duplicate  ->  client.workflows.duplicate()
  WorkflowDuplicate:
    "`status` is `WorkflowStatus` here and bare `string` in the contract. The SDK is NARROWER than the server on a field the schema does not constrain — same shape as the agent `model` entry above, and the same open question: narrow the contract or widen this package.",
  // GET /public/v1/workflows/executions/:executionId/diagnose  ->  client.workflowExecutions.diagnose()
  WorkflowExecutionDiagnose:
    "`status` is `string` here against the five-member execution-status union. The SDK is WIDER; a caller cannot exhaust `PENDING`/`RUNNING`/`COMPLETED`/`FAILED`/`CANCELLED`.",
  // GET /public/v1/documents/imports/providers  ->  client.cloudImports.listProviders()
  CloudImportListProviders:
    "`providers[].slug` is `CloudImportProviderSlug` here and bare `string` in the contract — the SDK is NARROWER than the server on a field the schema does not constrain.",
  // GET /public/v1/workspaces/:slug/files  ->  client.workspaces.listFiles()
  WorkspaceListFolder:
    "`WorkspaceListing` omits `references` and both optional folder stats (`modifiedAt`, `size`). `WorkspaceListingSchema.references` is `.default([])`, so it is REQUIRED on output and its docblock says a consumer must not be able to drop it silently — which is exactly what this type does.",
  // GET /public/v1/html-message-templates  ->  client.htmlMessageTemplates.list()
  HtmlMessageTemplateList:
    "`description`, `inputSchema` and `updatedAt` are REQUIRED here and optional in the contract, so this package claims three keys are always present that the server may omit. `inputSchema` also differs structurally: an index signature in the contract against a named interface here.",
  // GET /public/v1/html-message-templates/:templateId  ->  client.htmlMessageTemplates.get()
  HtmlMessageTemplateGet:
    "`description`, `inputSchema` and `updatedAt` are REQUIRED here and optional in the contract, so this package claims three keys are always present that the server may omit. `inputSchema` also differs structurally: an index signature in the contract against a named interface here.",
  // POST /public/v1/html-message-templates  ->  client.htmlMessageTemplates.create()
  HtmlMessageTemplateCreate:
    "`description`, `inputSchema` and `updatedAt` are REQUIRED here and optional in the contract, so this package claims three keys are always present that the server may omit. `inputSchema` also differs structurally: an index signature in the contract against a named interface here.",
  // PATCH /public/v1/html-message-templates/:templateId  ->  client.htmlMessageTemplates.update()
  HtmlMessageTemplateUpdate:
    "`description`, `inputSchema` and `updatedAt` are REQUIRED here and optional in the contract, so this package claims three keys are always present that the server may omit. `inputSchema` also differs structurally: an index signature in the contract against a named interface here.",
  // GET /public/v1/me/organizations  ->  client.me.organizations()
  MeListOrganizations:
    "`UserOrganization.name` is `string | null` here and plain `string` in the contract. The SDK is WIDER, so a caller is forced to handle a `null` the server does not send — harmless at runtime, and still a published type that disagrees with the wire."
};

/**
 * One NEGATIVE assertion per ledger entry: this pair must still differ.
 *
 * Two jobs. It makes the ledger self-pruning — a repaired route reds here and
 * names itself — and it is the vacuity control for the whole file, because a
 * machinery failure that collapsed both sides to `never` would make every one of
 * these `Equals<true, false>` and fail.
 */
export type V1ResponseDrift = [
  // AgentGet  ->  client.agents.get()
  Expect<Equals<Equals<ResponseOf<"AgentGet">, MethodResult<NexusClient["agents"]["get"]>>, false>>,
  // AgentCreate  ->  client.agents.create()
  Expect<
    Equals<Equals<ResponseOf<"AgentCreate">, MethodResult<NexusClient["agents"]["create"]>>, false>
  >,
  // AgentUpdate  ->  client.agents.update()
  Expect<
    Equals<Equals<ResponseOf<"AgentUpdate">, MethodResult<NexusClient["agents"]["update"]>>, false>
  >,
  // AgentDuplicate  ->  client.agents.duplicate()
  Expect<
    Equals<
      Equals<ResponseOf<"AgentDuplicate">, MethodResult<NexusClient["agents"]["duplicate"]>>,
      false
    >
  >,
  // ToolList  ->  client.agents.tools.list()
  Expect<
    Equals<
      Equals<ResponseOf<"ToolList">, MethodResult<NexusClient["agents"]["tools"]["list"]>>,
      false
    >
  >,
  // ToolGet  ->  client.agents.tools.get()
  Expect<
    Equals<
      Equals<ResponseOf<"ToolGet">, MethodResult<NexusClient["agents"]["tools"]["get"]>>,
      false
    >
  >,
  // ToolCreate  ->  client.agents.tools.create()
  Expect<
    Equals<
      Equals<ResponseOf<"ToolCreate">, MethodResult<NexusClient["agents"]["tools"]["create"]>>,
      false
    >
  >,
  // ToolUpdate  ->  client.agents.tools.update()
  Expect<
    Equals<
      Equals<ResponseOf<"ToolUpdate">, MethodResult<NexusClient["agents"]["tools"]["update"]>>,
      false
    >
  >,
  // ToolAttachCollection  ->  client.agents.tools.attachCollection()
  Expect<
    Equals<
      Equals<
        ResponseOf<"ToolAttachCollection">,
        MethodResult<NexusClient["agents"]["tools"]["attachCollection"]>
      >,
      false
    >
  >,
  // SkillsGetTask  ->  client.skills.getTask()
  Expect<
    Equals<
      Equals<ResponseOf<"SkillsGetTask">, MethodResult<NexusClient["skills"]["getTask"]>>,
      false
    >
  >,
  // SkillsCreateTask  ->  client.skills.createTask()
  Expect<
    Equals<
      Equals<ResponseOf<"SkillsCreateTask">, MethodResult<NexusClient["skills"]["createTask"]>>,
      false
    >
  >,
  // SkillsDuplicateTask  ->  client.skills.duplicateTask()
  Expect<
    Equals<
      Equals<
        ResponseOf<"SkillsDuplicateTask">,
        MethodResult<NexusClient["skills"]["duplicateTask"]>
      >,
      false
    >
  >,
  // SkillsUpdateTask  ->  client.skills.updateTask()
  Expect<
    Equals<
      Equals<ResponseOf<"SkillsUpdateTask">, MethodResult<NexusClient["skills"]["updateTask"]>>,
      false
    >
  >,
  // AccessCardAvailableActions  ->  client.credentials.cards.availableActions()
  Expect<
    Equals<
      Equals<
        ResponseOf<"AccessCardAvailableActions">,
        MethodResult<NexusClient["credentials"]["cards"]["availableActions"]>
      >,
      false
    >
  >,
  // ConversationGet  ->  client.conversations.get()
  Expect<
    Equals<
      Equals<ResponseOf<"ConversationGet">, MethodResult<NexusClient["conversations"]["get"]>>,
      false
    >
  >,
  // ConversationListMessages  ->  client.conversations.getMessages()
  Expect<
    Equals<
      Equals<
        ResponseOf<"ConversationListMessages">,
        MethodResult<NexusClient["conversations"]["getMessages"]>
      >,
      false
    >
  >,
  // ConversationGetAssignedUsers  ->  client.conversations.getAssignedUsers()
  Expect<
    Equals<
      Equals<
        ResponseOf<"ConversationGetAssignedUsers">,
        MethodResult<NexusClient["conversations"]["getAssignedUsers"]>
      >,
      false
    >
  >,
  // ConversationUpdateStatuses  ->  client.conversations.updateStatuses()
  Expect<
    Equals<
      Equals<
        ResponseOf<"ConversationUpdateStatuses">,
        MethodResult<NexusClient["conversations"]["updateStatuses"]>
      >,
      false
    >
  >,
  // ConversationUpdateTopic  ->  client.conversations.updateTopic()
  Expect<
    Equals<
      Equals<
        ResponseOf<"ConversationUpdateTopic">,
        MethodResult<NexusClient["conversations"]["updateTopic"]>
      >,
      false
    >
  >,
  // ConversationUpdateMetadata  ->  client.conversations.updateMetadata()
  Expect<
    Equals<
      Equals<
        ResponseOf<"ConversationUpdateMetadata">,
        MethodResult<NexusClient["conversations"]["updateMetadata"]>
      >,
      false
    >
  >,
  // ConversationSetAssignedUsers  ->  client.conversations.setAssignedUsers()
  Expect<
    Equals<
      Equals<
        ResponseOf<"ConversationSetAssignedUsers">,
        MethodResult<NexusClient["conversations"]["setAssignedUsers"]>
      >,
      false
    >
  >,
  // WorkflowList  ->  client.workflows.list()  [paged]
  Expect<
    Equals<
      Equals<ResponseOf<"WorkflowList">, PageItems<MethodResult<NexusClient["workflows"]["list"]>>>,
      false
    >
  >,
  // WorkflowCreate  ->  client.workflows.create()
  Expect<
    Equals<
      Equals<ResponseOf<"WorkflowCreate">, MethodResult<NexusClient["workflows"]["create"]>>,
      false
    >
  >,
  // WorkflowGet  ->  client.workflows.get()
  Expect<
    Equals<Equals<ResponseOf<"WorkflowGet">, MethodResult<NexusClient["workflows"]["get"]>>, false>
  >,
  // WorkflowUpdate  ->  client.workflows.update()
  Expect<
    Equals<
      Equals<ResponseOf<"WorkflowUpdate">, MethodResult<NexusClient["workflows"]["update"]>>,
      false
    >
  >,
  // WorkflowDuplicate  ->  client.workflows.duplicate()
  Expect<
    Equals<
      Equals<ResponseOf<"WorkflowDuplicate">, MethodResult<NexusClient["workflows"]["duplicate"]>>,
      false
    >
  >,
  // WorkflowExecutionDiagnose  ->  client.workflowExecutions.diagnose()
  Expect<
    Equals<
      Equals<
        ResponseOf<"WorkflowExecutionDiagnose">,
        MethodResult<NexusClient["workflowExecutions"]["diagnose"]>
      >,
      false
    >
  >,
  // CloudImportListProviders  ->  client.cloudImports.listProviders()
  Expect<
    Equals<
      Equals<
        ResponseOf<"CloudImportListProviders">,
        MethodResult<NexusClient["cloudImports"]["listProviders"]>
      >,
      false
    >
  >,
  // WorkspaceListFolder  ->  client.workspaces.listFiles()
  Expect<
    Equals<
      Equals<
        ResponseOf<"WorkspaceListFolder">,
        MethodResult<NexusClient["workspaces"]["listFiles"]>
      >,
      false
    >
  >,
  // HtmlMessageTemplateList  ->  client.htmlMessageTemplates.list()
  Expect<
    Equals<
      Equals<
        ResponseOf<"HtmlMessageTemplateList">,
        MethodResult<NexusClient["htmlMessageTemplates"]["list"]>
      >,
      false
    >
  >,
  // HtmlMessageTemplateGet  ->  client.htmlMessageTemplates.get()
  Expect<
    Equals<
      Equals<
        ResponseOf<"HtmlMessageTemplateGet">,
        MethodResult<NexusClient["htmlMessageTemplates"]["get"]>
      >,
      false
    >
  >,
  // HtmlMessageTemplateCreate  ->  client.htmlMessageTemplates.create()
  Expect<
    Equals<
      Equals<
        ResponseOf<"HtmlMessageTemplateCreate">,
        MethodResult<NexusClient["htmlMessageTemplates"]["create"]>
      >,
      false
    >
  >,
  // HtmlMessageTemplateUpdate  ->  client.htmlMessageTemplates.update()
  Expect<
    Equals<
      Equals<
        ResponseOf<"HtmlMessageTemplateUpdate">,
        MethodResult<NexusClient["htmlMessageTemplates"]["update"]>
      >,
      false
    >
  >,
  // MeListOrganizations  ->  client.me.organizations()
  Expect<
    Equals<
      Equals<ResponseOf<"MeListOrganizations">, MethodResult<NexusClient["me"]["organizations"]>>,
      false
    >
  >
];

/**
 * A ratchet, not a target. Raise it as entries leave the ledger; never lower it.
 *
 * A hardcoded literal, never `GATED_ROUTES.length` compared against itself — an
 * assertion deriving both sides from one source passes vacuously.
 */
const GATED_ROUTE_FLOOR = 248;

describe("every v1 response schema matches its SDK method's return type", () => {
  const routes = collectRoutes();

  /**
   * Controls. A population that resolved to nothing would satisfy every
   * assertion below by having nothing to check, which is what a broken import,
   * a renamed descriptor field or a matcher that stopped matching all look like.
   */
  it("reached the real v1 contract and a live route scan", () => {
    expect(Object.keys(ZPublicApiV1).length).toBeGreaterThan(400);
    expect(routes.length).toBeGreaterThan(400);
    expect(routes.filter((route) => route.hasResponse).length).toBeGreaterThan(300);
    expect(reachedBySdk("GET", "/public/v1/agents/:agentId")).toBe(true);
    expect(reachedBySdk("GET", "/public/v1/not-a-real-route")).toBe(false);
  });

  it("is enforced by typecheck, and this file is where a response drift surfaces", () => {
    expect(GATED_ROUTES.length).toBeGreaterThanOrEqual(GATED_ROUTE_FLOOR);
  });

  /**
   * THE RATCHET. Every route that declares a `Response` and is reached by an SDK
   * method is either gated or ledgered — so a NEW route is red until someone
   * says which.
   */
  it("accounts for every route that declares a Response and has an SDK method", () => {
    const accounted = new Set<string>([...GATED_ROUTES, ...Object.keys(V1_RESPONSE_DRIFT)]);

    const unaccounted = routes
      .filter((route) => route.hasResponse)
      .filter((route) => reachedBySdk(route.method, route.path))
      .filter((route) => !accounted.has(route.name))
      .map((route) => `${route.name}  (${route.method} ${route.path})`);

    expect(
      unaccounted,
      "these routes declare a Response and have an SDK method, and nothing compares the two — " +
        "add an Expect<Equals<…>> to V1ResponseAssertions and the name to GATED_ROUTES, or " +
        "ledger it in V1_RESPONSE_DRIFT with a measured reason"
    ).toEqual([]);
  });

  /** The other direction: a list nobody prunes silently grows into a list of everything. */
  it("names only routes that still exist, still declare a Response and are still reached", () => {
    const live = new Map(routes.map((route) => [route.name, route]));

    const stale = [...GATED_ROUTES, ...Object.keys(V1_RESPONSE_DRIFT)].filter((name) => {
      const route = live.get(name);
      return route === undefined || !route.hasResponse || !reachedBySdk(route.method, route.path);
    });

    expect(stale, "entries for routes that no longer qualify — delete them").toEqual([]);
  });

  it("never lists a route as both gated and drifting", () => {
    const both = GATED_ROUTES.filter((name) => name in V1_RESPONSE_DRIFT);
    expect(both).toEqual([]);
  });

  /** An exemption with no reason is an omission wearing a label. */
  it("gives every ledgered route a reason long enough to be one", () => {
    for (const [name, reason] of Object.entries(V1_RESPONSE_DRIFT)) {
      expect(reason.length, `${name} is ledgered with no real reason`).toBeGreaterThan(120);
    }
  });

  /**
   * Coverage is stated out loud. A gate reading as "the responses are checked"
   * while a quarter of the surface declares no `Response` at all is worse than
   * no gate, because it stops anyone looking for the routes it cannot see.
   */
  it("states the two populations it does NOT cover, separately", () => {
    const withResponse = routes.filter((route) => route.hasResponse);
    const withoutResponse = routes.filter((route) => !route.hasResponse);
    const reachedWithResponse = withResponse.filter((route) =>
      reachedBySdk(route.method, route.path)
    );

    expect(withResponse.length + withoutResponse.length).toBe(routes.length);
    expect(reachedWithResponse.length).toBe(
      GATED_ROUTES.length + Object.keys(V1_RESPONSE_DRIFT).length
    );

    // A route with NO Response is outside this gate BY CONSTRUCTION, not clean.
    // It is a separate and much larger population, and conflating the two makes
    // the coverage read far better than it is.
    expect(withoutResponse.length).toBeGreaterThan(reachedWithResponse.length / 4);
  });
});
