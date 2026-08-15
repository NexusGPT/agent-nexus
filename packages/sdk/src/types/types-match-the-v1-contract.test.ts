import {
  AgentFolderSchema,
  AgentModelSchema,
  ApiKeyConnectionSchema,
  ApiKeyServiceSchema,
  AssetDeleteResultSchema,
  AssetSchema,
  AssignAgentToFolderBodySchema,
  AssignAgentToFolderResponseSchema,
  AssignDeploymentToFolderBodySchema,
  AssignDeploymentToFolderResponseSchema,
  AssignSkillToFolderBodySchema,
  AssignSkillToFolderResponseSchema,
  AssignTemplateToFolderBodySchema,
  AssignTemplateToFolderResponseSchema,
  AvailablePhoneNumberItemSchema,
  BuyPhoneNumberBodySchema,
  CreateDeploymentFolderBodySchema,
  CreateDocumentTemplateFolderBodySchema,
  CreateFolderBodySchema,
  CreateSkillFolderBodySchema,
  CreateUserGroupV1BodySchema,
  DeleteDeploymentFolderResponseSchema,
  DeleteUserGroupV1ResponseSchema,
  DeploymentDetailSchema,
  DeploymentFolderSchema,
  DeploymentTypeSchema,
  DocumentDetailSchema,
  DocumentTemplateFolderSchema,
  EvalSessionDetailSchema,
  ExternalToolDetailSchema,
  GenerationDetailSchema,
  GenerationSummarySchema,
  GetOrgPermissionSettingsV1ResponseSchema,
  GrantPermissionV1BodySchema,
  GrantPermissionV1ResponseSchema,
  ListDeploymentFoldersResponseSchema,
  ListDocumentTemplateFoldersResponseSchema,
  ListExternalToolsResponseSchema,
  ListFoldersResponseSchema,
  ListModelsResponseSchema,
  ListResourceAccessV1ResponseSchema,
  ListSkillFoldersResponseSchema,
  ListUserGroupsV1ResponseSchema,
  ModelProviderSchema,
  ModelSummarySchema,
  PhoneNumberSummarySchema,
  PublicPermissionGrantSchema,
  PublicUserGroupSchema,
  RevokePermissionV1BodySchema,
  RevokePermissionV1ResponseSchema,
  RoleAccessRequestsV1ResponseSchema,
  RoleAccessRequestV1ResponseSchema,
  RoleAutomationSettingsV1BodySchema,
  RoleCollectionGrantsV1ResponseSchema,
  RoleCoverageV1ResponseSchema,
  RoleCreationRequestsV1ResponseSchema,
  RoleCreationRequestV1ResponseSchema,
  RoleDeletionRequestsV1ResponseSchema,
  RoleDeletionRequestV1ResponseSchema,
  RoleJobTypesV1ResponseSchema,
  RoleJobTypeV1BodySchema,
  RoleJobTypeV1DeleteResponseSchema,
  RoleJobTypeV1WriteResponseSchema,
  RoleManagementRequestReviewV1BodySchema,
  RoleManagementSettingsV1ResponseSchema,
  RoleMembershipV1ResponseSchema,
  RolePermissionSetsV1ResponseSchema,
  RolePermissionSetV1ResponseSchema,
  RoleResourcesV1ResponseSchema,
  RoleScopeLinesV1BodySchema,
  RoleScopeLinesV1ResponseSchema,
  RolesListV1ResponseSchema,
  RoleSystemPolicyV1BodySchema,
  RoleV1ResponseSchema,
  RoleVariablesV1BodySchema,
  RoleVariablesV1ResponseSchema,
  RoleWorkingYearV1BodySchema,
  RoleWorkspaceGrantsV1ResponseSchema,
  SkillFolderSchema,
  TraceDetailSchema,
  TraceSummarySchema,
  UpdateDeploymentFolderBodySchema,
  UpdateDocumentTemplateFolderBodySchema,
  UpdateFolderBodySchema,
  UpdateResourceTypeVisibilityV1BodySchema,
  UpdateSkillFolderBodySchema,
  UpdateUserGroupV1BodySchema,
  UploadDatasetResponseSchema,
  UserGroupMemberV1BodySchema,
  UserGroupV1ResponseSchema,
  ZPublicApiV1
} from "@nexus/types/public-api-v1";
import { describe, expect, it } from "vitest";

