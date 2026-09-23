import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ZPublicApiV1 } from "@nexus/types/public-api-v1";
import { describe, expect, it } from "vitest";

import type { NexusClient } from "../client";
import type { DeepOmitAll } from "../deep-omit";
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
 * - **A route with no `Response`.** Around a fifth of the descriptors declare
 *   none, so no contract-derived gate can ever compare them. That population is
 *   several times the size of the drift ledger below, and declaring `Response`
 *   on those routes is a prerequisite for covering them rather than an
 *   alternative. The figure is deliberately not written here — it moves with
 *   every route that gains a schema (`WorkflowNodeDelete` was the last, NEX-4047)
 *   and a stale count reads as a measurement. Re-derive it the way
 *   `descriptor.ts` says to:
 *
 *   ```sh
 *   cd packages/types/src/api/public/v1/contract
 *   grep -ohE '^  [A-Za-z0-9_]+: \{' *.ts | wc -l   # descriptors
 *   grep -ohE '^    noResponse: \{'  *.ts | wc -l   # the declared-absence arm
 *   ```
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
 * every assertion above would pass having compared nothing. {@link V1ResponseDrift}
 * closes that: it asserts ONE PAIR PER LEDGER ROW is NOT equal, so a machinery
 * failure that collapses both sides to `never` turns every one of them RED. A
 * gate whose green depends on its own reds is one that cannot be satisfied by
 * breaking it.
 *
 * 🔴 THAT CONTROL IS ONLY AS WIDE AS THE PAIRING, AND THE PAIRING WAS HAND-KEPT
 * AND HAD ALREADY SLIPPED. `ScoreList` sat in `V1_RESPONSE_DRIFT` with NO
 * negative assertion at all — its ledger row was its only mention in this file —
 * so it was neither self-pruning nor part of the vacuity control, and nothing
 * anywhere said so. `every ledgered route has a negative assertion` below
 * reconciles the two lists by reading this file's own source, which is what
 * makes the count above safe to state as a relation instead of a number.
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
  // PromptVariantList  GET /public/v1/agents/:agentId/prompt-variants  ->  client.promptVariants.list()
  Expect<
    Equals<ResponseOf<"PromptVariantList">, MethodResult<NexusClient["promptVariants"]["list"]>>
  >,
  // PromptVariantCreate  POST /public/v1/agents/:agentId/prompt-variants  ->  client.promptVariants.create()
  Expect<
    Equals<ResponseOf<"PromptVariantCreate">, MethodResult<NexusClient["promptVariants"]["create"]>>
  >,
  // PromptVariantRename  PATCH /public/v1/agents/:agentId/prompt-variants/:variantRef  ->  client.promptVariants.rename()
  Expect<
    Equals<ResponseOf<"PromptVariantRename">, MethodResult<NexusClient["promptVariants"]["rename"]>>
  >,
  // PromptVariantArchive  DELETE /public/v1/agents/:agentId/prompt-variants/:variantRef  ->  client.promptVariants.archive()
  Expect<
    Equals<
      ResponseOf<"PromptVariantArchive">,
      MethodResult<NexusClient["promptVariants"]["archive"]>
    >
  >,
  // PromptVariantFork  POST /public/v1/agents/:agentId/prompt-variants/:variantRef/fork  ->  client.promptVariants.fork()
  Expect<
    Equals<ResponseOf<"PromptVariantFork">, MethodResult<NexusClient["promptVariants"]["fork"]>>
  >,
  // PromptVariantPromote  POST /public/v1/agents/:agentId/prompt-variants/:variantRef/promote  ->  client.promptVariants.promote()
  Expect<
    Equals<
      ResponseOf<"PromptVariantPromote">,
      MethodResult<NexusClient["promptVariants"]["promote"]>
    >
  >,
  // PromptVariantSaveVersion  POST /public/v1/agents/:agentId/prompt-variants/:variantRef/versions  ->  client.promptVariants.saveVersion()
  Expect<
    Equals<
      ResponseOf<"PromptVariantSaveVersion">,
      MethodResult<NexusClient["promptVariants"]["saveVersion"]>
    >
  >,
  // PromptVariantVersionList  GET /public/v1/agents/:agentId/prompt-variants/:variantRef/versions  ->  client.promptVariants.listVersions()
  Expect<
    Equals<
      ResponseOf<"PromptVariantVersionList">,
      MethodResult<NexusClient["promptVariants"]["listVersions"]>
    >
  >,
  // PromptGraph  GET /public/v1/agents/:agentId/prompt-graph  ->  client.promptVariants.graph()
  Expect<Equals<ResponseOf<"PromptGraph">, MethodResult<NexusClient["promptVariants"]["graph"]>>>,
  // PromptCompare  GET /public/v1/agents/:agentId/prompt-compare  ->  client.promptVariants.compare()
  Expect<
    Equals<ResponseOf<"PromptCompare">, MethodResult<NexusClient["promptVariants"]["compare"]>>
  >,
  // GoldenConversationCreate  POST /public/v1/prompt-eval/golden-conversations  ->  client.goldenConversations.create()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationCreate">,
      MethodResult<NexusClient["goldenConversations"]["create"]>
    >
  >,
  // GoldenConversationList  GET /public/v1/prompt-eval/golden-conversations  ->  client.goldenConversations.list()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationList">,
      MethodResult<NexusClient["goldenConversations"]["list"]>
    >
  >,
  // GoldenConversationGet  GET /public/v1/prompt-eval/golden-conversations/:conversationId  ->  client.goldenConversations.get()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationGet">,
      MethodResult<NexusClient["goldenConversations"]["get"]>
    >
  >,
  // GoldenConversationDelete  DELETE /public/v1/prompt-eval/golden-conversations/:conversationId  ->  client.goldenConversations.delete()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationDelete">,
      MethodResult<NexusClient["goldenConversations"]["delete"]>
    >
  >,
  // GoldenConversationAddUserTurn  POST /public/v1/prompt-eval/golden-conversations/:conversationId/turns/user  ->  client.goldenConversations.addUserTurn()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationAddUserTurn">,
      MethodResult<NexusClient["goldenConversations"]["addUserTurn"]>
    >
  >,
  // GoldenConversationGenerate  POST /public/v1/prompt-eval/golden-conversations/:conversationId/generate  ->  client.goldenConversations.generate()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationGenerate">,
      MethodResult<NexusClient["goldenConversations"]["generate"]>
    >
  >,
  // GoldenConversationAccept  POST /public/v1/prompt-eval/golden-conversations/:conversationId/accept  ->  client.goldenConversations.accept()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationAccept">,
      MethodResult<NexusClient["goldenConversations"]["accept"]>
    >
  >,
  // GoldenConversationSetTurnContent  PUT /public/v1/prompt-eval/golden-conversations/:conversationId/turns/:index/content  ->  client.goldenConversations.setTurnContent()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationSetTurnContent">,
      MethodResult<NexusClient["goldenConversations"]["setTurnContent"]>
    >
  >,
  // GoldenConversationSetCheckpoint  PUT /public/v1/prompt-eval/golden-conversations/:conversationId/turns/:index/checkpoint  ->  client.goldenConversations.setCheckpoint()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationSetCheckpoint">,
      MethodResult<NexusClient["goldenConversations"]["setCheckpoint"]>
    >
  >,
  // GoldenConversationReady  POST /public/v1/prompt-eval/golden-conversations/:conversationId/ready  ->  client.goldenConversations.ready()
  Expect<
    Equals<
      ResponseOf<"GoldenConversationReady">,
      MethodResult<NexusClient["goldenConversations"]["ready"]>
    >
  >,
  // PromptEvalRunCreate  POST /public/v1/prompt-eval/runs  ->  client.promptEvalRuns.create()
  Expect<
    Equals<ResponseOf<"PromptEvalRunCreate">, MethodResult<NexusClient["promptEvalRuns"]["create"]>>
  >,
  // PromptEvalRunPreview  POST /public/v1/prompt-eval/runs/preview  ->  client.promptEvalRuns.preview()
  Expect<
    Equals<
      ResponseOf<"PromptEvalRunPreview">,
      MethodResult<NexusClient["promptEvalRuns"]["preview"]>
    >
  >,
  // PromptEvalRunList  GET /public/v1/prompt-eval/runs  ->  client.promptEvalRuns.list()
  Expect<
    Equals<ResponseOf<"PromptEvalRunList">, MethodResult<NexusClient["promptEvalRuns"]["list"]>>
  >,
  // PromptEvalRunGet  GET /public/v1/prompt-eval/runs/:runId  ->  client.promptEvalRuns.get()
  Expect<
    Equals<ResponseOf<"PromptEvalRunGet">, MethodResult<NexusClient["promptEvalRuns"]["get"]>>
  >,
  // PromptEvalRunAbort  POST /public/v1/prompt-eval/runs/:runId/abort  ->  client.promptEvalRuns.abort()
  Expect<
    Equals<ResponseOf<"PromptEvalRunAbort">, MethodResult<NexusClient["promptEvalRuns"]["abort"]>>
  >,
  // PromptEvalRunResults  GET /public/v1/prompt-eval/runs/:runId/results  ->  client.promptEvalRuns.results()
  Expect<
    Equals<
      ResponseOf<"PromptEvalRunResults">,
      MethodResult<NexusClient["promptEvalRuns"]["results"]>
    >
  >,
  // PromptEvalRunCaseGet  GET /public/v1/prompt-eval/runs/:runId/cases/:caseId  ->  client.promptEvalRuns.getCase()
  Expect<
    Equals<
      ResponseOf<"PromptEvalRunCaseGet">,
      MethodResult<NexusClient["promptEvalRuns"]["getCase"]>
    >
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
  // SkillsDeleteDocumentTemplate  DELETE /public/v1/skills/document-templates/:templateId  ->  client.skills.deleteDocumentTemplate()
  Expect<
    Equals<
      ResponseOf<"SkillsDeleteDocumentTemplate">,
      MethodResult<NexusClient["skills"]["deleteDocumentTemplate"]>
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
  // CredentialConnect  POST /public/v1/credentials/connect  ->  client.credentials.connect()
  Expect<
    Equals<ResponseOf<"CredentialConnect">, MethodResult<NexusClient["credentials"]["connect"]>>
  >,
  // CredentialConnectStatus  GET /public/v1/credentials/connect/:handshakeId  ->  client.credentials.connectStatus()
  Expect<
    Equals<
      ResponseOf<"CredentialConnectStatus">,
      MethodResult<NexusClient["credentials"]["connectStatus"]>
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
  // DeploymentChatSessionCreate  POST /public/v1/deployments/:deploymentId/chat-session  ->  client.chat.createSession()
  Expect<
    Equals<
      ResponseOf<"DeploymentChatSessionCreate">,
      MethodResult<NexusClient["chat"]["createSession"]>
    >
  >,
  // DeploymentChatSessionRefresh  POST /public/v1/deployments/:deploymentId/chat-session/refresh  ->  client.chat.refresh()
  Expect<
    Equals<ResponseOf<"DeploymentChatSessionRefresh">, MethodResult<NexusClient["chat"]["refresh"]>>
  >,
  // ChatStopTurn  POST /public/v1/deployments/:deploymentId/chat/stop  ->  client.chat.stop()
  Expect<Equals<ResponseOf<"ChatStopTurn">, MethodResult<NexusClient["chat"]["stop"]>>>,
  // ChatTurnStatus  GET /public/v1/deployments/:deploymentId/chat/status  ->  client.chat.status()
  Expect<Equals<ResponseOf<"ChatTurnStatus">, MethodResult<NexusClient["chat"]["status"]>>>,
  // ChatUploadAttachments  POST /public/v1/deployments/:deploymentId/chat/attachments  ->  client.chat.uploadAttachments()
  Expect<
    Equals<
      ResponseOf<"ChatUploadAttachments">,
      MethodResult<NexusClient["chat"]["uploadAttachments"]>
    >
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
  // WorkflowNodeDelete  DELETE /public/v1/workflows/:workflowId/nodes/:nodeId  ->  client.workflows.deleteNode()
  Expect<
    Equals<ResponseOf<"WorkflowNodeDelete">, MethodResult<NexusClient["workflows"]["deleteNode"]>>
  >,
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
  // WorkspaceMintMountCredentials  POST /public/v1/workspaces/:slug/mount-credentials  ->  client.workspaces.mintMountCredentials()
  Expect<
    Equals<
      ResponseOf<"WorkspaceMintMountCredentials">,
      MethodResult<NexusClient["workspaces"]["mintMountCredentials"]>
    >
  >,
  // WorkspaceUploadBatch  POST /public/v1/workspaces/:slug/upload-batch  ->  client.workspaces.uploadBatch()
  Expect<
    Equals<
      ResponseOf<"WorkspaceUploadBatch">,
      MethodResult<NexusClient["workspaces"]["uploadBatch"]>
    >
  >,
  // WorkspaceFileHistory  GET /public/v1/workspaces/:slug/history  ->  client.workspaces.history()
  Expect<
    Equals<ResponseOf<"WorkspaceFileHistory">, MethodResult<NexusClient["workspaces"]["history"]>>
  >,
  // WorkspaceRevert  POST /public/v1/workspaces/:slug/revert  ->  client.workspaces.revert()
  Expect<Equals<ResponseOf<"WorkspaceRevert">, MethodResult<NexusClient["workspaces"]["revert"]>>>,
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
  // ScoreRecord  POST /public/v1/scores  ->  client.scores.record()
  Expect<Equals<ResponseOf<"ScoreRecord">, MethodResult<NexusClient["scores"]["record"]>>>,
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
  // PromptAssistantGetThread  GET /public/v1/prompt-assistant/threads/:threadId  ->  client.promptAssistant.getThread()
  Expect<
    Equals<
      ResponseOf<"PromptAssistantGetThread">,
      MethodResult<NexusClient["promptAssistant"]["getThread"]>
    >
  >,
  // PromptAssistantWaitForThread  GET /public/v1/prompt-assistant/threads/:threadId/wait  ->  client.promptAssistant.awaitThread()
  Expect<
    Equals<
      ResponseOf<"PromptAssistantWaitForThread">,
      MethodResult<NexusClient["promptAssistant"]["awaitThread"]>
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
  // RolesTransitionSystemLifecycle  PUT /public/v1/roles/:roleId/systems/:roleResourceId/lifecycle  ->  client.roles.transitionSystemLifecycle()
  Expect<
    Equals<
      ResponseOf<"RolesTransitionSystemLifecycle">,
      MethodResult<NexusClient["roles"]["transitionSystemLifecycle"]>
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
  >,
  // ── tracks ── the seven scope resources of one work item ─────────────────
  // TrackCreate  POST /public/v1/tracks  ->  client.tracks.create()
  Expect<Equals<ResponseOf<"TrackCreate">, MethodResult<NexusClient["tracks"]["create"]>>>,
  // TrackUpdateCurrentStep  POST /public/v1/tracks/:trackId/current-step  ->  client.tracks.updateCurrentStep()
  Expect<
    Equals<
      ResponseOf<"TrackUpdateCurrentStep">,
      MethodResult<NexusClient["tracks"]["updateCurrentStep"]>
    >
  >,
  // TrackArchive  POST /public/v1/tracks/:trackId/archive  ->  client.tracks.archive()
  Expect<Equals<ResponseOf<"TrackArchive">, MethodResult<NexusClient["tracks"]["archive"]>>>,
  // TrackSetStatus  POST /public/v1/tracks/:trackId/status  ->  client.tracks.setStatus()
  Expect<Equals<ResponseOf<"TrackSetStatus">, MethodResult<NexusClient["tracks"]["setStatus"]>>>,
  // TrackSetNextOwner  POST /public/v1/tracks/:trackId/next-owner  ->  client.tracks.setNextOwner()
  Expect<
    Equals<ResponseOf<"TrackSetNextOwner">, MethodResult<NexusClient["tracks"]["setNextOwner"]>>
  >,
  // TrackList  GET /public/v1/tracks  ->  client.tracks.list()
  Expect<Equals<ResponseOf<"TrackList">, MethodResult<NexusClient["tracks"]["list"]>>>,
  // TrackRead  GET /public/v1/tracks/:trackId  ->  client.tracks.get()
  Expect<Equals<ResponseOf<"TrackRead">, MethodResult<NexusClient["tracks"]["get"]>>>,
  // TrackReadRollup  GET /public/v1/tracks/:trackId/rollup  ->  client.tracks.readRollup()
  Expect<Equals<ResponseOf<"TrackReadRollup">, MethodResult<NexusClient["tracks"]["readRollup"]>>>,
  // TrackListRollups  GET /public/v1/tracks/rollup  ->  client.tracks.readRollups()
  Expect<
    Equals<ResponseOf<"TrackListRollups">, MethodResult<NexusClient["tracks"]["readRollups"]>>
  >,
  // TrackListReady  GET /public/v1/tracks/ready  ->  client.tracks.listReady()
  Expect<Equals<ResponseOf<"TrackListReady">, MethodResult<NexusClient["tracks"]["listReady"]>>>,
  // TrackListReadyTasks  GET /public/v1/tracks/:trackId/tasks/ready  ->  client.tracks.listReadyTasks()
  Expect<
    Equals<ResponseOf<"TrackListReadyTasks">, MethodResult<NexusClient["tracks"]["listReadyTasks"]>>
  >,
  // TrackCreateDependencyEdge  POST /public/v1/tracks/dependencies  ->  client.tracks.createDependencyEdge()
  Expect<
    Equals<
      ResponseOf<"TrackCreateDependencyEdge">,
      MethodResult<NexusClient["tracks"]["createDependencyEdge"]>
    >
  >,
  // TrackCreateSection  POST /public/v1/tracks/:trackId/sections  ->  client.tracks.createSection()
  Expect<
    Equals<ResponseOf<"TrackCreateSection">, MethodResult<NexusClient["tracks"]["createSection"]>>
  >,
  // TrackRenameSection  POST /public/v1/tracks/:trackId/sections/:sectionId/rename  ->  client.tracks.renameSection()
  Expect<
    Equals<ResponseOf<"TrackRenameSection">, MethodResult<NexusClient["tracks"]["renameSection"]>>
  >,
  // TrackListSections  GET /public/v1/tracks/:trackId/sections  ->  client.tracks.listSections()
  Expect<
    Equals<ResponseOf<"TrackListSections">, MethodResult<NexusClient["tracks"]["listSections"]>>
  >,
  // TrackListTasks  GET /public/v1/tracks/:trackId/tasks  ->  client.tracks.listTasks()
  Expect<Equals<ResponseOf<"TrackListTasks">, MethodResult<NexusClient["tracks"]["listTasks"]>>>,
  // TrackReadTask  GET /public/v1/tracks/tasks/:taskId  ->  client.tracks.readTask()
  Expect<Equals<ResponseOf<"TrackReadTask">, MethodResult<NexusClient["tracks"]["readTask"]>>>,
  // TrackClaimTask  POST /public/v1/tracks/tasks/:taskId/claim  ->  client.tracks.claimTask()
  Expect<Equals<ResponseOf<"TrackClaimTask">, MethodResult<NexusClient["tracks"]["claimTask"]>>>,
  // TrackToggleTask  POST /public/v1/tracks/tasks/:taskId/toggle  ->  client.tracks.toggleTask()
  Expect<Equals<ResponseOf<"TrackToggleTask">, MethodResult<NexusClient["tracks"]["toggleTask"]>>>,
  // TrackCreateTaskEdge  POST /public/v1/tracks/:trackId/task-edges  ->  client.tracks.createTaskEdge()
  Expect<
    Equals<ResponseOf<"TrackCreateTaskEdge">, MethodResult<NexusClient["tracks"]["createTaskEdge"]>>
  >,
  // TrackListTaskEdges  GET /public/v1/tracks/:trackId/task-edges  ->  client.tracks.listTaskEdges()
  Expect<
    Equals<ResponseOf<"TrackListTaskEdges">, MethodResult<NexusClient["tracks"]["listTaskEdges"]>>
  >,
  // TrackImportPlan  POST /public/v1/tracks/:trackId/import-plan  ->  client.tracks.importPlan()
  Expect<Equals<ResponseOf<"TrackImportPlan">, MethodResult<NexusClient["tracks"]["importPlan"]>>>,
  // TrackListAgents  GET /public/v1/tracks/:trackId/agents  ->  client.tracks.listAgents()
  Expect<Equals<ResponseOf<"TrackListAgents">, MethodResult<NexusClient["tracks"]["listAgents"]>>>,
  // TrackOpenAgent  POST /public/v1/tracks/:trackId/agents  ->  client.tracks.openAgent()
  Expect<Equals<ResponseOf<"TrackOpenAgent">, MethodResult<NexusClient["tracks"]["openAgent"]>>>,
  // TrackBeatAgent  POST /public/v1/tracks/:trackId/agents/:agentId/beat  ->  client.tracks.beatAgent()
  Expect<Equals<ResponseOf<"TrackBeatAgent">, MethodResult<NexusClient["tracks"]["beatAgent"]>>>,
  // TrackCloseAgent  POST /public/v1/tracks/:trackId/agents/:agentId/close  ->  client.tracks.closeAgent()
  Expect<Equals<ResponseOf<"TrackCloseAgent">, MethodResult<NexusClient["tracks"]["closeAgent"]>>>,
  // TrackListDiaryEntries  GET /public/v1/tracks/:trackId/diary  ->  client.tracks.listDiaryEntries()
  Expect<
    Equals<
      ResponseOf<"TrackListDiaryEntries">,
      MethodResult<NexusClient["tracks"]["listDiaryEntries"]>
    >
  >,
  // TrackAppendDiaryEntry  POST /public/v1/tracks/:trackId/diary  ->  client.tracks.appendDiaryEntry()
  Expect<
    Equals<
      ResponseOf<"TrackAppendDiaryEntry">,
      MethodResult<NexusClient["tracks"]["appendDiaryEntry"]>
    >
  >,
  // TrackListMemoryEntries  GET /public/v1/tracks/:trackId/memory  ->  client.tracks.listMemoryEntries()
  Expect<
    Equals<
      ResponseOf<"TrackListMemoryEntries">,
      MethodResult<NexusClient["tracks"]["listMemoryEntries"]>
    >
  >,
  // TrackPutMemoryEntry  PUT /public/v1/tracks/:trackId/memory  ->  client.tracks.putMemoryEntry()
  Expect<
    Equals<ResponseOf<"TrackPutMemoryEntry">, MethodResult<NexusClient["tracks"]["putMemoryEntry"]>>
  >,
  // TrackDeleteMemoryEntry  DELETE /public/v1/tracks/:trackId/memory/:key  ->  client.tracks.deleteMemoryEntry()
  Expect<
    Equals<
      ResponseOf<"TrackDeleteMemoryEntry">,
      MethodResult<NexusClient["tracks"]["deleteMemoryEntry"]>
    >
  >,
  // TrackListEvents  GET /public/v1/tracks/:trackId/events  ->  client.tracks.listEvents()
  Expect<Equals<ResponseOf<"TrackListEvents">, MethodResult<NexusClient["tracks"]["listEvents"]>>>,

  // TrackListOrganizationEvents  GET /public/v1/track-events  ->  client.tracks.listOrganizationEvents()
  Expect<
    Equals<
      ResponseOf<"TrackListOrganizationEvents">,
      MethodResult<NexusClient["tracks"]["listOrganizationEvents"]>
    >
  >,
  // TrackAppendEvent  POST /public/v1/tracks/:trackId/events  ->  client.tracks.appendEvent()
  Expect<
    Equals<ResponseOf<"TrackAppendEvent">, MethodResult<NexusClient["tracks"]["appendEvent"]>>
  >,
  // EvaluationCreate  POST /public/v1/skills/tasks/:taskId/evaluations  ->  client.evaluations.createSession()
  Expect<
    Equals<
      ResponseOf<"EvaluationCreate">,
      MethodResult<NexusClient["evaluations"]["createSession"]>
    >
  >,
  // EvaluationList  GET /public/v1/skills/tasks/:taskId/evaluations  ->  client.evaluations.listSessions()
  Expect<
    Equals<
      ResponseOf<"EvaluationList">,
      PageItems<MethodResult<NexusClient["evaluations"]["listSessions"]>>
    >
  >,
  // EvaluationGet  GET /public/v1/skills/tasks/:taskId/evaluations/:sessionId  ->  client.evaluations.getSession()
  Expect<
    Equals<ResponseOf<"EvaluationGet">, MethodResult<NexusClient["evaluations"]["getSession"]>>
  >,
  // EvaluationDatasetRows  GET /public/v1/skills/tasks/:taskId/evaluations/:sessionId/dataset  ->  client.evaluations.getDatasetRows()
  Expect<
    Equals<
      ResponseOf<"EvaluationDatasetRows">,
      PageItems<MethodResult<NexusClient["evaluations"]["getDatasetRows"]>>
    >
  >,
  // EvaluationFormats  GET /public/v1/skills/evaluations/formats  ->  client.evaluations.listFormats()
  Expect<
    Equals<ResponseOf<"EvaluationFormats">, MethodResult<NexusClient["evaluations"]["listFormats"]>>
  >,
  // EvaluationJudges  GET /public/v1/skills/evaluations/judges  ->  client.evaluations.listJudges()
  Expect<
    Equals<ResponseOf<"EvaluationJudges">, MethodResult<NexusClient["evaluations"]["listJudges"]>>
  >,
  // WorkflowEdgeCreate  POST /public/v1/workflows/:workflowId/edges  ->  client.workflows.createEdge()
  Expect<
    Equals<ResponseOf<"WorkflowEdgeCreate">, MethodResult<NexusClient["workflows"]["createEdge"]>>
  >,
  // WorkflowTestingStopExecution  POST /public/v1/workflows/:workflowId/executions/:executionId/stop  ->  client.workflows.stopExecution()
  Expect<
    Equals<
      ResponseOf<"WorkflowTestingStopExecution">,
      MethodResult<NexusClient["workflows"]["stopExecution"]>
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
  "ChatStopTurn",
  "ChatTurnStatus",
  "ChatUploadAttachments",
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
  // ── prompt variants (Prompt Lab phase 1) ──
  "PromptVariantList",
  "PromptVariantCreate",
  "PromptVariantRename",
  "PromptVariantArchive",
  "PromptVariantFork",
  "PromptVariantPromote",
  "PromptVariantSaveVersion",
  "PromptVariantVersionList",
  "PromptGraph",
  "PromptCompare",
  // ── golden conversations (Prompt Lab phase 2) ──
  "GoldenConversationCreate",
  "GoldenConversationList",
  "GoldenConversationGet",
  "GoldenConversationDelete",
  "GoldenConversationAddUserTurn",
  "GoldenConversationGenerate",
  "GoldenConversationAccept",
  "GoldenConversationSetTurnContent",
  "GoldenConversationSetCheckpoint",
  "GoldenConversationReady",
  // ── prompt eval runs (Prompt Lab phase 3) ──
  "PromptEvalRunCreate",
  "PromptEvalRunPreview",
  "PromptEvalRunList",
  "PromptEvalRunGet",
  "PromptEvalRunAbort",
  "PromptEvalRunResults",
  "PromptEvalRunCaseGet",
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
  "SkillsDeleteDocumentTemplate",
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
  "CredentialConnect",
  "CredentialConnectStatus",
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
  "DeploymentChatSessionCreate",
  "DeploymentChatSessionRefresh",
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
  "WorkflowNodeDelete",
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
  "WorkspaceMintMountCredentials",
  "WorkspaceUploadBatch",
  "WorkspaceFileHistory",
  "WorkspaceRevert",
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
  "ScoreRecord",
  "PromptAssistantChat",
  "PromptAssistantListThreads",
  "PromptAssistantGetThread",
  "PromptAssistantWaitForThread",
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
  "RolesTransitionSystemLifecycle",
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
  "RolesRemovePermissionSetMember",
  // tracks — the seven scope resources of one work item
  "TrackCreate",
  "TrackUpdateCurrentStep",
  "TrackArchive",
  "TrackSetStatus",
  "TrackSetNextOwner",
  "TrackList",
  "TrackListRollups",
  "TrackRead",
  "TrackReadRollup",
  "TrackListReady",
  "TrackListReadyTasks",
  "TrackCreateDependencyEdge",
  "TrackCreateSection",
  "TrackRenameSection",
  "TrackListSections",
  "TrackListTasks",
  "TrackReadTask",
  "TrackClaimTask",
  "TrackToggleTask",
  "TrackCreateTaskEdge",
  "TrackListTaskEdges",
  "TrackImportPlan",
  "TrackListAgents",
  "TrackOpenAgent",
  "TrackBeatAgent",
  "TrackCloseAgent",
  "TrackListDiaryEntries",
  "TrackAppendDiaryEntry",
  "TrackListMemoryEntries",
  "TrackPutMemoryEntry",
  "TrackDeleteMemoryEntry",
  "TrackListEvents",
  "TrackListOrganizationEvents",
  "TrackAppendEvent",
  // ── wired by #4521; gated here because the types measured EQUAL ──
  "EvaluationCreate",
  "EvaluationList",
  "EvaluationGet",
  "EvaluationDatasetRows",
  "EvaluationFormats",
  "EvaluationJudges",
  "WorkflowEdgeCreate",
  "WorkflowTestingStopExecution"
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
  // GET /public/v1/skills/tasks/:taskId/evaluations/:sessionId/results  ->  client.evaluations.getResults()
  EvaluationResults:
    "Measured with the checker: `Types of property 'status' are incompatible. Type 'string' is not assignable to type 'EvalRowStatus'.` The contract leaves `status` an unconstrained `string`; the SDK publishes the narrower named union `EvalRowStatus`. The SDK is NARROWER than the server, the same shape as the `AgentGet`/`AgentCreate` entries above: a legacy or newly-added status arrives as a value no caller can name and an exhaustive switch falls through silently. `judgeStatus` is `string` on both sides today but carries the same latent asymmetry; the checker stops at the first incompatible property, so it is unmeasured rather than known-equal. Fixing it is a decision about whether the contract should narrow or this package should widen, not a type edit.",
  // GET /public/v1/scores  ->  client.scores.list()
  ScoreList:
    '`valueType`, `scorableType` and `emitterType` are `z.nativeEnum(DbEnum.X)` in the contract, so they resolve to TS STRING-ENUM MEMBER types (`DbEnum.ScoreValueType.NUMERIC`), and this package publishes with empty dependencies and may not import `@nexus/types` (see `types/chat.ts`). A hand-written literal union is assignable to a string enum but NOT type-node equal to it, so `Equals` is false however the union is spelled — measured directly: `Expect<Equals<"NUMERIC"|"CATEGORICAL"|"BOOLEAN", DbEnum.ScoreValueType>>` does not compile. NOT a transcription slip and not a narrower/wider mismatch: the SDK type describes exactly the right values. Fixing it means either the contract spelling these as `z.enum([...])` like `TicketType` (which IS gated on a hand-written union), or this package gaining a way to mirror an enum nominally — both contract decisions rather than type edits. `ScoreRecord` is unaffected and IS gated, because its response is `{ scoreId: string }` and carries no enum. NOT NARROWABLE, which is why it is the one ledger row with no entry in `V1_RESPONSE_DRIFT_NARROWED`: `valueType` is the DISCRIMINANT of a three-member union, so erasing it collapses the very structure the type exists to express, and the contract side is recorded `kind: "opaque"` in `response-contract.generated.ts` — a typeless payload has no key set to align against. Narrowing this row would need the union modelled on both sides first, which is the same contract decision the paragraph above already names.',
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
    "Five reasoning knobs — `thinkingLevel`, `thinkingDisplay`, `reasoningEffort`, `geminiThinkingLevel`, `kimiReasoningEffort` — are `string` here against literal unions in the contract. The SDK is WIDER, so no field is hidden; what is lost is the ability to name a legal value. The unions are provider-specific and belong to the model-provider surface, so narrowing them here is a contract question rather than a transcription fix.",
  // POST /public/v1/skills/tasks  ->  client.skills.createTask()
  SkillsCreateTask:
    "Five reasoning knobs — `thinkingLevel`, `thinkingDisplay`, `reasoningEffort`, `geminiThinkingLevel`, `kimiReasoningEffort` — are `string` here against literal unions in the contract. The SDK is WIDER, so no field is hidden; what is lost is the ability to name a legal value. The unions are provider-specific and belong to the model-provider surface, so narrowing them here is a contract question rather than a transcription fix.",
  // POST /public/v1/skills/tasks/:taskId/duplicate  ->  client.skills.duplicateTask()
  SkillsDuplicateTask:
    "Five reasoning knobs — `thinkingLevel`, `thinkingDisplay`, `reasoningEffort`, `geminiThinkingLevel`, `kimiReasoningEffort` — are `string` here against literal unions in the contract. The SDK is WIDER, so no field is hidden; what is lost is the ability to name a legal value. The unions are provider-specific and belong to the model-provider surface, so narrowing them here is a contract question rather than a transcription fix.",
  // PATCH /public/v1/skills/tasks/:taskId  ->  client.skills.updateTask()
  SkillsUpdateTask:
    "Five reasoning knobs — `thinkingLevel`, `thinkingDisplay`, `reasoningEffort`, `geminiThinkingLevel`, `kimiReasoningEffort` — are `string` here against literal unions in the contract. The SDK is WIDER, so no field is hidden; what is lost is the ability to name a legal value. The unions are provider-specific and belong to the model-provider surface, so narrowing them here is a contract question rather than a transcription fix.",
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
  >,
  // EvaluationResults  ->  client.evaluations.getResults()
  Expect<
    Equals<
      Equals<
        ResponseOf<"EvaluationResults">,
        PageItems<MethodResult<NexusClient["evaluations"]["getResults"]>>
      >,
      false
    >
  >,
  // ScoreList  ->  client.scores.list()
  //
  // Added by NEX-4550. This row was ledgered with no negative assertion, so it
  // was the one entry that could be repaired in silence and the one entry the
  // vacuity control did not cover. `scores.list()` is deliberately NOT a
  // paginated method — its own docblock says so — so the pair is compared
  // directly and not through `PageItems`, which would compare the wrong halves
  // and report `false` for a reason that is not the ledgered one.
  Expect<
    Equals<Equals<ResponseOf<"ScoreList">, MethodResult<NexusClient["scores"]["list"]>>, false>
  >
];

