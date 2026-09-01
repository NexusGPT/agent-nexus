import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import {
  compileManifest,
  matchRoute,
  type PayloadShape,
  TYPE_LETTER
} from "../src/response-contract";
import { V1_RESPONSE_CONTRACT } from "../src/response-contract.generated";
import {
  PROJECTED_TYPE_CODES,
  projectResponseContract,
  renderResponseContractModule
} from "./response-contract.project";

/** The file this gate is about. Read from disk, never imported — the point is the BYTES. */
const GENERATED = "../src/response-contract.generated.ts";

/**
 * The gate on `response-contract.generated.ts`.
 *
 * ## What it asserts
 *
 * 1. The shipped manifest is a byte-for-byte re-projection of the published v1
 *    schemas, so it cannot silently fall behind them.
 * 2. Every route in {@link MUST_CHECK_THE_PAYLOAD} still has a checkable shape.
 *
 * ## Why the second one is a NAMED LIST and never a count floor
 *
 * A floor — "at least N routes must be checkable" — has a hole exactly the
 * shape of the defect it is for. A route that LOSES its `Response` leaves the
 * population and takes its own case with it, so the denominator shrinks by one
 * alongside the numerator and the assertion stays green. Measured in this
 * repository on another gate: 11 cases became 10, all passing, nothing red.
 *
 * A name cannot leave. `MUST_CHECK_THE_PAYLOAD` is COMMITTED source, so a route
 * that stops publishing a schema is a name with nothing behind it, and this
 * file says which one.
 *
 * ⚠️ **The list is only a gate while it is edited DELIBERATELY.** Nothing stops
 * an author regenerating it to match a projection that just lost a route —
 * exactly the hazard `GATED_ROUTES` carries in
 * `types/v1-response-types-match-the-contract.test.ts`. Removing a name is a
 * decision to publish less than before, and belongs in a commit body that says
 * so.
 *
 * ## What this gate does NOT catch
 *
 * - **A schema that is wrong.** It compares the manifest to the SCHEMAS, so a
 *   `Response` that never described what the handler sends projects faithfully
 *   and passes here. `apps/backend/src/__governance__/v1-response-contracts-match-the-handler.spec.ts`
 *   is the instrument for that half.
 * - **The routes publishing no response schema.** They are in the manifest as
 *   `undeclared`, which makes them countable and keeps them out of a silent
 *   pass — it does not check them. Nothing can, until a schema is authored.
 *   How many there are is stated in the generated file's own header and
 *   asserted against the shipped entries below; a figure repeated here would
 *   be a second copy that rots, and this one did — it read 113 against a true
 *   104 with nothing to notice.
 * - **Anything below the first level of the payload.** The projection is
 *   deliberately shallow; see its header.
 * - **A field the projection could not type.** It carries the empty code and
 *   matches every value.
 */

/**
 * Every route whose payload the shipped manifest must be able to check.
 *
 * Seeded from the projection at the commit that introduced this file — one name
 * per descriptor declaring a `Response` that projects to an object or an array.
 */