import type { Equals, Expect, Received, Sent } from "../v1-contract-equality";
import type { ApiKeyConnection, ApiKeyService } from "./api-key-connections";
import type { Asset, AssetDeleteResult } from "./assets";
import type { AgentModel, DeleteResponse, ModelProvider } from "./common";
import type {
  AssignDeploymentToFolderBody,
  AssignDeploymentToFolderResponse,
  CreateDeploymentFolderBody,
  DeploymentFolder,
  ListDeploymentFoldersResponse,
  UpdateDeploymentFolderBody
} from "./deployment-folders";
import type { DeploymentDetail, DeploymentType } from "./deployments";
import type {
  AssignTemplateToFolderBody,
  AssignTemplateToFolderResponse,
  CreateDocumentTemplateFolderBody,
  DocumentTemplateFolder,
  ListDocumentTemplateFoldersResponse,
  UpdateDocumentTemplateFolderBody
} from "./document-template-folders";
import type { DocumentDetail } from "./documents";
import type { EvalSessionDetail, UploadDatasetResult } from "./evaluations";
import type {
  AgentFolder,
  AssignAgentToFolderBody,
  AssignAgentToFolderResponse,
  CreateFolderBody,
  ListFoldersResponse,
  UpdateFolderBody
} from "./folders";
import type { ModelSummary } from "./models";
import type {
  GrantPermissionBody,
  GrantPermissionResponse,
  ListResourceAccessResponse,
  OrgPermissionSettings,
  PermissionGrant,
  RevokePermissionBody,
  RevokePermissionResponse,
  UpdateResourceTypeVisibilityBody
} from "./permissions";
import type { AvailablePhoneNumber, BuyPhoneNumberBody, PhoneNumber } from "./phone-numbers";
import type {
  ReviewRoleManagementRequestBody,
  RoleAccessRequestResponse,
  RoleAccessRequestsResponse,
  RoleAutomationSettings,
  RoleAutomationSettingsBody,
  RoleCollectionGrantsResponse,
  RoleCoverage,
  RoleCreationRequestResponse,
  RoleCreationRequestsResponse,
  RoleDeletionRequestResponse,
  RoleDeletionRequestsResponse,
  RoleJobTypeBody,
  RoleJobTypeDeleteResponse,
  RoleJobTypeLibrary,
  RoleJobTypeWriteResponse,
  RoleManagementSettingsResponse,
  RoleMember,
  RoleMembershipResponse,
  RolePermissionSetResponse,
  RolePermissionSetsResponse,
  RoleResponse,
  RoleScopeLinesBody,
  RoleScopeLinesResponse,
  RolesListResponse,
  RoleSystemPolicy,
  RoleSystemPolicyBody,
  RoleSystemsResponse,
  RoleVariablesBody,
  RoleVariablesResponse,
  RoleWorkingYear,
  RoleWorkingYearBody,
  RoleWorkspaceGrantsResponse,
  UpsertRoleMemberBody
} from "./roles";
import type {
  AssignSkillToFolderBody,
  AssignSkillToFolderResponse,
  CreateSkillFolderBody,
  ListSkillFoldersResponse,
  SkillFolder,
  UpdateSkillFolderBody
} from "./skill-folders";
import type { ExternalToolDetail, ListExternalToolsResponse } from "./skills";
import type { GenerationDetail, GenerationSummary, TraceDetail, TraceSummary } from "./tracing";
import type {
  CreateUserGroupBody,
  DeleteUserGroupResponse,
  ListUserGroupsResponse,
  UpdateUserGroupBody,
  UserGroup,
  UserGroupMemberBody,
  UserGroupResponse
} from "./user-groups";

/**
 * THE DRIFT GATE between this package's hand-written types and the Zod contract
 * the server validates its own responses against.
 *
 * Every type under `types/` is a published npm contract, and every one of them
 * was written by reading `packages/types/src/api/public/v1/schemas/`. Reading is
 * not a gate. A field renamed on the server side leaves this package compiling
 * perfectly, shipping a lie to every consumer, and nothing anywhere goes red.
 * That is the failure this file exists to make impossible.
 *
 * `--max-warnings 0` already stops a NEW `any` from landing. It says nothing
 * about whether the types that replaced the old ones are still true, and it
 * never will — the two gates guard different things.
 *
 * ## Why the types are hand-written at all, rather than re-exported
 *
 * `@agent-nexus/sdk` declares `"dependencies": {}` deliberately — it is a
 * zero-dependency published package, and a consumer running `npm i` must not
 * pull the monorepo's type package or zod. So `@nexus/types` is a
 * **devDependency**, imported only from this file, which:
 *
 * - is not in `tsup`'s entry graph (`src/index.ts`), so nothing here reaches
 *   `dist/index.d.ts`;
 * - is not matched by `package.json`'s `files` array, so it is never published.
 *
 * The gate therefore runs at OUR build time and costs a consumer nothing.
 *
 * ## The machinery lives in `../v1-contract-equality`
 *
 * `Sent` / `Received` / `Wire` / `Equals` / `Expect`, shared with the workflow
 * slice beside this file. Why each exists — a schema having two types, `Date`
 * not surviving JSON, and why equality is not mutual assignability — is
 * documented there, once, rather than in each slice that imports it.
 */

/**
 * One entry per gated pair. A `false` here is a compile error on that exact
 * line, and the line names the type.
 *
 * `pnpm --filter @agent-nexus/sdk typecheck` is what enforces this, and CI's
 * `Typecheck` job is where it lands. **Vitest does NOT enforce it** — vitest
 * transpiles per file without running the project's type graph, so this file
 * reports green while `tsc` is red. Measured while building it: 12 tests passed
 * against two live `TS2344`s. The runtime block at the bottom is coverage and
 * liveness, never the check itself.
 */