// ---------------------------------------------------------------------------
// Narrowing a ledger row: the rest of the DTO is still gated
// ---------------------------------------------------------------------------

/**
 * 🚨 A LEDGER ROW BUYS SILENCE ON THE WHOLE ROUTE, NOT ON THE FIELD IT NAMES.
 *
 * `V1_RESPONSE_DRIFT` is keyed by ROUTE. A row removes that route from
 * `V1ResponseAssertions` entirely, so its DTO has no positive comparison at all
 * and every OTHER divergence in it is free. The negative assertion beside it
 * does not close that: it says the pair still DIFFERS, and it stays true — and
 * therefore green — however many further fields separate. An entry that names
 * one field reads as narrow and behaves as broad.
 *
 * That is not a theoretical property. The five `Tool*` rows are ledgered for
 * `config: unknown`, one key of the twelve on `AgentToolConfig`, and under that
 * silence `AgentToolConfig.type` — the SDK's hand-written spelling of the Prisma
 * `AgentToolConfigType` enum — sat with no gate anywhere in this package for the
 * life of the ledger. It was found by reading, which is what this whole file
 * exists to stop being the mechanism.
 *
 * 🔬 AND THE SILENCE IS MEASURED, NOT INFERRED. `MeListOrganizations` is
 * ledgered for `UserOrganization.name`; changing its UNNAMED sibling `role`
 * from `string` to `number` left this package's typecheck at exit 0 with zero
 * bytes of output. The same class of edit on a GATED route (`AgentFolder.name`)
 * reds three lines, and on a NARROWED one (`AgentToolConfig.isActive`) reds
 * five. One instrument, three mutants: the compiler sees all three, and the
 * ledger row is what swallows the first.
 *
 * ## The shape, and exactly how far it reaches
 *
 * A narrowed row erases the ledgered PATHS from both sides and asserts the
 * remainder is still exactly equal. So `config` stays unchecked and the other
 * eleven fields of `AgentToolConfig` go back under the gate, including `type`.
 *
 * ✅ A PATH MAY NOW BE NESTED. This used to reach a top-level key only, and the
 * rows whose reason named `ConversationDetail.contact.*`, `Satisfaction.framework`,
 * `providers[].slug` or `ParameterDefinition.type` were left route-wide because
 * `Omit` could not express them. `DeepOmit` in `../deep-omit.ts` erases one
 * dotted path and changes nothing else, so those rows are narrowed here now.
 *
 * ⚠️ The objection that kept them un-narrowed was not wrong and has been paid
 * rather than dropped: a by-path erase fails VACUOUSLY, and a narrowing that
 * silently erases more than it names is worse than the route-wide silence it
 * replaces. `../deep-omit.test.ts` is the price — every branch of that machinery
 * carries a mutant that reds it, including the two that erase a sibling instead
 * of the named path.
 *
 * 🔑 A NARROWED ROW IS STILL A LEDGER ROW. Its negative assertion above stays,
 * so the self-pruning still fires when the ledgered field itself is repaired.
 * The two assertions answer different questions and both are needed: the
 * negative one says "this row is still owed", the narrowed one says "and
 * nothing ELSE in it has moved since".
 *
 * 🚨 A NARROWING IS A CLAIM THAT THE ROW'S REASON IS COMPLETE, AND THAT CLAIM IS
 * CHECKED BY WHETHER IT COMPILES. A row narrowed at the paths its reason names
 * goes green only if those paths are the WHOLE divergence; anything further in
 * that DTO reds the line. So the rows still absent from the table below are not
 * a backlog anyone has to trust — they are rows where the erase was attempted,
 * did not go green, and the residue is recorded beside them.
 */

