import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DbEntity } from "@nexus/types";
import {
  CreateBranchBodySchema,
  CreateEdgeBodySchema,
  CreateNodeBodySchema,
  CreateWorkflowBodySchema,
  FilterFieldDefSchema,
  ListWorkflowsParamsSchema,
  NodeDeleteResultSchema,
  NodeResponseSchema,
  NodeTypeSchemaResponseSchema,
  NodeTypeSummarySchema,
  PlatformListenerEventSchema,
  ReloadPropsBodySchema,
  ReplaceTriggerBodySchema,
  UpdateBranchBodySchema,
  UpdateNodeBodySchema,
  UpdateWorkflowBodySchema,
  WorkflowDetailResponseSchema,
  WorkflowGraphEdgeSchema,
  WorkflowGraphNodeSchema,
  WorkflowSummaryResponseSchema
} from "@nexus/types/public-api-v1";
import { describe, expect, it } from "vitest";

import type { Equals, Expect, Received, Sent } from "../v1-contract-equality";
import type {
  CreateBranchBody,
  CreateEdgeBody,
  CreateNodeBody,
  CreateWorkflowBody,
  ListWorkflowsParams,
  NodeDeleteResult,
  NodeResponse,
  NodeTypeSchema,
  NodeTypeSummary,
  PlatformListenerEvent,
  PlatformListenerFilterFieldDef,
  ReloadPropsBody,
  ReplaceTriggerBody,
  UpdateBranchBody,
  UpdateNodeBody,
  UpdateWorkflowBody,
  WfSummary,
  WorkflowDetail,
  WorkflowEdge,
  WorkflowNode,
  WorkflowStatus
} from "./workflows";

/**
 * THE DRIFT GATE for `types/workflows.ts` — the workflow slice of the v1
 * contract gate.
 *
 * This file's siblings check the folder and phone-number families the same way,
 * against the same helpers in `../v1-contract-equality`. Splitting the slices
 * keeps each one readable; the machinery is shared so the two cannot diverge.
 *
 * `pnpm --filter @agent-nexus/sdk typecheck` is what enforces the assertions,
 * and CI's `Typecheck` job is where they land. **Vitest does NOT enforce them**
 * — it transpiles per file without running the project's type graph, so this
 * file reports green while `tsc` is red. The runtime block at the bottom is
 * coverage and liveness, never the check itself.
 *
 * ## Scope, stated so a green run is not over-read
 *
 * Only routes with a declared v1 `Response` schema can be gated here, because
 * only those have a second description to compare against. That is workflow list
 * and detail, the three node routes, and the builder's node-type and
 * platform-listener routes. Validate, overview, testing, branches, publish and
 * batch have no v1 schema at all; those declarations in `workflows.ts` name the
 * backend service they were read off, in their doc comments, and are listed in
 * {@link UNGATED_WITH_REASON} below rather than left silently uncovered.
 */

/**
 * One entry per gated pair. A `false` here is a compile error on that exact
 * line, and the line names the type.
 */