export type V1ContractAssertions = [
  // ── agent folders ── /public/v1/folders
  Expect<Equals<AgentFolder, Received<typeof AgentFolderSchema>>>,
  Expect<Equals<ListFoldersResponse, Received<typeof ListFoldersResponseSchema>>>,
  Expect<Equals<CreateFolderBody, Sent<typeof CreateFolderBodySchema>>>,
  Expect<Equals<UpdateFolderBody, Sent<typeof UpdateFolderBodySchema>>>,
  Expect<Equals<AssignAgentToFolderBody, Sent<typeof AssignAgentToFolderBodySchema>>>,
  Expect<Equals<AssignAgentToFolderResponse, Received<typeof AssignAgentToFolderResponseSchema>>>,

  // ── skill folders ── /public/v1/skill-folders
  Expect<Equals<SkillFolder, Received<typeof SkillFolderSchema>>>,
  Expect<Equals<ListSkillFoldersResponse, Received<typeof ListSkillFoldersResponseSchema>>>,
  Expect<Equals<CreateSkillFolderBody, Sent<typeof CreateSkillFolderBodySchema>>>,
  Expect<Equals<UpdateSkillFolderBody, Sent<typeof UpdateSkillFolderBodySchema>>>,
  Expect<Equals<AssignSkillToFolderBody, Sent<typeof AssignSkillToFolderBodySchema>>>,
  Expect<Equals<AssignSkillToFolderResponse, Received<typeof AssignSkillToFolderResponseSchema>>>,

  // ── deployment folders ── /public/v1/deployment-folders
  Expect<Equals<DeploymentFolder, Received<typeof DeploymentFolderSchema>>>,
  Expect<
    Equals<ListDeploymentFoldersResponse, Received<typeof ListDeploymentFoldersResponseSchema>>
  >,
  Expect<Equals<CreateDeploymentFolderBody, Sent<typeof CreateDeploymentFolderBodySchema>>>,
  Expect<Equals<UpdateDeploymentFolderBody, Sent<typeof UpdateDeploymentFolderBodySchema>>>,
  Expect<Equals<AssignDeploymentToFolderBody, Sent<typeof AssignDeploymentToFolderBodySchema>>>,
  Expect<
    Equals<
      AssignDeploymentToFolderResponse,
      Received<typeof AssignDeploymentToFolderResponseSchema>
    >
  >,

  // ── document template folders ── /public/v1/document-template-folders
  Expect<Equals<DocumentTemplateFolder, Received<typeof DocumentTemplateFolderSchema>>>,
  Expect<
    Equals<
      ListDocumentTemplateFoldersResponse,
      Received<typeof ListDocumentTemplateFoldersResponseSchema>
    >
  >,
  Expect<
    Equals<CreateDocumentTemplateFolderBody, Sent<typeof CreateDocumentTemplateFolderBodySchema>>
  >,
  Expect<
    Equals<UpdateDocumentTemplateFolderBody, Sent<typeof UpdateDocumentTemplateFolderBodySchema>>
  >,
  Expect<Equals<AssignTemplateToFolderBody, Sent<typeof AssignTemplateToFolderBodySchema>>>,
  Expect<
    Equals<AssignTemplateToFolderResponse, Received<typeof AssignTemplateToFolderResponseSchema>>
  >,

  // ── the shared delete envelope, which four of those five families return ──
  Expect<Equals<DeleteResponse, Received<typeof DeleteDeploymentFolderResponseSchema>>>,

  // ── assets ── /public/v1/assets
  //
  // `AssetDeleteResult` is gated FIRST because this route is where the shared
  // envelope above was the defect: `assets.delete()` was typed `DeleteResponse`,
  // which declares `{id, deleted}` and nothing else, so `objectRemoved` — the
  // one field saying whether the public URL stopped serving — was unreachable
  // from every consumer of this package, `--json` included (NEX-3850). Nothing
  // went red, because a resource method's declared return type is checked
  // against nothing: `request<T>` takes `T` from the call site.
  //
  // These two lines are that check. Widening the contract without widening the
  // type is now a compile error on the line that names the type.
  Expect<Equals<Asset, Received<typeof AssetSchema>>>,
  Expect<Equals<AssetDeleteResult, Received<typeof AssetDeleteResultSchema>>>,

  // ── phone numbers ── /public/v1/phone-numbers
  Expect<Equals<PhoneNumber, Received<typeof PhoneNumberSummarySchema>>>,
  Expect<Equals<AvailablePhoneNumber, Received<typeof AvailablePhoneNumberItemSchema>>>,
  Expect<Equals<BuyPhoneNumberBody, Sent<typeof BuyPhoneNumberBodySchema>>>,

  // ── permissions ── /public/v1/permissions
  Expect<Equals<PermissionGrant, Received<typeof PublicPermissionGrantSchema>>>,
  Expect<Equals<ListResourceAccessResponse, Received<typeof ListResourceAccessV1ResponseSchema>>>,
  Expect<Equals<GrantPermissionBody, Sent<typeof GrantPermissionV1BodySchema>>>,
  Expect<Equals<GrantPermissionResponse, Received<typeof GrantPermissionV1ResponseSchema>>>,
  Expect<Equals<RevokePermissionBody, Sent<typeof RevokePermissionV1BodySchema>>>,
  Expect<Equals<RevokePermissionResponse, Received<typeof RevokePermissionV1ResponseSchema>>>,
  Expect<Equals<OrgPermissionSettings, Received<typeof GetOrgPermissionSettingsV1ResponseSchema>>>,
  Expect<
    Equals<UpdateResourceTypeVisibilityBody, Sent<typeof UpdateResourceTypeVisibilityV1BodySchema>>
  >,

  // ── user groups ── /public/v1/user-groups
  Expect<Equals<UserGroup, Received<typeof PublicUserGroupSchema>>>,
  Expect<Equals<ListUserGroupsResponse, Received<typeof ListUserGroupsV1ResponseSchema>>>,
  Expect<Equals<UserGroupResponse, Received<typeof UserGroupV1ResponseSchema>>>,
  Expect<Equals<CreateUserGroupBody, Sent<typeof CreateUserGroupV1BodySchema>>>,
  Expect<Equals<UpdateUserGroupBody, Sent<typeof UpdateUserGroupV1BodySchema>>>,
  Expect<Equals<UserGroupMemberBody, Sent<typeof UserGroupMemberV1BodySchema>>>,
  Expect<Equals<DeleteUserGroupResponse, Received<typeof DeleteUserGroupV1ResponseSchema>>>,

  // ── evaluations ── the dataset upload's response (NEX-2961)
  Expect<Equals<UploadDatasetResult, Received<typeof UploadDatasetResponseSchema>>>,
  Expect<Equals<EvalSessionDetail, Received<typeof EvalSessionDetailSchema>>>,

  // ── the RESPONSE-SHAPE slice ─────────────────────────────────────────────
  //
  // 🚨 EVERY PAIR BELOW WAS DRIFTED WHEN IT WAS ADDED, AND EACH DRIFT WAS FOUND
  // BY A SWEEP RATHER THAN BY A CONSUMER. That is the argument for the sweep,
  // not for these ten types: the gate above this line already covered 82 pairs
  // and every one of these sat outside it, so `tsc`, ESLint and the whole suite
  // were green over ten published types that omitted 24 fields the server sends.
  //
  // The omission direction is the quiet one. A field the SDK INVENTS reads
  // `undefined` at runtime and someone eventually notices; a field the SDK OMITS
  // arrives in the JSON, is typed out of existence, and nobody ever looks for it.
  // `TraceSummary.source` is the worked example — the CLI bound `--source` as a
  // filter while this package's own result type said the field did not exist.
  Expect<Equals<TraceSummary, Received<typeof TraceSummarySchema>>>,
  Expect<Equals<TraceDetail, Received<typeof TraceDetailSchema>>>,
  Expect<Equals<GenerationSummary, Received<typeof GenerationSummarySchema>>>,
  Expect<Equals<GenerationDetail, Received<typeof GenerationDetailSchema>>>,
  Expect<Equals<DeploymentDetail, Received<typeof DeploymentDetailSchema>>>,
  Expect<Equals<DocumentDetail, Received<typeof DocumentDetailSchema>>>,
  Expect<Equals<ExternalToolDetail, Received<typeof ExternalToolDetailSchema>>>,
  Expect<Equals<ListExternalToolsResponse, Received<typeof ListExternalToolsResponseSchema>>>,

  // ── the two enums, and why an enum is worth its own pair ─────────────────
  //
  // An enum drifts in two directions and they are DIFFERENT BUGS. A member the
  // SDK invents is a caller writing correct-looking code that 400s. A member the
  // SDK omits is a legal value the caller cannot name at all — no error, just an
  // unreachable channel. `DeploymentType` managed both at once: it declared an
  // `SMS` the server rejects and hid the real `INSTAGRAM`.
  //
  // `ApiKeyService` is the same defect found independently, hiding
  // `META_INSTAGRAM`. Both enums derive from a Prisma enum on the schema side, so
  // gating them here means the next value added to the database cannot land
  // without this package following it.
  Expect<Equals<DeploymentType, Received<typeof DeploymentTypeSchema>>>,
  Expect<Equals<ApiKeyService, Received<typeof ApiKeyServiceSchema>>>,
  Expect<Equals<ApiKeyConnection, Received<typeof ApiKeyConnectionSchema>>>,

  // `ModelSummary` is the one pair here that was fixed on the CONTRACT side.
  // The models repository emits `source` from both `listSystem` and `listCustom`;
  // `ModelSummarySchema` omitted it. This package was right and the schema was
  // wrong, which is worth stating plainly — "the contract is authoritative" is a
  // good default and it is not a law.
  Expect<Equals<ModelSummary, Received<typeof ModelSummarySchema>>>,

  // And so was the RESPONSE, for the same reason and in the same direction:
  // `ListModelsResponseSchema` declared `{ models: [...] }` while the handler
  // has returned a bare array since the wrapper was dropped *for* this package's
  // contract. Gating it is what stops the pair separating a second time — the
  // last separation shipped `nexus model list --json` printing `{}` for 45
  // models, because a resource method's declared return type is checked against
  // nothing (NEX-3868).
  Expect<Equals<ModelSummary[], Received<typeof ListModelsResponseSchema>>>,

  // ── the model-provider enum ──────────────────────────────────────────────
  //
  // 🚨 ONE PAIR, MANY SURFACES. `ModelProvider` is the only spelling of the
  // provider set this package publishes, and it is reached by `ModelConfig`,
  // `GenerationSummary` and `ListGenerationsParams`. Gating it here means the
  // enum is DERIVED-AND-CHECKED rather than hand-copied at each of them.
  //
  // The pair only became assertable when `ModelProviderSchema` stopped casting
  // its argument to `[string, ...string[]]`: under that cast `Sent<>` was bare
  // `string`, so this line would have failed while describing a contract that
  // was correct at runtime the whole time. That is the tell for a schema whose
  // TYPE has been widened away from what it PARSES — the assertion cannot be
  // written, rather than failing loudly.
  Expect<Equals<ModelProvider, Sent<typeof ModelProviderSchema>>>,

  // ── the agent-model enum ─────────────────────────────────────────────────
  //
  // Same shape, same cause, one file over. `AgentModel` is this package's only
  // spelling of the legacy model set and is reached by `Agent.model`,
  // `CreateAgentParams` and `UpdateAgentParams`. It was hand-written and
  // CORRECT, and nothing could say so: `AgentModelSchema` carried the same
  // `[string, ...string[]]` cast, so `Sent<>` was bare `string` and this line
  // could not be written. A hand-copied enum that no gate can reach is one
  // rename away from being wrong silently.
  Expect<Equals<AgentModel, Sent<typeof AgentModelSchema>>>,

  // ── roles ── /public/v1/roles/*, /public/v1/role-job-types
  //
  // Ten routes, ten pairs, and the deep ones are here deliberately. `RoleCoverage`
  // is a tree of eight discriminated unions plus a formula AST, and it is the ONE
  // response on this surface that carries salary — a wrong arm there is a money
  // figure rendered from the wrong field, so it is the last shape that should be
  // "checked by reading". Same argument for the job-type library, whose rate
  // inputs are a discriminated union a `null` fallback would price at zero.
  Expect<Equals<RolesListResponse, Received<typeof RolesListV1ResponseSchema>>>,
  Expect<Equals<RoleResponse, Received<typeof RoleV1ResponseSchema>>>,
  Expect<Equals<RoleSystemsResponse, Received<typeof RoleResourcesV1ResponseSchema>>>,
  Expect<Equals<RoleMembershipResponse, Received<typeof RoleMembershipV1ResponseSchema>>>,
  Expect<Equals<RolePermissionSetsResponse, Received<typeof RolePermissionSetsV1ResponseSchema>>>,
  Expect<
    Equals<RoleCollectionGrantsResponse, Received<typeof RoleCollectionGrantsV1ResponseSchema>>
  >,
  Expect<Equals<RoleWorkspaceGrantsResponse, Received<typeof RoleWorkspaceGrantsV1ResponseSchema>>>,
  Expect<Equals<RoleAccessRequestsResponse, Received<typeof RoleAccessRequestsV1ResponseSchema>>>,
  Expect<Equals<RoleCoverage, Received<typeof RoleCoverageV1ResponseSchema>>>,
  Expect<Equals<RoleJobTypeLibrary, Received<typeof RoleJobTypesV1ResponseSchema>>>,

  // ── roles, the write half ──
  //
  // Gated the run the schemas LANDED. Before that commit these imports resolved to
  // nothing, so adding them would have been a TS2305 on CI rather than a check —
  // which is why the previous pass deliberately left them out and said so.
  Expect<Equals<RolePermissionSetResponse, Received<typeof RolePermissionSetV1ResponseSchema>>>,
  Expect<Equals<RoleAccessRequestResponse, Received<typeof RoleAccessRequestV1ResponseSchema>>>,
  Expect<
    Equals<ReviewRoleManagementRequestBody, Sent<typeof RoleManagementRequestReviewV1BodySchema>>
  >,
  Expect<
    Equals<RoleCreationRequestsResponse, Received<typeof RoleCreationRequestsV1ResponseSchema>>
  >,
  Expect<Equals<RoleCreationRequestResponse, Received<typeof RoleCreationRequestV1ResponseSchema>>>,
  Expect<
    Equals<RoleDeletionRequestsResponse, Received<typeof RoleDeletionRequestsV1ResponseSchema>>
  >,
  Expect<Equals<RoleDeletionRequestResponse, Received<typeof RoleDeletionRequestV1ResponseSchema>>>,
  Expect<
    Equals<RoleManagementSettingsResponse, Received<typeof RoleManagementSettingsV1ResponseSchema>>
  >,
  Expect<Equals<RoleJobTypeBody, Sent<typeof RoleJobTypeV1BodySchema>>>,
  Expect<Equals<RoleJobTypeWriteResponse, Received<typeof RoleJobTypeV1WriteResponseSchema>>>,
  Expect<Equals<RoleJobTypeDeleteResponse, Received<typeof RoleJobTypeV1DeleteResponseSchema>>>,
  Expect<Equals<RoleAutomationSettingsBody, Sent<typeof RoleAutomationSettingsV1BodySchema>>>,
  Expect<Equals<RoleScopeLinesBody, Sent<typeof RoleScopeLinesV1BodySchema>>>,
  Expect<Equals<RoleScopeLinesResponse, Received<typeof RoleScopeLinesV1ResponseSchema>>>,
  Expect<Equals<RoleVariablesBody, Sent<typeof RoleVariablesV1BodySchema>>>,
  Expect<Equals<RoleVariablesResponse, Received<typeof RoleVariablesV1ResponseSchema>>>,
  Expect<Equals<RoleWorkingYearBody, Sent<typeof RoleWorkingYearV1BodySchema>>>,
  Expect<Equals<RoleSystemPolicyBody, Sent<typeof RoleSystemPolicyV1BodySchema>>>,

  // ── the three nullable READS, asserted through the DESCRIPTOR ──────────────
  //
  // 🚨 THESE SIX GO THROUGH `ZPublicApiV1.<Descriptor>.Response`, NOT THROUGH THE
  // NAMED SCHEMA EXPORT, AND THAT DIFFERENCE IS THE WHOLE POINT.
  //
  // A descriptor may WRAP its schema. Here each GET declares
  // `…V1ResponseSchema.nullable()` while its PUT declares the bare object — a read
  // answers `null` when nothing has been authored, an upsert always writes a row.
  // The schema export is only the inner half, so an assertion against it compares
  // the SDK's type to something no route serves.
  //
  // That is exactly what happened: these three passed against the named export
  // while the SDK typed all three reads as always-present, and the CLI threw
  // `Cannot read properties of null` on the ordinary unset path. The contract was
  // right the whole time and the assertion was pointed one level too shallow.
  //
  // Asserting through the descriptor also means a future `.nullable()`,
  // `.optional()` or `.transform()` added at the descriptor cannot slip past.
  Expect<
    Equals<
      RoleAutomationSettings | null,
      Received<typeof ZPublicApiV1.RoleAutomationSettingsGet.Response>
    >
  >,
  Expect<
    Equals<
      RoleAutomationSettings,
      Received<typeof ZPublicApiV1.RoleAutomationSettingsUpsert.Response>
    >
  >,
  Expect<
    Equals<RoleWorkingYear | null, Received<typeof ZPublicApiV1.RolesGetWorkingYear.Response>>
  >,
  Expect<Equals<RoleWorkingYear, Received<typeof ZPublicApiV1.RolesUpsertWorkingYear.Response>>>,
  Expect<
    Equals<RoleSystemPolicy | null, Received<typeof ZPublicApiV1.RolesGetSystemPolicy.Response>>
  >,
  Expect<Equals<RoleSystemPolicy, Received<typeof ZPublicApiV1.RolesUpsertSystemPolicy.Response>>>,

  // The member ADD, both halves through the DESCRIPTOR for the reason stated above.
  // Its response is an ALIAS of the internal row today; asserting the alias export
  // would compare this package's type to the inner half of whatever the descriptor
  // eventually wraps, which is how three reads passed while the SDK typed them
  // always-present.
  Expect<Equals<UpsertRoleMemberBody, Sent<typeof ZPublicApiV1.RolesUpsertMember.Body>>>,
  Expect<Equals<RoleMember, Received<typeof ZPublicApiV1.RolesUpsertMember.Response>>>
];