/**
 * One POSITIVE assertion per narrowed ledger row: everything the row does NOT
 * name must still match exactly.
 *
 * A `false` here is a compile error on that exact line, and the line names the
 * route. Same enforcement as {@link V1ResponseAssertions} — `tsc`, never vitest.
 */
/**
 * The paths each narrowed row erases, declared ONCE.
 *
 * Each constant is read two ways — as a type by the assertions below, and as a
 * value by the runtime table — so the two cannot disagree about what a row
 * exempts. The old shape hand-wrote the keys in both places and reconciled
 * them with a test; deriving both from one declaration removes the thing that
 * test was watching for.
 */
/** `AgentToolConfig.config` is `unknown` here against a seven-key object in the
 * contract. Opaque by design; the other eleven keys — `type` among them — are not. */
const TOOL_CONFIG_PATHS = ["config"] as const;

/** `model` is `string | null` in the contract and a closed 16-member union here. */
const AGENT_MODEL_PATHS = ["model"] as const;

/** `status` is `WorkflowStatus` here and bare `string` in the contract. */
const WORKFLOW_STATUS_PATHS = ["status"] as const;

/** The five reasoning knobs are `string` here against literal unions in the
 * contract. They sit on `TaskModelTuning`, which `TaskDetail` extends, so each
 * is a TOP-LEVEL key of the response rather than a nested one. */