const MUST_CHECK_THE_PAYLOAD: readonly string[] = [
  "AccessCardAvailableActions",
  "AccessCardCreate",
  "AccessCardDelete",
  "AccessCardGet",
  "AccessCardListByCredential",
  "AccessCardUpdate",
  "AgentCollectionAttach",
  "AgentCollectionDetach",
  "AgentCollectionList",
  "AgentCreate",
  "AgentDelete",
  "AgentDuplicate",
  "AgentGet",
  "AgentSkillCreate",
  "AgentSkillDelete",
  "AgentSkillDownloadUrl",
  "AgentSkillGet",
  "AgentSkillList",
  "AgentSkillUpdate",
  "AgentSkillUpload",
  "AgentUpdate",
  "AgentUploadProfilePicture",
  "AgentWorkspaceAttach",
  "AgentWorkspaceDetach",
  "AgentWorkspaceList",
  "AnalyticsFeedback",
  "AnalyticsOverview",
  "AnalyticsQuery",
  "AnalyticsQueryStructured",
  "AnalyticsReportCreate",
  "AnalyticsReportDelete",
  "AnalyticsReportGet",
  "AnalyticsReportList",
  "AnalyticsReportListRuns",
  "AnalyticsReportRunNow",
  "AnalyticsReportUpdate",
  "ApiKeyConnectionCreate",
  "AssetDelete",
  "AssetGet",
  "AssetUpload",
  "ChannelPhoneNumberBuy",
  "ChannelPhoneNumberGet",
  "ChannelPhoneNumberList",
  "ChannelPhoneNumberSearchAvailable",
  "ChannelSetupAutoProvision",
  "ChannelSetupGet",
  "CloudImportBrowse",
  "CloudImportItems",
  "CloudImportListProviders",
  "CloudImportSearch",
  "ConversationAddComment",
  "ConversationClose",
  "ConversationEvalBatchCreate",
  "ConversationEvalBatchGet",
  "ConversationEvalBatchList",
  "ConversationEvalRunCreate",
  "ConversationEvalRunGet",
  "ConversationEvalRunList",
  "ConversationEvalRunResults",
  "ConversationEvalScheduleCreate",
  "ConversationEvalScheduleList",
  "ConversationEvalSchedulePause",
  "ConversationEvalScheduleResume",
  "ConversationEvalScheduleUpdate",
  "ConversationEvalTemplateAttach",
  "ConversationEvalTemplateClone",
  "ConversationEvalTemplateCreate",
  "ConversationEvalTemplateGet",
  "ConversationEvalTemplateList",
  "ConversationEvalTemplateListImportable",
  "ConversationEvalTemplateUpdate",
  "ConversationEvalTriggerList",
  "ConversationEvalTriggerUpsert",
  "ConversationEvalWebhookGet",
  "ConversationEvalWebhookUpsert",
  "ConversationGet",
  "ConversationGetAssignedUsers",
  "ConversationGetMetadata",
  "ConversationList",
  "ConversationListComments",
  "ConversationListMessages",
  "ConversationMarkAsRead",
  "ConversationSearch",
  "ConversationSetAssignedUsers",
  "ConversationUpdateMetadata",
  "ConversationUpdateStatuses",
  "ConversationUpdateTopic",
  "CredentialDelete",
  "CredentialConnectStatus",
  "CredentialGet",
  "CredentialList",
  "CredentialUpdate",
  "CueTranscriptsGetTranscript",
  "CueTranscriptsListConversations",
  "CustomModelCreate",
  "CustomModelGet",
  "CustomModelList",
  "CustomModelUpdate",
  "CustomerAddNote",
  "ChatStopTurn",
  "ChatTurnStatus",
  "DeploymentAnonymousChatSessionCreate",
  "DeploymentChatSessionCreate",
  "DeploymentChatSessionRefresh",
  "DeploymentCreate",
  "DeploymentFolderAssign",
  "DeploymentFolderCreate",
  "DeploymentFolderDelete",
  "DeploymentFolderList",
  "DeploymentFolderUpdate",
  "DeploymentGet",
  "DeploymentGetEmbedConfig",
  "DeploymentList",
  "DeploymentStatistics",
  "DeploymentUpdate",
  "DeploymentUpdateEmbedConfig",
  "DeploymentVoiceSessionCreate",
  "DocsSearch",
  "DocumentAddWebsite",
  "DocumentCreateFolder",
  "DocumentCreateGoogleSheet",
  "DocumentCreateText",
  "DocumentDownload",
  "DocumentGet",
  "DocumentPreview",
  "DocumentReprocess",
  "DocumentTemplateFolderAssign",
  "DocumentTemplateFolderCreate",
  "DocumentTemplateFolderDelete",
  "DocumentTemplateFolderList",
  "DocumentTemplateFolderUpdate",
  "DocumentUpdate",
  "DocumentUploadFile",
  "EvaluationDatasetAddRow",
  "EvaluationDatasetUpload",
  "EvaluationExecute",
  "EvaluationJudge",
  "FolderAssignAgent",
  "FolderCreate",
  "FolderDelete",
  "FolderList",
  "FolderUpdate",
  "HtmlMessageTemplateCreate",
  "HtmlMessageTemplateDelete",
  "HtmlMessageTemplateFill",
  "HtmlMessageTemplateGet",
  "HtmlMessageTemplateList",
  "HtmlMessageTemplateRender",
  "HtmlMessageTemplateUpdate",
  "KnownIssuesForRoute",
  "McpRpc",
  "MeListOrganizations",
  "ModelList",
  "PermissionsCheck",
  "PermissionsGetOrgSettings",
  "PermissionsGrant",
  "PermissionsListAccessible",
  "PermissionsListResourceAccess",
  "PermissionsRevoke",
  "PermissionsRevokeImpact",
  "PermissionsUpdateOrgSettings",
  "PermissionsUpdateRelation",
  "PermissionsUpdateResourceTypeVisibility",
  "PhoneNumberBuy",
  "PhoneNumberGet",
  "PhoneNumberList",
  "PhoneNumberSearchAvailable",
  "PromptAssistantChat",
  "PromptAssistantGetThread",
  "PromptAssistantListThreads",
  "PromptAssistantWaitForThread",
  "RoleAccessRequestsCreate",
  "RoleAccessRequestsReview",
  "RoleAutomationSettingsUpsert",
  "RoleCreationRequestsGet",
  "RoleCreationRequestsList",
  "RoleCreationRequestsReview",
  "RoleDeletionRequestsGet",
  "RoleDeletionRequestsList",
  "RoleDeletionRequestsReview",
  "RoleJobTypesCreate",
  "RoleJobTypesDelete",
  "RoleJobTypesList",
  "RoleJobTypesUpdate",
  "RoleManagementSettingsGet",
  "RolesAddPermissionSetMember",
  "RolesAddResponsibility",
  "RolesAttachResource",
  "RolesCreateBoard",
  "RolesCreateCollectionGrant",
  "RolesCreatePermissionSet",
  "RolesCreateWorkspaceGrant",
  "RolesDeleteBoard",
  "RolesDeleteCollectionGrant",
  "RolesDeletePermissionSet",
  "RolesDeleteWorkspaceGrant",
  "RolesDetachResource",
  "RolesGet",
  "RolesGetCoverage",
  "RolesList",
  "RolesListAccessRequests",
  "RolesListBoards",
  "RolesListCollectionGrants",
  "RolesListMembers",
  "RolesListPermissionSets",
  "RolesListResources",
  "RolesListResponsibilities",
  "RolesListScopeLines",
  "RolesListTaskDuties",
  "RolesListTasks",
  "RolesListVariables",
  "RolesListWorkspaceGrants",
  "RolesMoveBoardCard",
  "RolesPause",
  "RolesRemoveMember",
  "RolesRemovePermissionSetMember",
  "RolesRemoveResponsibility",
  "RolesReorderBoards",
  "RolesReplaceScopeLines",
  "RolesReplaceTaskDuties",
  "RolesReplaceTasks",
  "RolesReplaceVariables",
  "RolesResume",
  "RolesUpdate",
  "RolesUpdateBoard",
  "RolesUpdatePermissionSet",
  "RolesUpsertMember",
  "RolesUpsertSystemPolicy",
  "RolesUpsertWorkingYear",
  "ScoreList",
  "ScoreRecord",
  "SkillFolderAssign",
  "SkillFolderCreate",
  "SkillFolderDelete",
  "SkillFolderList",
  "SkillFolderUpdate",
  "SkillsAttachCollectionDocuments",
  "SkillsCreateCollection",
  "SkillsCreateDocumentTemplate",
  "SkillsCreateExternalTool",
  "SkillsCreateTask",
  "SkillsDeleteDocumentTemplate",
  "SkillsDeleteExternalTool",
  "SkillsDeleteTask",
  "SkillsDuplicateTask",
  "SkillsExecuteTask",
  "SkillsGenerateDocumentTemplate",
  "SkillsGetCollection",
  "SkillsGetCollectionStatistics",
  "SkillsGetDocumentTemplate",
  "SkillsGetExternalTool",
  "SkillsGetTask",
  "SkillsGetWorkflow",
  "SkillsListCollections",
  "SkillsListDocumentTemplates",
  "SkillsListExternalTools",
  "SkillsListTasks",
  "SkillsListWorkflows",
  "SkillsQueryCollection",
  "SkillsSearchCollection",
  "SkillsSearchMultipleCollections",
  "SkillsTestExternalTool",
  "SkillsUpdateCollection",
  "SkillsUpdateExternalTool",
  "SkillsUpdateTask",
  "SkillsUploadDocumentTemplateFile",
  "SkillsUploadExternalToolIcon",
  "TicketAddComment",
  "TicketCreate",
  "TicketGet",
  "TicketListAttachments",
  "TicketListComments",
  "TicketUpdate",
  "TicketUploadAttachment",
  "ToolAttachCollection",
  "ToolConnectionGetHandshakeStatus",
  "ToolCreate",
  "ToolDelete",
  "ToolDiscoveryCredentials",
  "ToolDiscoveryGet",
  "ToolDiscoveryResolveOptions",
  "ToolDiscoverySearch",
  "ToolDiscoverySkills",
  "ToolDiscoveryTest",
  "ToolGet",
  "ToolList",
  "ToolUpdate",
  "TracingAnalyticsCostBreakdown",
  "TracingAnalyticsSummary",
  "TracingAnalyticsTimeline",
  "TracingExportBulk",
  "TracingExportTrace",
  "TracingGetGeneration",
  "TracingGetTrace",
  "TracingListGenerations",
  "TracingListModels",
  "TracingListTraces",
  "UserGroupsAddMember",
  "UserGroupsCreate",
  "UserGroupsDelete",
  "UserGroupsList",
  "UserGroupsRemoveMember",
  "UserGroupsUpdate",
  "VersionCreateCheckpoint",
  "VersionDelete",
  "VersionGet",
  "VersionPublish",
  "VersionRestore",
  "VersionUpdate",
  "VibeRegisterAppAsTool",
  "WorkflowBuilderGetNodeTypeSchema",
  "WorkflowBuilderListNodeTypes",
  "WorkflowBuilderListPlatformListenerEvents",
  "WorkflowCreate",
  "WorkflowDuplicate",
  "WorkflowExecutionCancel",
  "WorkflowExecutionDiagnose",
  "WorkflowExecutionExport",
  "WorkflowExecutionGet",
  "WorkflowExecutionGetNodeResult",
  "WorkflowExecutionGetOutput",
  "WorkflowExecutionPoll",
  "WorkflowExecutionPollByToken",
  "WorkflowExecutionRetryNode",
  "WorkflowGet",
  "WorkflowList",
  "WorkflowNodeCreate",
  "WorkflowNodeDelete",
  "WorkflowNodeGet",
  "WorkflowNodeUpdate",
  "WorkflowUpdate",
  "WorkspaceCreate",
  "WorkspaceGetFile",
  "WorkspaceList",
  "WorkspaceListFolder",
  "WorkspaceRename",
  "WorkspaceRestore",
  "WorkspaceSearch",
  // tracks — one work item's seven scope resources
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
  // ── wired by #4521: these declared a Response for the first time ──
  "ConversationEvalRunTranscript",
  "EvaluationCreate",
  "EvaluationList",
  "EvaluationGet",
  "EvaluationDatasetRows",
  "EvaluationResults",
  "EvaluationFormats",
  "EvaluationJudges",
  "WorkflowEdgeCreate",
  "WorkflowTestingStopExecution"
];

