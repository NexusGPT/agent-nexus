import {
  AgentFolderSchema,
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
  DeploymentFolderSchema,
  DocumentTemplateFolderSchema,
  GetOrgPermissionSettingsV1ResponseSchema,
  GrantPermissionV1BodySchema,
  GrantPermissionV1ResponseSchema,
  ListDeploymentFoldersResponseSchema,
  ListDocumentTemplateFoldersResponseSchema,
  ListFoldersResponseSchema,
  ListResourceAccessV1ResponseSchema,
  ListSkillFoldersResponseSchema,
  ListUserGroupsV1ResponseSchema,
  PhoneNumberSummarySchema,
  PublicPermissionGrantSchema,
  PublicUserGroupSchema,
  RevokePermissionV1BodySchema,
  RevokePermissionV1ResponseSchema,
  SkillFolderSchema,
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
import type { DeleteResponse } from "./common";
import type {
  AssignDeploymentToFolderBody,
  AssignDeploymentToFolderResponse,
  CreateDeploymentFolderBody,
  DeploymentFolder,
  ListDeploymentFoldersResponse,
  UpdateDeploymentFolderBody
} from "./deployment-folders";
import type {
  AssignTemplateToFolderBody,
  AssignTemplateToFolderResponse,
  CreateDocumentTemplateFolderBody,
  DocumentTemplateFolder,
  ListDocumentTemplateFoldersResponse,
  UpdateDocumentTemplateFolderBody
} from "./document-template-folders";
import type { UploadDatasetResult } from "./evaluations";
import type {
  AgentFolder,
  AssignAgentToFolderBody,
  AssignAgentToFolderResponse,
  CreateFolderBody,
  ListFoldersResponse,
  UpdateFolderBody
} from "./folders";
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
  AssignSkillToFolderBody,
  AssignSkillToFolderResponse,
  CreateSkillFolderBody,
  ListSkillFoldersResponse,
  SkillFolder,
  UpdateSkillFolderBody
} from "./skill-folders";
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
  Expect<Equals<UploadDatasetResult, Received<typeof UploadDatasetResponseSchema>>>
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

  "UploadDatasetResult ↔ UploadDatasetResponseSchema"
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
  ]
] as const;

/**
 * A ratchet, not a target. Raise it when pairs are added; never lower it.
 *
 * 44 pairs are covered. Most of the contract is not, and this file does not
 * pretend otherwise — see the coverage test's message.
 */
const GATED_PAIR_FLOOR = 44;

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
    expect(UNGATED_WITH_REASON.length).toBe(3);
  });
});