const SKILL_TUNING_PATHS = [
  "thinkingLevel",
  "thinkingDisplay",
  "reasoningEffort",
  "geminiThinkingLevel",
  "kimiReasoningEffort"
] as const;

/** Both causes the row names, at the paths they actually occupy.
 *
 * `contact.identifier` is deliberately ABSENT: it is required on both sides, so
 * erasing it would exempt a field that is not drifting. `framework` and `source`
 * live on `SatisfactionScore`, which is reachable at TWO paths — `satisfaction
 * .latest` and the `satisfaction.all` array — and both have to be named or the
 * remainder still differs. */
const CONVERSATION_DETAIL_PATHS = [
  "contact.service",
  "contact.displayName",
  "contact.primaryPhone",
  "contact.primaryEmail",
  "contact.externalUserId",
  "satisfaction.latest.framework",
  "satisfaction.latest.source",
  "satisfaction.all.framework",
  "satisfaction.all.source"
] as const;

/** `responseHandling` is `string` here against a three-member union. */
const ASSIGNED_USERS_PATHS = ["responseHandling"] as const;

/** `providers[].slug` — array traversal is implicit, so no index segment. */
const CLOUD_PROVIDER_PATHS = ["providers.slug"] as const;

/** `ParameterDefinition.type` is `string` here against a nine-member union,
 * three levels down through two arrays. */