const projection = projectResponseContract();
const shipped = Object.values(V1_RESPONSE_CONTRACT);
const checkable = new Set(
  shipped
    .filter((route) => route.payload.kind === "object" || route.payload.kind === "array")
    .map((route) => route.name)
);

/**
 * The four counts the generated header states, read back out of the SHIPPED
 * bytes.
 *
 * 🚨 **Returns `undefined` rather than a zero when the header does not match.**
 * A count parsed by a broken pattern is indistinguishable from a real count of
 * zero, and zero would compare equal to nothing and red for the wrong reason —
 * or, over a partition, quietly agree with itself. The caller asserts this is
 * defined before it asserts anything with it.
 */
function headerCounts(
  source: string
): { total: number; checkable: number; undeclared: number; opaque: number } | undefined {
  const match =
    /^\/\/ (\d+) routes: (\d+) with a checkable shape, (\d+) publishing no\n\/\/ response schema, (\d+) whose payload has no key set to check\.$/m.exec(
      source
    );
  if (!match) return undefined;

  return {
    total: Number(match[1]),
    checkable: Number(match[2]),
    undeclared: Number(match[3]),
    opaque: Number(match[4])
  };
}

/** The same four, counted off the shipped ENTRIES — the copy a consumer reads. */
const shippedCounts = {
  total: shipped.length,
  checkable: shipped.filter((r) => r.payload.kind === "object" || r.payload.kind === "array")
    .length,
  undeclared: shipped.filter((r) => r.payload.kind === "undeclared").length,
  opaque: shipped.filter((r) => r.payload.kind === "opaque").length
};

