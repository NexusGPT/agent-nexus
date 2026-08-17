/**
 * THE ROLLOUT LEDGER for contract-generated help — DATA ONLY.
 *
 * One entry per namespace that has been converted, naming the v1 descriptors it
 * calls. `contract-help.namespaces.ts` pairs each entry with the registrar that
 * hangs it off a program; the generator reads this file alone.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS FILE IMPORTS NOTHING, AND THAT IS THE WHOLE REASON IT EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The ledger and the registrars used to be one module. A registrar is a VALUE,
 * so naming 39 of them made that module import all 39 command files, and every
 * one of those imports its own `<namespace>.contract.generated.ts` — the very
 * artifacts the generator writes. Reading the ledger therefore required the
 * generator's own output to already exist.
 *
 * That is invisible in ordinary use, because the output is committed and always
 * on disk. It is fatal to the one check that exists to prove the output is
 * current: `scripts/generated-drift.mjs` DELETES a target's committed files
 * before re-running its generator, precisely so a generator that silently does
 * nothing leaves deletions rather than comparing files against themselves. With
 * the ledger carrying registrars, that deletion made the generator fail to LOAD:
 *
 *   Error: Cannot find module './analytics.contract.generated'
 *   Require stack:
 *     - src/commands/analytics.ts
 *     - src/commands/contract-help.namespaces.ts
 *
 * The generator was already two-phase for this reason — it writes first and
 * imports `contract-binding` afterwards — but the ledger import sat BEFORE the
 * write, because the write needs the list. Splitting the data out is what
 * actually lets phase 1 run against a wiped tree, which is the state the drift
 * check always puts it in.
 *
 * ⚠️ SO: NEVER ADD AN IMPORT TO THIS FILE. Not a type, not a constant, not a
 * registrar. `contract-help.ledger.test.ts` fails on any import statement here,
 * because an `import type` is erased today and one refactor away from not being.
 * Anything that needs a value belongs in `contract-help.namespaces.ts`.
 *
 * ── CONVERTING A NAMESPACE TAKES TWO PASSES, AND THE ORDER IS FORCED ─────────
 *
 *   1. Add the entry here AND its registrar in `contract-help.namespaces.ts`,
 *      with no bindings in the command file yet, then run
 *      `pnpm --filter @agent-nexus/cli run gen:contract-help`. That WRITES
 *      `<namespace>.contract.generated.ts`.
 *   2. Then bind the flags in the command file against the constants that file
 *      now exports, and run the generator again plus the suite.
 *
 * Binding first cannot work: the command file would import a generated module
 * that does not exist. Between the two passes the gate is legitimately red on
 * "binds at least one command per namespace" — that is the half-finished state,
 * not a failure.
 *
 * REMOVING an entry is never how a build is fixed. A namespace whose flags stop
 * matching the contract is the exact event this ledger exists to catch.
 *
 * ── Why an explicit list and not a sweep over every namespace ───────────────
 *
 * Because a sweep would be red from the first commit to the last and would be
 * deleted long before it went green — the reasoning `help-completeness.test.ts`
 * records for its own list.
 *
 * 🚨 THE DENOMINATOR IS NOT WRITTEN DOWN HERE, AND THE REASON IS THAT IT WAS.
 * This header said 46, derived as "64 top-level names MINUS the 18 hidden
 * `upgrade` aliases". Both halves aged: `known-issues` landed, the tree went to
 * 65 top-level names and 47 visible namespaces, and the sentence carried on
 * reading like a measurement. Worse, the missing namespace was in NO list at
 * all — so the ratio was wrong in the numerator too, and nothing said so.
 *
 * `test/unit/contract-blocked-audit.ts` now derives the whole partition and
 * fails on a namespace that is in neither this ledger, nor
 * `UNCONTRACTED_NAMESPACES`, nor a `BLOCKED_DESCRIPTORS` leaf. Read the ratio
 * off it, never off a comment:
 *
 *   pnpm --filter @agent-nexus/cli exec tsx test/unit/contract-blocked-audit.ts
 *
 * The count of hidden aliases is likewise not stated anywhere that matters: the
 * census filters with `isHiddenCommand`, so a nineteenth alias changes the
 * output rather than falsifying a sentence.
 */