const ACCESS_CARD_PATHS = ["actions.parameters.type"] as const;

/** A ROOT array of `UserOrganization`; `name` is a key of the element type. */
const ME_ORG_PATHS = ["name"] as const;

/** Three keys required here and optional in the contract, on the single-template
 * responses. */
const HTML_TEMPLATE_PATHS = ["description", "inputSchema", "updatedAt"] as const;

/** The same three, one level down, on the list response's `items` array. */
const HTML_TEMPLATE_LIST_PATHS = [
  "items.description",
  "items.inputSchema",
  "items.updatedAt"
] as const;

/** All three exist on the CONTRACT side only. `DeepOmit` is a no-op on the side
 * that lacks the key, which is what lets a one-sided absence be narrowed at all. */
const WORKSPACE_LISTING_PATHS = ["references", "folders.modifiedAt", "folders.size"] as const;

/** `status` is the measured divergence; `judgeStatus` carries the same latent
 * asymmetry and the checker stopped at the first, so it is named too. */
const EVAL_RESULT_PATHS = ["status", "judgeStatus"] as const;

/** `toolCalls` is contract-only. `tool` is erased whole because the drift is on
 * the KEY's optionality — required here, nullish in the contract — which no
 * sub-path erase can reach. */
const MESSAGE_PATHS = [
  "messages.toolCalls",
  "messages.author.userId",
  "messages.author.agentId",
  "messages.author.name",
  "messages.sender.identifier",
  "messages.sender.displayName",
  "messages.tool",
  "nextBefore"
] as const;

/**
 * One POSITIVE assertion per narrowed ledger row: everything the row does NOT
 * name must still match exactly.
 *
 * A `false` here is a compile error on that exact line, and the line names the
 * route. Same enforcement as {@link V1ResponseAssertions} — `tsc`, never vitest.
 */