describe("the header's counts are a measurement, not a sentence", () => {
  /**
   * ## Why the byte-for-byte check above does not already cover this
   *
   * `renderResponseContractModule` writes those four numbers from a tally the
   * projector keeps while it walks, and the byte-for-byte assertion compares
   * the file to that same render. So a tally counting the WRONG population is
   * written into the header AND matched by the check — both sides wrong in the
   * same direction, agreeing perfectly, nothing red. `projectResponseContract`
   * calls them "the numbers a gate asserts about it"; until this block, no gate
   * did.
   *
   * These read the shipped ENTRIES instead, by their `payload.kind` field. That
   * is top-level by construction: `kind` is reached as a property of the route's
   * own payload, so an `array` whose `items` are an `object` cannot be counted
   * twice. A regex over the file's text CAN count both — the naive sweep returns
   * 525 against a true 491, and the 34 extra are exactly the 34 `array` routes.
   */
  const onDisk = readFileSync(join(dirname(fileURLToPath(import.meta.url)), GENERATED), "utf8");

  it("states counts this test could actually read", () => {
    expect(
      headerCounts(onDisk),
      "the generated header no longer matches the shape this gate parses. If the " +
        "wording changed deliberately, update headerCounts — do not delete the assertion."
    ).toBeDefined();
  });

  it("states the number of routes the manifest actually ships", () => {
    expect(headerCounts(onDisk)).toEqual(shippedCounts);
  });

  it("agrees with the tally the projector kept while walking", () => {
    expect({
      checkable: projection.declared,
      undeclared: projection.undeclared,
      opaque: projection.opaque
    }).toEqual({
      checkable: shippedCounts.checkable,
      undeclared: shippedCounts.undeclared,
      opaque: shippedCounts.opaque
    });
  });

  it("partitions every route into exactly one of the three", () => {
    // Without this, a payload kind nobody counted would leave all three totals
    // individually correct and the sum short.
    expect(shippedCounts.checkable + shippedCounts.undeclared + shippedCounts.opaque).toBe(
      shippedCounts.total
    );
  });
});