export type WorkflowContractAssertions = [
  // ── workflows ── /public/v1/workflows
  //
  // `status` is compared separately, below. The v1 schemas type it `z.string()`,
  // which is a WEAKER claim than the SDK makes: the column is an enum, so the
  // wire carries one of four values and the SDK says so. Asserting equality on
  // the whole object would fail for the one field where being stricter than the
  // schema is correct.
  Expect<
    Equals<
      Omit<WfSummary, "status">,
      Omit<Received<typeof WorkflowSummaryResponseSchema>, "status">
    >
  >,
  Expect<
    Equals<
      Omit<WorkflowDetail, "status">,
      Omit<Received<typeof WorkflowDetailResponseSchema>, "status">
    >
  >,
  Expect<Equals<CreateWorkflowBody, Sent<typeof CreateWorkflowBodySchema>>>,
  Expect<Equals<UpdateWorkflowBody, Sent<typeof UpdateWorkflowBodySchema>>>,
  // Pagination is excluded on both sides, and ONLY pagination. `page` and `limit`
  // are `z.coerce.number().default(...)`, whose INPUT type is `unknown` — coerce
  // accepts anything — so a pairwise comparison there says nothing useful about
  // what a caller may pass. The three filter params are compared exactly.
  Expect<
    Equals<
      Omit<ListWorkflowsParams, "page" | "limit">,
      Omit<Sent<typeof ListWorkflowsParamsSchema>, "page" | "limit">
    >
  >,

  // ── the graph shapes the detail payload embeds ──
  Expect<Equals<WorkflowNode, Received<typeof WorkflowGraphNodeSchema>>>,
  Expect<Equals<WorkflowEdge, Received<typeof WorkflowGraphEdgeSchema>>>,

  // ── nodes ── /public/v1/workflows/:id/nodes
  Expect<Equals<NodeResponse, Received<typeof NodeResponseSchema>>>,
  Expect<Equals<NodeDeleteResult, Received<typeof NodeDeleteResultSchema>>>,
  Expect<Equals<CreateNodeBody, Sent<typeof CreateNodeBodySchema>>>,
  Expect<Equals<UpdateNodeBody, Sent<typeof UpdateNodeBodySchema>>>,
  Expect<Equals<ReplaceTriggerBody, Sent<typeof ReplaceTriggerBodySchema>>>,
  Expect<Equals<CreateBranchBody, Sent<typeof CreateBranchBodySchema>>>,
  Expect<Equals<UpdateBranchBody, Sent<typeof UpdateBranchBodySchema>>>,
  Expect<Equals<ReloadPropsBody, Sent<typeof ReloadPropsBodySchema>>>,

  // ── edges ── /public/v1/workflows/:id/edges
  Expect<Equals<CreateEdgeBody, Sent<typeof CreateEdgeBodySchema>>>,

  // ── builder ── /public/v1/workflows/node-types, /platform-listener-events
  Expect<Equals<NodeTypeSummary, Received<typeof NodeTypeSummarySchema>>>,
  Expect<Equals<NodeTypeSchema, Received<typeof NodeTypeSchemaResponseSchema>>>,
  Expect<Equals<PlatformListenerEvent, Received<typeof PlatformListenerEventSchema>>>,
  Expect<Equals<PlatformListenerFilterFieldDef, Received<typeof FilterFieldDefSchema>>>
];

/**
 * `WorkflowStatus` covers every member of the `WorkflowStatus` database enum.
 *
 * Pinned against the GENERATED enum rather than a v1 schema on purpose: the
 * schemas type `status` as a plain string, so they cannot be the oracle for
 * WHICH values exist. The column can. `PAUSED` reached the wire unnamed by this
 * SDK precisely because nothing compared the two.
 *
 * 🚨 `DbEntity.WorkflowStatus` — never a literal union spelled out here. A
 * handwritten copy of the enum makes this assertion compare the SDK against
 * ITSELF: adding a status in `schema.prisma` regenerates the enum, both sides of
 * a literal comparison stay untouched, and the gate reports green while the SDK
 * again omits a value the API can send. That is the exact drift that hid
 * `PAUSED`, reintroduced by the gate meant to catch it.
 *
 * The same test applies to every assertion above, which is why each one derives
 * its right-hand side from a real schema VALUE (`Received<typeof …Schema>`)
 * rather than restating the shape.
 */
export type WorkflowStatusAssertion = Expect<Equals<WorkflowStatus, DbEntity.WorkflowStatus>>;

/**
 * The pairs asserted above, named for the coverage ratchet.
 *
 * Written by hand, and the floor below is a hardcoded LITERAL rather than
 * `GATED_PAIRS.length` compared against itself — an assertion that derives both
 * sides from the same source passes vacuously and proves nothing.
 */