export type V1ResponseDriftNarrowed = [
  // ToolList
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ToolList">, typeof TOOL_CONFIG_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["agents"]["tools"]["list"]>, typeof TOOL_CONFIG_PATHS>
    >
  >,
  // ToolGet
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ToolGet">, typeof TOOL_CONFIG_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["agents"]["tools"]["get"]>, typeof TOOL_CONFIG_PATHS>
    >
  >,
  // ToolCreate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ToolCreate">, typeof TOOL_CONFIG_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["agents"]["tools"]["create"]>, typeof TOOL_CONFIG_PATHS>
    >
  >,
  // ToolUpdate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ToolUpdate">, typeof TOOL_CONFIG_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["agents"]["tools"]["update"]>, typeof TOOL_CONFIG_PATHS>
    >
  >,
  // ToolAttachCollection
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ToolAttachCollection">, typeof TOOL_CONFIG_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["agents"]["tools"]["attachCollection"]>,
        typeof TOOL_CONFIG_PATHS
      >
    >
  >,
  // AgentGet
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"AgentGet">, typeof AGENT_MODEL_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["agents"]["get"]>, typeof AGENT_MODEL_PATHS>
    >
  >,
  // AgentCreate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"AgentCreate">, typeof AGENT_MODEL_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["agents"]["create"]>, typeof AGENT_MODEL_PATHS>
    >
  >,
  // AgentUpdate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"AgentUpdate">, typeof AGENT_MODEL_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["agents"]["update"]>, typeof AGENT_MODEL_PATHS>
    >
  >,
  // AgentDuplicate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"AgentDuplicate">, typeof AGENT_MODEL_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["agents"]["duplicate"]>, typeof AGENT_MODEL_PATHS>
    >
  >,
  // WorkflowList
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"WorkflowList">, typeof WORKFLOW_STATUS_PATHS>,
      DeepOmitAll<
        PageItems<MethodResult<NexusClient["workflows"]["list"]>>,
        typeof WORKFLOW_STATUS_PATHS
      >
    >
  >,
  // WorkflowCreate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"WorkflowCreate">, typeof WORKFLOW_STATUS_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["workflows"]["create"]>, typeof WORKFLOW_STATUS_PATHS>
    >
  >,
  // WorkflowGet
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"WorkflowGet">, typeof WORKFLOW_STATUS_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["workflows"]["get"]>, typeof WORKFLOW_STATUS_PATHS>
    >
  >,
  // WorkflowUpdate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"WorkflowUpdate">, typeof WORKFLOW_STATUS_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["workflows"]["update"]>, typeof WORKFLOW_STATUS_PATHS>
    >
  >,
  // WorkflowDuplicate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"WorkflowDuplicate">, typeof WORKFLOW_STATUS_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["workflows"]["duplicate"]>, typeof WORKFLOW_STATUS_PATHS>
    >
  >,
  // WorkflowExecutionDiagnose
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"WorkflowExecutionDiagnose">, typeof WORKFLOW_STATUS_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["workflowExecutions"]["diagnose"]>,
        typeof WORKFLOW_STATUS_PATHS
      >
    >
  >,
  // SkillsGetTask
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"SkillsGetTask">, typeof SKILL_TUNING_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["skills"]["getTask"]>, typeof SKILL_TUNING_PATHS>
    >
  >,
  // SkillsCreateTask
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"SkillsCreateTask">, typeof SKILL_TUNING_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["skills"]["createTask"]>, typeof SKILL_TUNING_PATHS>
    >
  >,
  // SkillsDuplicateTask
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"SkillsDuplicateTask">, typeof SKILL_TUNING_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["skills"]["duplicateTask"]>, typeof SKILL_TUNING_PATHS>
    >
  >,
  // SkillsUpdateTask
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"SkillsUpdateTask">, typeof SKILL_TUNING_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["skills"]["updateTask"]>, typeof SKILL_TUNING_PATHS>
    >
  >,
  // AccessCardAvailableActions
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"AccessCardAvailableActions">, typeof ACCESS_CARD_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["credentials"]["cards"]["availableActions"]>,
        typeof ACCESS_CARD_PATHS
      >
    >
  >,
  // ConversationGet
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ConversationGet">, typeof CONVERSATION_DETAIL_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["conversations"]["get"]>,
        typeof CONVERSATION_DETAIL_PATHS
      >
    >
  >,
  // ConversationUpdateStatuses
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ConversationUpdateStatuses">, typeof CONVERSATION_DETAIL_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["conversations"]["updateStatuses"]>,
        typeof CONVERSATION_DETAIL_PATHS
      >
    >
  >,
  // ConversationUpdateTopic
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ConversationUpdateTopic">, typeof CONVERSATION_DETAIL_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["conversations"]["updateTopic"]>,
        typeof CONVERSATION_DETAIL_PATHS
      >
    >
  >,
  // ConversationUpdateMetadata
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ConversationUpdateMetadata">, typeof CONVERSATION_DETAIL_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["conversations"]["updateMetadata"]>,
        typeof CONVERSATION_DETAIL_PATHS
      >
    >
  >,
  // ConversationSetAssignedUsers
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ConversationSetAssignedUsers">, typeof CONVERSATION_DETAIL_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["conversations"]["setAssignedUsers"]>,
        typeof CONVERSATION_DETAIL_PATHS
      >
    >
  >,
  // ConversationGetAssignedUsers
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ConversationGetAssignedUsers">, typeof ASSIGNED_USERS_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["conversations"]["getAssignedUsers"]>,
        typeof ASSIGNED_USERS_PATHS
      >
    >
  >,
  // ConversationListMessages
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"ConversationListMessages">, typeof MESSAGE_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["conversations"]["getMessages"]>, typeof MESSAGE_PATHS>
    >
  >,
  // CloudImportListProviders
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"CloudImportListProviders">, typeof CLOUD_PROVIDER_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["cloudImports"]["listProviders"]>,
        typeof CLOUD_PROVIDER_PATHS
      >
    >
  >,
  // WorkspaceListFolder
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"WorkspaceListFolder">, typeof WORKSPACE_LISTING_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["workspaces"]["listFiles"]>,
        typeof WORKSPACE_LISTING_PATHS
      >
    >
  >,
  // HtmlMessageTemplateList
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"HtmlMessageTemplateList">, typeof HTML_TEMPLATE_LIST_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["htmlMessageTemplates"]["list"]>,
        typeof HTML_TEMPLATE_LIST_PATHS
      >
    >
  >,
  // HtmlMessageTemplateGet
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"HtmlMessageTemplateGet">, typeof HTML_TEMPLATE_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["htmlMessageTemplates"]["get"]>,
        typeof HTML_TEMPLATE_PATHS
      >
    >
  >,
  // HtmlMessageTemplateCreate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"HtmlMessageTemplateCreate">, typeof HTML_TEMPLATE_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["htmlMessageTemplates"]["create"]>,
        typeof HTML_TEMPLATE_PATHS
      >
    >
  >,
  // HtmlMessageTemplateUpdate
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"HtmlMessageTemplateUpdate">, typeof HTML_TEMPLATE_PATHS>,
      DeepOmitAll<
        MethodResult<NexusClient["htmlMessageTemplates"]["update"]>,
        typeof HTML_TEMPLATE_PATHS
      >
    >
  >,
  // MeListOrganizations
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"MeListOrganizations">, typeof ME_ORG_PATHS>,
      DeepOmitAll<MethodResult<NexusClient["me"]["organizations"]>, typeof ME_ORG_PATHS>
    >
  >,
  // EvaluationResults
  Expect<
    Equals<
      DeepOmitAll<ResponseOf<"EvaluationResults">, typeof EVAL_RESULT_PATHS>,
      DeepOmitAll<
        PageItems<MethodResult<NexusClient["evaluations"]["getResults"]>>,
        typeof EVAL_RESULT_PATHS
      >
    >
  >
];

/**
 * The same rows as a runtime table, for the consistency checks below.
 *
 * Derived from the constants above rather than retyped, so a path added to a
 * narrowing cannot be missing here.
 */