describe("the shipped response contract", () => {
  it("read a real population, so nothing below is vacuous", () => {
    // Every assertion here is trivially true over an empty manifest, and an
    // empty manifest is what a broken import or a failed codegen produces.
    expect(shipped.length).toBeGreaterThan(400);
    expect(checkable.size).toBeGreaterThan(300);
  });

  it("is a byte-for-byte re-projection of the published v1 schemas", () => {
    const onDisk = readFileSync(join(dirname(fileURLToPath(import.meta.url)), GENERATED), "utf8");
    expect(
      onDisk,
      "src/response-contract.generated.ts is stale — " +
        "run: pnpm --filter @agent-nexus/sdk run gen:response-contract"
    ).toBe(renderResponseContractModule());
  });

  it("projects every descriptor the contract declares", () => {
    // The projector refuses a duplicate route key by throwing, so reaching here
    // is itself the uniqueness assertion. This one pins the join: a descriptor
    // dropped by the walk would shrink the manifest silently.
    expect(Object.keys(V1_RESPONSE_CONTRACT).length).toBe(Object.keys(projection.manifest).length);
    expect(projection.unprojectable).toEqual({});
  });

  it("names no obligation twice", () => {
    expect(new Set(MUST_CHECK_THE_PAYLOAD).size).toBe(MUST_CHECK_THE_PAYLOAD.length);
  });

  it("still checks the payload of every route the obligation set names", () => {
    const lost = MUST_CHECK_THE_PAYLOAD.filter((name) => !checkable.has(name));
    expect(
      lost,
      `these routes no longer publish a checkable response shape. Either restore the ` +
        `schema, or remove the name from MUST_CHECK_THE_PAYLOAD in a commit that says ` +
        `the CLI's output for them is no longer described by anything.`
    ).toEqual([]);
  });

  it("names every route that gained one, so the set cannot fall behind", () => {
    // The other direction. Without it a route added WITH a schema would sit
    // outside the obligation set forever, and losing that schema later would
    // cost nothing.
    const named = new Set(MUST_CHECK_THE_PAYLOAD);
    const unnamed = [...checkable].filter((name) => !named.has(name)).sort();
    expect(
      unnamed,
      "these routes publish a checkable response shape and are not in " +
        "MUST_CHECK_THE_PAYLOAD. Add them."
    ).toEqual([]);
  });
});