/** One converted namespace and the `ZPublicApiV1` keys its leaves call. */
export interface LedgerEntry {
  /** The top-level command name, e.g. `analytics`. */
  readonly namespace: string;
  /** Keys into `ZPublicApiV1`. Sorted by the generator, never by hand. */
  readonly descriptors: readonly string[];
}

export const GENERATED_NAMESPACE_LEDGER = [
  {
    namespace: "analytics",
    descriptors: [
      "AnalyticsOverview",
      "AnalyticsFeedback",
      "AnalyticsExport",
      "AnalyticsQuery",
      "AnalyticsQueryStructured"
    ]
  },
  {
    namespace: "custom-model",
    descriptors: [
      "CustomModelList",
      "CustomModelCreate",
      "CustomModelGet",
      "CustomModelUpdate",
      "CustomModelDelete"
    ]
  },
  {
    namespace: "deployment",
    descriptors: [
      "DeploymentList",
      "DeploymentCreate",
      "DeploymentUpdate",
      "DeploymentUpdateEmbedConfig",
      "DeploymentWhatsappTemplateAttach"
    ]
  },
  {
    namespace: "agent-eval",
    descriptors: [
      "ConversationEvalRunCreate",
      "ConversationEvalRunList",
      "ConversationEvalBatchList",
      "ConversationEvalTemplateList",
      "ConversationEvalTemplateListImportable",
      "ConversationEvalScheduleList",
      "ConversationEvalTriggerList"
    ]
  },
  {
    namespace: "credential",
    descriptors: ["CredentialList"]
  },
  {
    namespace: "prompt-assistant",
    descriptors: ["PromptAssistantChat"]
  },
  {
    namespace: "task",
    descriptors: [
      "SkillsCreateTask",
      "SkillsUpdateTask",
      "SkillsDuplicateTask",
      "SkillsExecuteTask"
    ]
  },
  {
    namespace: "workflow",
    descriptors: [
      "WorkflowList",
      "WorkflowNodeReplaceTrigger",
      "WorkflowBatchExecute",
      "WorkflowEdgeCreate"
    ]
  },
  {
    namespace: "access-card",
    descriptors: ["AccessCardCreate", "AccessCardUpdate"]
  },
  {
    namespace: "agent",
    descriptors: ["AgentCreate", "AgentList", "AgentUpdate"]
  },
  {
    namespace: "channel",
    descriptors: [
      "ChannelConnectionCreate",
      "ChannelSetupAutoProvision",
      "ChannelWhatsappTemplateApprovalSubmit",
      "ChannelWhatsappTemplateCreate"
    ]
  },
  {
    namespace: "conversation",
    descriptors: ["ConversationGet", "ConversationList", "ConversationUpdateStatuses"]
  },
  {
    namespace: "document",
    descriptors: ["DocumentAddWebsite", "DocumentList"]
  },
  {
    namespace: "permissions",
    descriptors: [
      "PermissionsGrant",
      "PermissionsListResourceAccess",
      "PermissionsRevoke",
      "PermissionsUpdateResourceTypeVisibility"
    ]
  },
  {
    namespace: "phone-number",
    descriptors: ["PhoneNumberSearchAvailable"]
  },
  {
    namespace: "ticket",
    descriptors: ["TicketCreate", "TicketList", "TicketUpdate"]
  },
  {
    namespace: "tool",
    descriptors: ["ToolDiscoverySearch", "ToolDiscoverySkills"]
  },
  {
    namespace: "tracing",
    descriptors: [
      "TracingAnalyticsCostBreakdown",
      "TracingAnalyticsTimeline",
      "TracingExportBulk",
      "TracingExportTrace",
      "TracingListGenerations",
      "TracingListTraces"
    ]
  },
  {
    namespace: "version",
    descriptors: ["VersionList"]
  },
  {
    namespace: "role",
    descriptors: [
      "RoleAccessRequestsCreate",
      "RoleAccessRequestsReview",
      "RoleCreationRequestsList",
      "RoleCreationRequestsReview",
      "RoleDeletionRequestsList",
      "RoleDeletionRequestsReview",
      "RoleJobTypesCreate",
      "RoleJobTypesUpdate",
      "RolesAttachResource",
      "RolesDetachResource",
      "RolesCreateBoard",
      "RolesCreatePermissionSet",
      "RolesDeleteBoard",
      "RolesListAccessRequests",
      "RolesListBoards",
      "RolesMoveBoardCard",
      "RolesReorderBoards",
      "RolesUpdateBoard",
      "RolesUpdatePermissionSet",
      "RolesUpsertMember"
    ]
  },
  {
    namespace: "agent-tool",
    descriptors: [
      "ToolAttachCollection",
      "ToolCreate",
      "ToolDelete",
      "ToolGet",
      "ToolList",
      "ToolUpdate"
    ]
  },
  {
    namespace: "collection",
    descriptors: [
      "SkillsAttachCollectionDocuments",
      "SkillsCreateCollection",
      "SkillsDeleteCollection",
      "SkillsGetCollection",
      "SkillsGetCollectionStatistics",
      "SkillsListCollectionDocuments",
      "SkillsListCollections",
      "SkillsQueryCollection",
      "SkillsRemoveCollectionDocument",
      "SkillsSearchCollection",
      "SkillsSearchMultipleCollections",
      "SkillsUpdateCollection"
    ]
  },
  {
    namespace: "folder",
    descriptors: ["FolderAssignAgent", "FolderCreate", "FolderDelete", "FolderList", "FolderUpdate"]
  },
  {
    namespace: "skill-folder",
    descriptors: [
      "SkillFolderAssign",
      "SkillFolderCreate",
      "SkillFolderDelete",
      "SkillFolderList",
      "SkillFolderUpdate"
    ]
  },
  {
    namespace: "template",
    descriptors: ["SkillsCreateDocumentTemplate", "SkillsListDocumentTemplates"]
  },
  {
    namespace: "user-group",
    descriptors: [
      "UserGroupsAddMember",
      "UserGroupsCreate",
      "UserGroupsDelete",
      "UserGroupsList",
      "UserGroupsRemoveMember",
      "UserGroupsUpdate"
    ]
  },
  {
    namespace: "workspace",
    descriptors: [
      "WorkspaceCreate",
      "WorkspaceDelete",
      "WorkspaceList",
      "WorkspaceRename",
      "WorkspaceRestore",
      "WorkspaceSearch"
    ]
  },
  {
    namespace: "agent-skill",
    descriptors: ["AgentSkillCreate"]
  },
  {
    namespace: "external-tool",
    descriptors: [
      "SkillsCreateExternalTool",
      "SkillsDeleteExternalTool",
      "SkillsGetExternalTool",
      "SkillsListExternalTools",
      "SkillsTestExternalTool",
      "SkillsUpdateExternalTool",
      "SkillsUploadExternalToolIcon"
    ]
  },
  {
    namespace: "agent-collection",
    descriptors: ["AgentCollectionList"]
  },
  {
    namespace: "asset",
    descriptors: ["AssetDelete", "AssetGet", "AssetList", "AssetUpload"]
  },
  {
    namespace: "cloud-import",
    descriptors: [
      "CloudImportBrowse",
      "CloudImportItems",
      "CloudImportListProviders",
      "CloudImportSearch"
    ]
  },
  {
    namespace: "cue",
    descriptors: [
      "CueTranscriptsListConversations",
      "CueTranscriptsGetTranscript",
      "CueTranscriptsExport"
    ]
  },
  {
    namespace: "docs",
    descriptors: ["DocsSearch"]
  },
  {
    namespace: "emulator",
    descriptors: [
      "EmulatorCreateSession",
      "EmulatorDeleteScenario",
      "EmulatorDeleteSession",
      "EmulatorGetScenario",
      "EmulatorListScenarios",
      "EmulatorListSessions",
      "EmulatorSaveScenario"
    ]
  },
  {
    namespace: "html-template",
    descriptors: ["HtmlMessageTemplateCreate", "HtmlMessageTemplateGet", "HtmlMessageTemplateList"]
  },
  {
    namespace: "task-eval",
    descriptors: ["EvaluationCreate", "EvaluationFormats", "EvaluationJudges", "EvaluationList"]
  },
  {
    // `customer list` is NOT here: its three enums are query parameters with no
    // flag and the leaf carries no `--body`, so it stays in BLOCKED_DESCRIPTORS.
    // Every other leaf in this namespace declares no enum at all and gains route,
    // required fields and `--print-contract` from the binding.
    namespace: "customer",
    descriptors: [
      "CustomerAddNote",
      "CustomerCreate",
      "CustomerDelete",
      "CustomerGet",
      "CustomerGetByExternalId",
      "CustomerList",
      "CustomerUpdate"
    ]
  },
  {
    // `WorkflowExecutionPollByToken` is not here, and that is the
    // one-leaf-two-descriptors decision taken at the call site: `execution poll`
    // switches route on `--token`, `bindCommand` takes one shape, and the two
    // descriptors differ only in which id they take. The default branch binds.
    //
    // `execution list` IS here now. `--sort-by` and `--order` were added rather
    // than deferred: unbound, the leaf's `--status` hand-typed its five values
    // in a description and refused nothing, and one absent flag was holding
    // back three ready enums.
    //
    // `WorkflowExecutionListForWorkflow` is the same leaf's OTHER route —
    // `--workflow-id` switches it — so it takes the `channel setup` treatment
    // rather than a second ledger entry: one leaf, one shape, the twin recorded
    // in BLOCKED_DESCRIPTORS. Both routes carry the same three enums, so the
    // bound branch offers exactly what the twin would.
    namespace: "execution",
    descriptors: [
      "WorkflowExecutionCancel",
      "WorkflowExecutionDiagnose",
      "WorkflowExecutionExport",
      "WorkflowExecutionGet",
      "WorkflowExecutionGetNodeResult",
      "WorkflowExecutionGetOutput",
      "WorkflowExecutionList",
      "WorkflowExecutionPoll",
      "WorkflowExecutionRetryNode"
    ]
  },
  {
    // ONE LEAF OF THIS NAMESPACE IS ON THE v1 CONTRACT AND THE REST ARE NOT, and
    // the split is a property of the SERVER, not of this rollout. `vibe app
    // register-as-tool` posts to `/api/public/v1/vibe/apps/:appId/register-as-tool`;
    // every other verb here posts to the `/api/vibe/...` tenant surface, which
    // `ZPublicApiV1` does not declare and this generator therefore cannot see.
    // Binding the one leaf is the whole of what is derivable.
    namespace: "vibe",
    descriptors: ["VibeRegisterAppAsTool"]
  },
  {
    // A ONE-LEAF NAMESPACE, AND IT WAS IN NO LIST AT ALL until the namespace
    // partition became a gate — not this ledger, not UNCONTRACTED_NAMESPACES,
    // and not BLOCKED_DESCRIPTORS. `KnownIssuesForRoute` declares no enum, so
    // the blocked audit's population never reached it either: that audit
    // polices enums and is total over DESCRIPTORS, never over namespaces.
    namespace: "known-issues",
    descriptors: ["KnownIssuesForRoute"]
  }
] as const satisfies readonly LedgerEntry[];

/**
 * The namespace names, as a literal union.
 *
 * `contract-help.namespaces.ts` keys its registrar map by this, so a namespace
 * added here without a registrar — or a registrar named for a namespace that is
 * not here — is a compile error rather than a runtime hole. That is what keeps
 * the split from becoming two lists that drift.
 */
export type GeneratedNamespaceName = (typeof GENERATED_NAMESPACE_LEDGER)[number]["namespace"];