/**
 * The pairs asserted above, named for the coverage ratchet.
 *
 * This list is written by hand and the floor below is a hardcoded LITERAL, never
 * `GATED_PAIRS.length` compared against itself — an assertion that derives both
 * sides from the same source passes vacuously and proves nothing.
 */
const GATED_PAIRS = [
  "AgentFolder ↔ AgentFolderSchema",
  "ListFoldersResponse ↔ ListFoldersResponseSchema",
  "CreateFolderBody ↔ CreateFolderBodySchema",
  "UpdateFolderBody ↔ UpdateFolderBodySchema",
  "AssignAgentToFolderBody ↔ AssignAgentToFolderBodySchema",
  "AssignAgentToFolderResponse ↔ AssignAgentToFolderResponseSchema",
  "SkillFolder ↔ SkillFolderSchema",
  "ListSkillFoldersResponse ↔ ListSkillFoldersResponseSchema",
  "CreateSkillFolderBody ↔ CreateSkillFolderBodySchema",
  "UpdateSkillFolderBody ↔ UpdateSkillFolderBodySchema",
  "AssignSkillToFolderBody ↔ AssignSkillToFolderBodySchema",
  "AssignSkillToFolderResponse ↔ AssignSkillToFolderResponseSchema",
  "DeploymentFolder ↔ DeploymentFolderSchema",
  "ListDeploymentFoldersResponse ↔ ListDeploymentFoldersResponseSchema",
  "CreateDeploymentFolderBody ↔ CreateDeploymentFolderBodySchema",
  "UpdateDeploymentFolderBody ↔ UpdateDeploymentFolderBodySchema",
  "AssignDeploymentToFolderBody ↔ AssignDeploymentToFolderBodySchema",
  "AssignDeploymentToFolderResponse ↔ AssignDeploymentToFolderResponseSchema",
  "DocumentTemplateFolder ↔ DocumentTemplateFolderSchema",
  "ListDocumentTemplateFoldersResponse ↔ ListDocumentTemplateFoldersResponseSchema",
  "CreateDocumentTemplateFolderBody ↔ CreateDocumentTemplateFolderBodySchema",
  "UpdateDocumentTemplateFolderBody ↔ UpdateDocumentTemplateFolderBodySchema",
  "AssignTemplateToFolderBody ↔ AssignTemplateToFolderBodySchema",
  "AssignTemplateToFolderResponse ↔ AssignTemplateToFolderResponseSchema",
  "DeleteResponse ↔ DeleteDeploymentFolderResponseSchema",

  "Asset ↔ AssetSchema",
  "AssetDeleteResult ↔ AssetDeleteResultSchema",
  "PhoneNumber ↔ PhoneNumberSummarySchema",
  "AvailablePhoneNumber ↔ AvailablePhoneNumberItemSchema",
  "BuyPhoneNumberBody ↔ BuyPhoneNumberBodySchema",
  "PermissionGrant ↔ PublicPermissionGrantSchema",
  "ListResourceAccessResponse ↔ ListResourceAccessV1ResponseSchema",
  "GrantPermissionBody ↔ GrantPermissionV1BodySchema",
  "GrantPermissionResponse ↔ GrantPermissionV1ResponseSchema",
  "RevokePermissionBody ↔ RevokePermissionV1BodySchema",
  "RevokePermissionResponse ↔ RevokePermissionV1ResponseSchema",
  "OrgPermissionSettings ↔ GetOrgPermissionSettingsV1ResponseSchema",
  "UpdateResourceTypeVisibilityBody ↔ UpdateResourceTypeVisibilityV1BodySchema",
  "UserGroup ↔ PublicUserGroupSchema",
  "ListUserGroupsResponse ↔ ListUserGroupsV1ResponseSchema",
  "UserGroupResponse ↔ UserGroupV1ResponseSchema",
  "CreateUserGroupBody ↔ CreateUserGroupV1BodySchema",
  "UpdateUserGroupBody ↔ UpdateUserGroupV1BodySchema",
  "UserGroupMemberBody ↔ UserGroupMemberV1BodySchema",
  "DeleteUserGroupResponse ↔ DeleteUserGroupV1ResponseSchema",

  "UploadDatasetResult ↔ UploadDatasetResponseSchema",
  "EvalSessionDetail ↔ EvalSessionDetailSchema",

  "TraceSummary ↔ TraceSummarySchema",
  "TraceDetail ↔ TraceDetailSchema",
  "GenerationSummary ↔ GenerationSummarySchema",
  "GenerationDetail ↔ GenerationDetailSchema",
  "DeploymentDetail ↔ DeploymentDetailSchema",
  "DocumentDetail ↔ DocumentDetailSchema",
  "ExternalToolDetail ↔ ExternalToolDetailSchema",
  "ListExternalToolsResponse ↔ ListExternalToolsResponseSchema",
  "DeploymentType ↔ DeploymentTypeSchema",
  "ApiKeyService ↔ ApiKeyServiceSchema",
  "ApiKeyConnection ↔ ApiKeyConnectionSchema",
  "ModelSummary ↔ ModelSummarySchema",
  "ModelSummary[] ↔ ListModelsResponseSchema",

  "ModelProvider ↔ ModelProviderSchema",
  "AgentModel ↔ AgentModelSchema",

  "RolesListResponse ↔ RolesListV1ResponseSchema",
  "RoleResponse ↔ RoleV1ResponseSchema",
  "RoleSystemsResponse ↔ RoleResourcesV1ResponseSchema",
  "RoleMembershipResponse ↔ RoleMembershipV1ResponseSchema",
  "RolePermissionSetsResponse ↔ RolePermissionSetsV1ResponseSchema",
  "RoleCollectionGrantsResponse ↔ RoleCollectionGrantsV1ResponseSchema",
  "RoleWorkspaceGrantsResponse ↔ RoleWorkspaceGrantsV1ResponseSchema",
  "RoleAccessRequestsResponse ↔ RoleAccessRequestsV1ResponseSchema",
  "RoleCoverage ↔ RoleCoverageV1ResponseSchema",
  "RoleJobTypeLibrary ↔ RoleJobTypesV1ResponseSchema",

  "RolePermissionSetResponse ↔ RolePermissionSetV1ResponseSchema",
  "RoleAccessRequestResponse ↔ RoleAccessRequestV1ResponseSchema",
  "ReviewRoleManagementRequestBody ↔ RoleManagementRequestReviewV1BodySchema",
  "RoleCreationRequestsResponse ↔ RoleCreationRequestsV1ResponseSchema",
  "RoleCreationRequestResponse ↔ RoleCreationRequestV1ResponseSchema",
  "RoleDeletionRequestsResponse ↔ RoleDeletionRequestsV1ResponseSchema",
  "RoleDeletionRequestResponse ↔ RoleDeletionRequestV1ResponseSchema",
  "RoleManagementSettingsResponse ↔ RoleManagementSettingsV1ResponseSchema",
  "RoleJobTypeBody ↔ RoleJobTypeV1BodySchema",
  "RoleJobTypeWriteResponse ↔ RoleJobTypeV1WriteResponseSchema",
  "RoleJobTypeDeleteResponse ↔ RoleJobTypeV1DeleteResponseSchema",
  "RoleAutomationSettingsBody ↔ RoleAutomationSettingsV1BodySchema",
  "RoleAutomationSettings | null ↔ ZPublicApiV1.RoleAutomationSettingsGet.Response",
  "RoleAutomationSettings ↔ ZPublicApiV1.RoleAutomationSettingsUpsert.Response",
  "RoleScopeLinesBody ↔ RoleScopeLinesV1BodySchema",
  "RoleScopeLinesResponse ↔ RoleScopeLinesV1ResponseSchema",
  "RoleVariablesBody ↔ RoleVariablesV1BodySchema",
  "RoleVariablesResponse ↔ RoleVariablesV1ResponseSchema",
  "RoleWorkingYearBody ↔ RoleWorkingYearV1BodySchema",
  "RoleWorkingYear | null ↔ ZPublicApiV1.RolesGetWorkingYear.Response",
  "RoleWorkingYear ↔ ZPublicApiV1.RolesUpsertWorkingYear.Response",
  "RoleSystemPolicyBody ↔ RoleSystemPolicyV1BodySchema",
  "RoleSystemPolicy | null ↔ ZPublicApiV1.RolesGetSystemPolicy.Response",
  "RoleSystemPolicy ↔ ZPublicApiV1.RolesUpsertSystemPolicy.Response",

  "UpsertRoleMemberBody ↔ ZPublicApiV1.RolesUpsertMember.Body",
  "RoleMember ↔ ZPublicApiV1.RolesUpsertMember.Response"
] as const;