/**
 * The alphabet the manifest is WRITTEN in must be the one the checker READS it
 * with.
 *
 * `response-contract.ts` cannot import `@nexus/types`, so it hand-copies the
 * letter map. Nothing compared the two copies, and a divergence would be the
 * worst failure this module can have: every field scored against the wrong
 * letter, silently, with each side internally consistent and the codegen check
 * still green because the manifest matches its own generator perfectly.
 *
 * Three assertions, because the first alone is not enough: two maps can agree
 * and still be a broken alphabet (a letter used twice), and both can be right
 * while the shipped DATA is spelled in something else.
 */
describe("the checker decodes the manifest with the alphabet that wrote it", () => {
  it("holds the same letter for every JSON type as the projector", () => {
    expect(TYPE_LETTER).toEqual(PROJECTED_TYPE_CODES);
  });

  it("and that comparison discriminates", () => {
    // Without this, `toEqual` between two objects that were both somehow empty
    // would pass, and so would a comparison this test got structurally wrong.
    expect({ ...TYPE_LETTER, string: "S" }).not.toEqual(PROJECTED_TYPE_CODES);
    expect(Object.keys(TYPE_LETTER).length).toBeGreaterThan(4);
  });

  it("gives every JSON type a DISTINCT letter", () => {
    // A collision merges two types into one code, so a string would satisfy a
    // field published as a number. Agreement between the two maps cannot see it.
    const letters = Object.values(TYPE_LETTER);
    expect(new Set(letters).size).toBe(letters.length);
  });

  it("spells every field code in the shipped manifest with those letters", () => {
    // The end-to-end tie: the two MAPS agreeing says nothing about the DATA.
    const alphabet = new Set<string>(Object.values(TYPE_LETTER));
    const offenders: string[] = [];

    const walk = (route: (typeof shipped)[number], payload: PayloadShape): void => {
      if (payload.kind === "array") return walk(route, payload.items);
      if (payload.kind !== "object") return;
      for (const [field, code] of Object.entries(payload.fields)) {
        for (const letter of code) {
          if (!alphabet.has(letter)) offenders.push(`${route.name}.${field}: ${code}`);
        }
      }
    };
    for (const route of shipped) walk(route, route.payload);

    expect(offenders).toEqual([]);
  });
});

describe("matching a concrete path to its route", () => {
  const compiled = compileManifest(V1_RESPONSE_CONTRACT);

  const CASES: readonly { path: string; method: string; expected: string | null }[] = [
    { method: "GET", path: "/agents/8f14e45f-ceea-467a-9a6a-1f2b3c4d5e6f", expected: "AgentGet" },
    { method: "GET", path: "/me", expected: "MeGet" },
    { method: "GET", path: "/not-a-real-route", expected: null }
  ];

  it.each(eachOrRefuse(CASES, "the concrete paths this matcher is pinned on"))(
    "$method $path",
    ({ method, path, expected }) => {
      expect(matchRoute(compiled, method, path)?.name ?? null).toBe(expected);
    }
  );
});