const GATED_PAIRS = [
  "WfSummary ↔ WorkflowSummaryResponseSchema",
  "WorkflowDetail ↔ WorkflowDetailResponseSchema",
  "CreateWorkflowBody ↔ CreateWorkflowBodySchema",
  "UpdateWorkflowBody ↔ UpdateWorkflowBodySchema",
  "ListWorkflowsParams (filters only) ↔ ListWorkflowsParamsSchema",
  "WorkflowNode ↔ WorkflowGraphNodeSchema",
  "WorkflowEdge ↔ WorkflowGraphEdgeSchema",
  "NodeResponse ↔ NodeResponseSchema",
  "NodeDeleteResult ↔ NodeDeleteResultSchema",
  "CreateNodeBody ↔ CreateNodeBodySchema",
  "UpdateNodeBody ↔ UpdateNodeBodySchema",
  "ReplaceTriggerBody ↔ ReplaceTriggerBodySchema",
  "CreateBranchBody ↔ CreateBranchBodySchema",
  "UpdateBranchBody ↔ UpdateBranchBodySchema",
  "ReloadPropsBody ↔ ReloadPropsBodySchema",
  "CreateEdgeBody ↔ CreateEdgeBodySchema",
  "NodeTypeSummary ↔ NodeTypeSummarySchema",
  "NodeTypeSchema ↔ NodeTypeSchemaResponseSchema",
  "PlatformListenerEvent ↔ PlatformListenerEventSchema",
  "PlatformListenerFilterFieldDef ↔ FilterFieldDefSchema",
  "WorkflowStatus ↔ DbEntity.WorkflowStatus (the generated Prisma enum)"
] as const;

/**
 * Workflow types that CANNOT be gated by type equality, each with the reason.
 *
 * Written down because a gate that quietly omits something reads as coverage.
 * Every one of these is a route the v1 contract declares with NO `Response`
 * schema, so there is no second description to compare against — the SDK
 * declaration was read off the backend service instead, and its doc comment
 * names which one.
 */
/**
 * The most types this list may hold.
 *
 * 🚨 AN UPPER BOUND, NEVER A FLOOR. `toBeGreaterThanOrEqual(8)` stood here, and
 * a floor on a DEBT list is the exact-pin defect wearing a friendlier matcher:
 * it refuses the cure from one direction only, which makes it quieter and no
 * less wrong. Every entry is a route the v1 contract declares with no `Response`
 * schema; when one gains a schema the type becomes gatable and its row goes, and
 * draining the list to zero is the goal. `GATED_PAIRS` above keeps its floor —
 * it bounds the opposite population, which only grows.
 *
 * ⚠️ 9, MEASURED, NOT THE 8 THE OLD FLOOR NAMED. A floor and a ceiling are read
 * off opposite ends: `>= 8` was satisfied by a list of any size at or above 8
 * and said nothing about the live figure, so carrying the 8 across gave a
 * ceiling one under the tree and a permanent red. Take a ceiling from a count,
 * never from the number the floor happened to hold.
 */
const UNGATED_CEILING = 9;

const UNGATED_WITH_REASON: ReadonlyArray<readonly [string, string]> = [
  [
    "WorkflowArchiveResult",
    "DELETE /workflows/:id declares no Response schema; read off WorkflowRepository.archive"
  ],
  [
    "PublishResult / UnpublishResult / IconResult",
    "the three lifecycle routes declare no Response schema; read off WorkflowRepository"
  ],
  [
    "ReplaceTriggerResult",
    "PUT /workflows/:id/trigger declares no Response schema; read off WorkflowNodeService.replaceTrigger"
  ],
  [
    "Branch / BranchList / UpdatedBranch",
    "the branch routes declare no Response schema, and the elements are unschema'd node JSON"
  ],
  [
    "WorkflowOverview / AvailableVariables / OutputFormat / ValidationReport",
    "all six overview routes declare no Response schema; read off WorkflowOverviewService"
  ],
  [
    "TestNodeResult / TestWorkflowResult / ExecutionStatus / NodeExecutionResult / StopExecutionResult / WebhookTestPayload",
    "all six testing routes declare no Response schema; read off WorkflowTestingService"
  ],
  [
    "BatchResult",
    "POST /workflows/:id/batch declares no Response schema; BatchResult is a private interface inside WorkflowBatchService"
  ],
  [
    "ListWorkflowsParams.page / .limit",
    "z.coerce.number().default(...) makes the schema INPUT `unknown`, so there is nothing meaningful to compare a `number` against; the filter params beside them are gated"
  ],
  [
    "ReloadPropsResponse",
    "the reload-props handler has no declared return type at all; its shape is inferred from two return statements"
  ]
];