const V1_RESPONSE_DRIFT_NARROWED: Record<string, readonly string[]> = {
  ToolList: TOOL_CONFIG_PATHS,
  ToolGet: TOOL_CONFIG_PATHS,
  ToolCreate: TOOL_CONFIG_PATHS,
  ToolUpdate: TOOL_CONFIG_PATHS,
  ToolAttachCollection: TOOL_CONFIG_PATHS,
  AgentGet: AGENT_MODEL_PATHS,
  AgentCreate: AGENT_MODEL_PATHS,
  AgentUpdate: AGENT_MODEL_PATHS,
  AgentDuplicate: AGENT_MODEL_PATHS,
  WorkflowList: WORKFLOW_STATUS_PATHS,
  WorkflowCreate: WORKFLOW_STATUS_PATHS,
  WorkflowGet: WORKFLOW_STATUS_PATHS,
  WorkflowUpdate: WORKFLOW_STATUS_PATHS,
  WorkflowDuplicate: WORKFLOW_STATUS_PATHS,
  WorkflowExecutionDiagnose: WORKFLOW_STATUS_PATHS,
  SkillsGetTask: SKILL_TUNING_PATHS,
  SkillsCreateTask: SKILL_TUNING_PATHS,
  SkillsDuplicateTask: SKILL_TUNING_PATHS,
  SkillsUpdateTask: SKILL_TUNING_PATHS,
  AccessCardAvailableActions: ACCESS_CARD_PATHS,
  ConversationGet: CONVERSATION_DETAIL_PATHS,
  ConversationUpdateStatuses: CONVERSATION_DETAIL_PATHS,
  ConversationUpdateTopic: CONVERSATION_DETAIL_PATHS,
  ConversationUpdateMetadata: CONVERSATION_DETAIL_PATHS,
  ConversationSetAssignedUsers: CONVERSATION_DETAIL_PATHS,
  ConversationGetAssignedUsers: ASSIGNED_USERS_PATHS,
  ConversationListMessages: MESSAGE_PATHS,
  CloudImportListProviders: CLOUD_PROVIDER_PATHS,
  WorkspaceListFolder: WORKSPACE_LISTING_PATHS,
  HtmlMessageTemplateList: HTML_TEMPLATE_LIST_PATHS,
  HtmlMessageTemplateGet: HTML_TEMPLATE_PATHS,
  HtmlMessageTemplateCreate: HTML_TEMPLATE_PATHS,
  HtmlMessageTemplateUpdate: HTML_TEMPLATE_PATHS,
  MeListOrganizations: ME_ORG_PATHS,
  EvaluationResults: EVAL_RESULT_PATHS
};

/**
 * The ledgered routes that must carry a narrowing for as long as they are
 * ledgered.
 *
 * 🔴 THIS REPLACED A COUNT FLOOR (`narrowed.length >= 5`), WHICH REFUSED ITS OWN
 * CURE. Repairing one of these routes removes it from {@link V1_RESPONSE_DRIFT}
 * and from the narrowed table together, so a floor over the narrowed table's own
 * size reddened on exactly the commit that fixed the debt it was tracking — the
 * shape `ledger-gates-do-not-refuse-their-cure` names `control-dies-on-success`.
 *
 * 🔑 THE DRAIN-SAFE FORM ASSERTS OVER THE ROWS THAT SURVIVE. A route named here
 * that is still ledgered must still be narrowed; one that has been repaired is
 * absent from `V1_RESPONSE_DRIFT`, so it is not an offender and this passes in
 * silence — at zero as readily as at thirty-five. A stale name left here after a
 * repair is inert for the same reason, which is the safe direction.
 *
 * ⚠️ It is NOT derived from `V1_RESPONSE_DRIFT_NARROWED`. Deriving it there would
 * make deleting a narrowing delete its own obligation, which is the anti-deletion
 * ratchet this exists to be. That is why these names are written out again by
 * hand while the PATHS beside them are not: the obligation and the content of a
 * narrowing fail in opposite directions, and only one of them is safe to derive.
 */
const NARROWABLE_LEDGER_ROUTES: readonly string[] = [
  "ToolList",
  "ToolGet",
  "ToolCreate",
  "ToolUpdate",
  "ToolAttachCollection",
  "AgentGet",
  "AgentCreate",
  "AgentUpdate",
  "AgentDuplicate",
  "WorkflowList",
  "WorkflowCreate",
  "WorkflowGet",
  "WorkflowUpdate",
  "WorkflowDuplicate",
  "WorkflowExecutionDiagnose",
  "SkillsGetTask",
  "SkillsCreateTask",
  "SkillsDuplicateTask",
  "SkillsUpdateTask",
  "AccessCardAvailableActions",
  "ConversationGet",
  "ConversationUpdateStatuses",
  "ConversationUpdateTopic",
  "ConversationUpdateMetadata",
  "ConversationSetAssignedUsers",
  "ConversationGetAssignedUsers",
  "ConversationListMessages",
  "CloudImportListProviders",
  "WorkspaceListFolder",
  "HtmlMessageTemplateList",
  "HtmlMessageTemplateGet",
  "HtmlMessageTemplateCreate",
  "HtmlMessageTemplateUpdate",
  "MeListOrganizations",
  "EvaluationResults"
];

/**
 * THE EXACT SIZE OF `GATED_ROUTES`, asserted with `toBe`.
 *
 * An independent witness to how many routes are gated. Never
 * `GATED_ROUTES.length` compared against itself, which passes vacuously; and
 * never derived from `routes` minus `V1_RESPONSE_DRIFT`, because the coverage
 * case at the bottom of this file already asserts that identity, so a bound
 * built on it moves in step with the very demotion it would need to catch.
 * A hardcoded literal is the only shape that can witness anything here.
 *
 * 🚨 IT IS AN EQUALITY BECAUSE A FLOOR ONLY REFUSES GROWTH, WHICH IS HALF A
 * GATE. Under `toBeGreaterThanOrEqual` a number left behind never reports
 * itself: this stood at 302 against a live 318 on staging, and later at 329
 * against 331, green both times. That gap is not cosmetic — it is this gate
 * switched off for exactly that many demotions. Measured on the 329-against-331
 * state: moving two gated routes into `V1_RESPONSE_DRIFT` — precisely the
 * regression this number exists to refuse — left the suite 8/8 GREEN. The same
 * mutation under `toBe` reds and prints both numbers.
 *
 * WHEN TWO BRANCHES BOTH ADD ROUTES, THE MERGE ADDS BOTH DELTAS — it never
 * takes the larger. The raises are independent, so taking `max()` discards the
 * smaller one, unratcheting exactly as far as that branch had gained. Under
 * `toBeGreaterThanOrEqual` that botched resolution was SILENT; under `toBe` it
 * is the failure below, printing the number to write. That is the argument for
 * the stricter matcher: it does not make the merge harder, it makes a wrong
 * merge visible.
 *
 * ⚠️ THE COST IS AN EDIT ON EVERY BRANCH THAT ADDS A ROUTE, AND IT IS SMALL
 * HERE FOR A MEASURED REASON — `GATED_ROUTES` is a hand-written literal, so
 * nothing but a deliberate edit moves it, and its membership changed in 1
 * commit in the 180 days to 2026-08-30. Contrast `GENERATED_PAGE_FLOOR` in
 * `packages/cli/src/cli-docs-are-generated.test.ts`, which counts files on disk
 * that grew by 52 in that same window: that one stays a floor, and the
 * difference between the two is churn, not taste.
 */