/**
 * Types that CANNOT be gated by type equality, each with the reason.
 *
 * Written down because a gate that quietly omits something reads as coverage.
 * Anything absent from BOTH lists is simply unchecked, which is the state most
 * of the contract is still in — see the coverage test.
 */
const UNGATED_WITH_REASON: ReadonlyArray<readonly [string, string]> = [
  [
    "ListPhoneNumbersParams",
    "ListPhoneNumbersParamsSchema extends PaginationParamsSchema, whose page/limit are " +
      "z.coerce.number().default(...). The OUTPUT makes them required (the default fills them " +
      "in) and the INPUT is `unknown` (coercion accepts anything, because these arrive as " +
      "query-string text). Neither is the optional `number` a typed client sends, so equality " +
      "is the wrong instrument here rather than the SDK type being wrong."
  ],
  [
    "SearchAvailablePhoneNumbersParams",
    "Same shape, worse: sms/mms/voice are z.preprocess(...), whose input type is `unknown` by " +
      'construction so a query string can carry the literal text "true". The SDK\'s boolean is ' +
      "deliberately NARROWER than the schema accepts, which is correct for a typed client."
  ],
  [
    "ReleasePhoneNumberResponse",
    "ZPhoneNumbers.PhoneNumberRelease declares no Response at all, so there is no schema to " +
      "compare against. Its contract comment also describes a bare `{ id }`, which the handler " +
      "has not returned for some time — V1ReleasePhoneNumberUseCase returns eight fields. Until " +
      "packages/types grows the schema, this type is checked by reading and nothing else."
  ],
  [
    "CreateRolePermissionSetBody",
    "RolePermissionSetCreateV1BodySchema's `surfaces` is z.array(RoleGroupSurfaceValueSchema), and " +
      "that schema is annotated `z.ZodType<RoleGroupSurfaceValue>` — one type argument. In zod 4 " +
      "the SECOND generic parameter of ZodType is the INPUT, so annotating only the first leaves " +
      "the input `unknown` and the array's input `unknown[]`. The SDK's literal union is " +
      "deliberately NARROWER than that, which is correct for a typed client, so equality is the " +
      "wrong instrument rather than the type being wrong. The OUTPUT side is gated through " +
      "RolePermissionSetResponse, which is what the server actually validates."
  ],
  [
    "UpdateRolePermissionSetBody",
    "Same `surfaces` shape and the same reason as CreateRolePermissionSetBody: the annotated " +
      "z.ZodType leaves its input `unknown`, so a wire-input comparison would require this " +
      "package to publish `unknown[]` where it correctly publishes the surface union. Its " +
      "capabilities, name and resourceRelation fields DO compare equal; only surfaces does not, " +
      "and no partial form of this assertion exists."
  ],
  [
    "EvalResult",
    "Its `status` and `judgeStatus` are z.string() in the schema and a four-member literal " +
      "union here, so equality refuses the pair while the SDK is the more precise of the two. " +
      "The four members are the EVALUATION_EXECUTION_STATUS_VALUES / " +
      "EVALUATION_JUDGE_STATUS_VALUES Prisma enums, which is where the server reads them from, " +
      "so widening this package to `string` would lose real information to satisfy an " +
      "instrument. The three fields this pair was drifting on — judgeStatus, executionError, " +
      "judgeError — are fixed and UNGATED: nothing stops them drifting again, and saying so " +
      "is the point of this entry."
  ],
  [
    "ListRoleAccessRequestsParams",
    "RoleAccessRequestListParamsV1Schema wraps its status in `optionalQueryParam`, whose INPUT " +
      "is `unknown` by construction — a query string arrives as text and the wrapper " +
      "preprocesses an empty string away. The SDK's optional literal union is deliberately " +
      "NARROWER than the schema accepts, which is correct for a typed client, so equality is " +
      "the wrong instrument here rather than the type being wrong."
  ]
] as const;