describe("workflow types match the v1 contract", () => {
  it("asserts every pair it claims to", () => {
    // The floor is a literal. Deleting an assertion above without deleting its
    // name here leaves this green; deleting BOTH takes it red, which is the
    // point — a shrinking gate has to be a deliberate act.
    expect(GATED_PAIRS.length).toBeGreaterThanOrEqual(21);
    expect(new Set(GATED_PAIRS).size).toBe(GATED_PAIRS.length);
  });

  it("names a reason for everything it does not gate", () => {
    for (const [name, reason] of UNGATED_WITH_REASON) {
      expect(name.length, "an ungated type must be named").toBeGreaterThan(0);
      expect(reason.length, `${name} is ungated with no reason`).toBeGreaterThan(20);
    }
    expect(
      UNGATED_WITH_REASON.length,
      `${UNGATED_WITH_REASON.length} ungated type(s) against a ceiling of ` +
        `${UNGATED_CEILING}. This can only fail by GROWING. A route that gains a ` +
        `Response schema makes its type gatable, and dropping the row then passes here ` +
        `in silence — lower the ceiling in the same commit.`
    ).toBeLessThanOrEqual(UNGATED_CEILING);
  });

  it("compares every assertion against a real oracle, never a restated one", () => {
    // THE RATCHET, and it exists because this file already broke this rule once.
    //
    // `WorkflowStatusAssertion` was written as
    // `Equals<WorkflowStatus, "DRAFT" | "PUBLISHED" | "ARCHIVED" | "PAUSED">` —
    // a handwritten copy of the database enum. That compares the SDK against
    // ITSELF: regenerating the enum leaves both sides of a literal untouched, so
    // a new status would have kept the gate green while the SDK omitted a value
    // the API can send. Measured: with the literal, adding a member to the
    // generated enum left `tsc` at exit 0; against `DbEntity.WorkflowStatus` it
    // is 1 error.
    //
    // Every mutation in this gate's own test battery had been on the SDK side,
    // so none of them could see it. This assertion is the oracle-side check,
    // made mechanical rather than remembered.
    const src = readFileSync(fileURLToPath(import.meta.url), "utf-8");
    const equalsCalls = [...src.matchAll(/Equals<\s*([\s\S]*?)>\s*>/g)].map((m) =>
      m[1].split(",").slice(1).join(",").trim()
    );

    // Control: an empty match set would make the check below vacuously true, and
    // a regex that stopped matching is exactly how this ratchet would rot.
    expect(equalsCalls.length).toBeGreaterThanOrEqual(20);

    const restated = equalsCalls.filter((oracle) => !/Received<|Sent<|DbEntity\./.test(oracle));
    expect(
      restated,
      "an assertion's right-hand side must come from a schema value or the " +
        "generated enum — a restated literal compares the SDK against itself"
    ).toEqual([]);
  });

  it("resolved the real schemas, not an empty module", () => {
    // Liveness. If `@nexus/types` stopped resolving, every type-level assertion
    // above would silently compare against `any` — and `Equals` refuses `any`,
    // so `tsc` would go red rather than green. This is the cheaper signal, and
    // it fires in the test run rather than in the typecheck job.
    expect(WorkflowGraphNodeSchema).toBeDefined();
    expect(NodeTypeSchemaResponseSchema).toBeDefined();
    expect(Object.keys(WorkflowSummaryResponseSchema.shape)).toContain("iconUrl");
    expect(Object.keys(WorkflowGraphEdgeSchema.shape)).toContain("targetHandle");
  });
});