const GATED_ROUTE_COUNT = 342;

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
    expect(
      GATED_ROUTES.length,
      "GATED_ROUTES no longer holds exactly GATED_ROUTE_COUNT names. If you ADDED a " +
        "gated route, set GATED_ROUTE_COUNT to the number on the left. If you did not, " +
        "a route has LEFT the gated set — check whether it was demoted into " +
        "V1_RESPONSE_DRIFT, which is the regression this count exists to refuse. " +
        "Merging two branches that each added routes? Add both deltas; never take the larger."
    ).toBe(GATED_ROUTE_COUNT);
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

  /**
   * A narrowing is only meaningful beside the row it narrows. One naming a
   * route that is gated outright, or one whose row was repaired away, is a
   * stale assertion reading as coverage.
   */
  it("narrows only routes that are actually ledgered", () => {
    const narrowed = Object.keys(V1_RESPONSE_DRIFT_NARROWED);

    expect(
      narrowed.filter((name) => !(name in V1_RESPONSE_DRIFT)),
      "narrowed rows for routes that are not in V1_RESPONSE_DRIFT — a narrowing " +
        "belongs beside its ledger row; if the route left the ledger, delete the " +
        "narrowed assertion in V1ResponseDriftNarrowed too"
    ).toEqual([]);

    for (const [name, keys] of Object.entries(V1_RESPONSE_DRIFT_NARROWED)) {
      expect(
        keys.length,
        `${name} narrows nothing — an empty key list erases nothing`
      ).toBeGreaterThan(0);
    }

    expect(
      NARROWABLE_LEDGER_ROUTES.filter(
        (name) => name in V1_RESPONSE_DRIFT && !(name in V1_RESPONSE_DRIFT_NARROWED)
      ),
      "a route declared narrowable is still ledgered but lost its narrowing — a " +
        "route-wide row leaves every field it does not name unchecked, so dropping " +
        "the narrowing silently un-gates the rest of that DTO. Restore it, or repair " +
        "the route so it leaves V1_RESPONSE_DRIFT altogether."
    ).toEqual([]);
  });

  /**
   * THE PAIRING BETWEEN THE LEDGER AND ITS NEGATIVE ASSERTIONS, RECONCILED
   * RATHER THAN REMEMBERED.
   *
   * `V1ResponseDrift` is hand-written one entry per ledger row and nothing
   * compared the two lists, so a row could be added without its assertion. One
   * had been: `ScoreList` was ledgered with no negative assertion at all, which
   * cost it both jobs that assertion does — it was not self-pruning, so
   * repairing the route would have turned nothing red, and it was outside the
   * vacuity control that the whole file's green depends on.
   *
   * This reads the file's own source because the assertions are TYPES and this
   * runner cannot see them. The read is anchored to the `V1ResponseDrift` block
   * rather than run over the whole file: `ResponseOf<"X">` appears in the
   * positive assertions and in the narrowed ones too, and a match from either
   * would report a pairing that does not exist.
   */
  it("gives every ledgered route a negative assertion", () => {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");

    // 🔴 EVERY MARKER HERE BEGINS WITH A NEWLINE, AND THAT IS THE WHOLE REASON
    // THESE CONTROLS CAN FAIL AT ALL.
    //
    // A file that searches its own source contains every string it searches for,
    // so an `indexOf` over this file finds its OWN call site once the real
    // declaration is renamed — and every assertion phrased over the located text
    // is then satisfied by that call site. This defect has now been found three
    // times in this file, each time inside the cure for the previous one:
    // `expect(start).toBeGreaterThan(-1)` could not fail; `includes` of the
    // declaration could not fail; and `startsWith` of it could not fail either,
    // because the slice BEGINS at whatever `indexOf` matched, so it starts with
    // the literal by construction.
    //
    // A newline anchor breaks it structurally rather than by care. The search key
    // holds a REAL newline; this file's own spelling of that key is a backslash
    // followed by an `n` — two characters, not one — so the source text cannot
    // contain the key, and no marker below can match the line that declares it.
    // A string literal is always preceded by its quote, never by a line break.
    const DECLARATION = "\nexport type V1ResponseDrift = [";
    const start = source.indexOf(DECLARATION);
    const end = source.indexOf("\n// Narrowing a ledger row", start);

    const block = source.slice(start, end);

    // Restored, and now able to fail: a renamed or deleted declaration makes this
    // -1 instead of quietly resolving to this gate's own source.
    expect(
      start,
      "the V1ResponseDrift declaration was not found at the start of a line — the " +
        "parse is broken, and its silence is not a finding about the ledger"
    ).toBeGreaterThan(-1);
    expect(end, "could not find the end of the V1ResponseDrift block").toBeGreaterThan(start);

    // A wrong END is the dangerous direction: `slice` happily runs past the
    // block, the narrowed assertions come into scope, and the pairing is then
    // computed over names this check was never meant to see. `DeepOmitAll`
    // appears ONLY after the block, so it is the marker that the slice overran.
    expect(
      block.includes("DeepOmitAll"),
      "the slice ran past the negative-assertion block and swept in the narrowed " +
        "assertions — every name it reports is then unreliable in both directions"
    ).toBe(false);
    const asserted = new Set(
      [...block.matchAll(/ResponseOf<"([A-Za-z0-9_]+)">/g)].map((match) => match[1])
    );
    // 🔴 NOTHING HERE ASSERTS ON THE FINDINGS. This was
    // `expect(asserted.size).toBeGreaterThan(0)`, and `ledger-gates-do-not-refuse-
    // their-cure` refused it as `control-dies-on-success` — correctly. A fully
    // repaired ledger has no rows, so it has no negative assertions, so the name
    // set is legitimately EMPTY; an arm asserting it is non-empty reds on exactly
    // the change that finishes the cleanup, which is the one shape a shrink-only
    // ledger must let through in silence.
    //
    // Its replacement was `block.startsWith(<the declaration>)`, which was ALSO
    // unfailable: the slice begins at whatever `indexOf` matched, so it starts
    // with that literal however wrong the match was. The newline-anchored `start`
    // control above is what replaced it — the corpus is still the subject, and
    // the anchor is what makes the subject trustworthy.

    expect(
      Object.keys(V1_RESPONSE_DRIFT).filter((name) => !asserted.has(name)),
      "ledgered routes with NO negative assertion in V1ResponseDrift. Such a row " +
        "is not self-pruning — repairing the route turns nothing red and the entry " +
        "outlives the drift it describes — and it sits outside the vacuity control " +
        "this file's green depends on. Add one Expect<Equals<Equals<…>, false>>."
    ).toEqual([]);

    expect(
      [...asserted].filter((name) => !(name in V1_RESPONSE_DRIFT)),
      "negative assertions for routes that are NOT ledgered — the row was " +
        "repaired or renamed and its assertion was left behind, where it reads as " +
        "coverage of a ledger entry that no longer exists"
    ).toEqual([]);
  });

  /**
   * THE SAME PAIRING, ONE LEVEL UP: the NARROWED table against the narrowed
   * ASSERTIONS.
   *
   * 🔴 THE HOLE THIS CLOSES WAS MEASURED, NOT ARGUED. `V1_RESPONSE_DRIFT_NARROWED`
   * is a runtime table and `V1ResponseDriftNarrowed` is a TYPE tuple this runner
   * cannot see, and nothing compared them. Deleting ONE route's `DeepOmitAll`
   * assertion from the tuple while leaving its row in the table left **`tsc` at
   * exit 0 and vitest at exit 0** — both green, with that DTO silently back to
   * route-wide and the table still reading as gated.
   *
   * The checks above cannot reach it and each fails in a way that looks like
   * coverage: `narrows only routes that are actually ledgered` compares the table
   * to `V1_RESPONSE_DRIFT`, and `NARROWABLE_LEDGER_ROUTES` compares a hand-written
   * list to the same table. Every one of them is satisfied by a table row whose
   * assertion does not exist.
   *
   * This is `gives every ledgered route a negative assertion` in a second place,
   * and the reason it is a second test rather than a second arm is that a failing
   * assertion aborts the rest of its own `it` — one verdict per block.
   */
  it("gives every narrowed route a DeepOmitAll assertion", () => {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    // Newline-anchored, for the reason the sibling gate states in full: this
    // file's own spelling of these markers is a backslash and an `n`, so no
    // marker can match the line that declares it, and `start` can therefore be
    // -1 when the declaration is renamed.
    const start = source.indexOf("\nexport type V1ResponseDriftNarrowed = [");
    const end = source.indexOf("\nconst V1_RESPONSE_DRIFT_NARROWED", start);
    const block = source.slice(start, end);

    expect(
      start,
      "the V1ResponseDriftNarrowed declaration was not found at the start of a " +
        "line — the parse is broken, and its silence is not a finding about the table"
    ).toBeGreaterThan(-1);
    expect(end, "could not find the end of the V1ResponseDriftNarrowed block").toBeGreaterThan(
      start
    );
    expect(
      block.includes("NARROWABLE_LEDGER_ROUTES"),
      "the slice ran past the narrowed-assertion block — every name it reports is " +
        "then unreliable in both directions"
    ).toBe(false);

    const asserted = new Set(
      [...block.matchAll(/ResponseOf<"([A-Za-z0-9_]+)">/g)].map((match) => match[1])
    );
    // Nothing here asserts on the findings: a drained narrowed table legitimately
    // parses to zero names, and an arm refusing that would refuse the cure. The
    // newline-anchored `start` control above is the parse check.

    expect(
      Object.keys(V1_RESPONSE_DRIFT_NARROWED).filter((name) => !asserted.has(name)),
      "routes with a row in V1_RESPONSE_DRIFT_NARROWED but NO DeepOmitAll assertion " +
        "in V1ResponseDriftNarrowed. The table reads as gated and the route is " +
        "route-wide: nothing compares that DTO at all, so every field the row does " +
        "not name is unchecked. Add the assertion, or delete the row and the entry " +
        "in NARROWABLE_LEDGER_ROUTES with it."
    ).toEqual([]);

    expect(
      [...asserted].filter((name) => !(name in V1_RESPONSE_DRIFT_NARROWED)),
      "narrowed assertions for routes with no row in V1_RESPONSE_DRIFT_NARROWED — " +
        "the runtime checks above are then blind to what that assertion erases"
    ).toEqual([]);
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