/**
 * A ratchet, not a target. Raise it when pairs are added; never lower it.
 *
 * 98 pairs are covered. Most of the contract is not, and this file does not
 * pretend otherwise — see the coverage test's message.
 *
 * ## What a sweep of the WHOLE surface measured, so the gap has a denominator
 *
 * Every exported type under `types/` was paired by name against the v1 schemas
 * and compared by the same `Equals` this file uses — `Sent` for a request type,
 * `Received` for a response — rather than eyeballed:
 *
 * - 618 exported types in this package; 343 have a name-matched v1 schema.
 * - Of those 343, 268 were outside this gate. 81 of the 268 did not compare
 *   equal.
 * - Those 81 are not 81 defects. 4 are name collisions (`ExecutionStatus` here
 *   is an object, `ExecutionStatusSchema` is an enum) and ~40 are the
 *   query-param coercion class already exempted below, where equality is the
 *   wrong instrument. The RESPONSE axis is where the real drift concentrated:
 *   ten types omitting 24 fields the server sends, and two enums.
 *
 * Re-run the sweep rather than trusting these numbers — they move with the
 * contract, and a figure written down is a figure that stops being measured.
 */
const GATED_PAIR_FLOOR = 98;

describe("the SDK's types match the Public API v1 contract", () => {
  /**
   * The compile-time assertions live in `V1ContractAssertions` and are enforced
   * by `tsc`, not by this runner. This keeps the count honest and documents
   * where the real check is.
   */
  it("is enforced by typecheck, and this file is where a drift surfaces", () => {
    expect(GATED_PAIRS.length).toBeGreaterThanOrEqual(GATED_PAIR_FLOOR);
  });

  /**
   * Without this the assertions could be checked against the wrong module. A
   * failure to resolve would make every schema `any`, which `Equals` refuses and
   * `tsc` would catch — but a WRONG entry point could resolve to a real,
   * different module and still compile. So pin values only the real v1 contract
   * has.
   */
  it("actually reached the real v1 contract, not a stub", () => {
    expect(Object.keys(ZPublicApiV1).length).toBeGreaterThan(200);
    expect(ZPublicApiV1.FolderList.path).toBe("/public/v1/folders");
    expect(ZPublicApiV1.SkillFolderList.path).toBe("/public/v1/skill-folders");
    expect(ZPublicApiV1.DeploymentFolderList.path).toBe("/public/v1/deployment-folders");
    expect(ZPublicApiV1.PhoneNumberList.path).toBe("/public/v1/phone-numbers");
  });

  /**
   * Coverage is stated out loud rather than implied. A gate covering 29 of 228
   * routes that reads as "the types are checked" is worse than no gate, because
   * it stops anyone looking for the ones that are missing.
   */
  it("states how much of the contract it does NOT cover", () => {
    const routesWithAResponse = Object.values(ZPublicApiV1).filter(
      (route) => "Response" in route
    ).length;

    expect(routesWithAResponse).toBeGreaterThan(GATED_PAIRS.length);
    expect(
      GATED_PAIRS.length,
      `This gate covers ${GATED_PAIRS.length} type pairs against ${routesWithAResponse} v1 ` +
        `routes that declare a Response. The remainder are NOT checked against the contract — ` +
        `extend GATED_PAIRS and V1ContractAssertions together as more families are covered, ` +
        `and raise GATED_PAIR_FLOOR. Never lower it.`
    ).toBe(GATED_PAIR_FLOOR);
  });

  /** An exemption with no reason is an omission wearing a label. */
  it("gives every ungatable type a reason, and never double-counts one", () => {
    for (const [name, reason] of UNGATED_WITH_REASON) {
      expect(reason.length, `${name} is exempt with no reason given`).toBeGreaterThan(60);
      expect(
        GATED_PAIRS.some((pair) => pair.startsWith(`${name} `)),
        `${name} is listed as BOTH gated and ungated`
      ).toBe(false);
    }
    expect(UNGATED_WITH_REASON.length).toBe(7);
  });
});
