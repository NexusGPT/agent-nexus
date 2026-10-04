/**
 * The COST-SAFETY and CONSUMPTION-CAP wire shapes the admin CLI reads — an
 * organisation's spend state, the per-usage caps set against it, and the list
 * an operator sweeps.
 *
 * Split out of `admin-wire-types.ts` — one module per admin surface, the same
 * shape the Vibe tenant gates already use. Hand-declared for the reason that
 * file gives: the CLI publishes standalone, so `@nexus/types` cannot be a
 * runtime dependency. Nothing about the shapes changed in the move, and the
 * conformance module beside this one is what fails `pnpm typecheck` when one
 * stops matching its `ZAdminVibe*` contract.
 */

/**
 * Tri-state PATCH value for a consumption-cap column. Distinguishes the three
 * semantically-different operator intents:
 *
 *   - flag omitted        → property absent from body → adapter leaves column untouched
 *   - flag value `"none"` → property present, value `null` → adapter clears the override
 *   - flag value integer  → property present, value number → adapter installs the override
 *
 * The whole reason this is wire-level visible (rather than just `number | null`
 * with `null = unchanged`) is that "do nothing" and "clear" both need
 * non-collapsing representations across the JSON boundary. See the backend's
 * SetVibeOrgConsumptionCapUseCase, which uses `in` (not `??`) to keep them
 * distinct.
 */
export type CapPatchValue = number | null;

/**
 * The cost-safety states — mirrors `$Enums.VibeOrgCostSafetyStatus`.
 *
 * Deliberately re-declared rather than imported from `@nexus/types`, which owns
 * the canonical list and bridges it straight off the generated Prisma enum
 * (`api/domains/admin/zadmin-vibe-cost-safety.ts`). Importing it would drag zod
 * and the generated Prisma enums into a CLI whose only runtime dependency is
 * `commander` — the same trade `vibe-regions.ts` documents. The backend's Zod
 * boundary rejects a bad status regardless: this copy fails before the HTTP
 * call and names the choices in `--help`, it does not enforce the policy.
 *
 * ONE copy, read by every verb in the cost-safety section. A second list is the
 * exact failure this must not repeat: `zadmin-vibe-cost-safety.ts` once
 * hand-kept `["OK","WARNING","SUSPENDED"]` under the SAME NAME as the generated
 * constant, so a fourth status would have moved with the schema everywhere
 * except at that one boundary, which would have kept rejecting it. Adding a
 * verb means reusing this constant, never retyping it.
 */
export const COST_SAFETY_STATUS_VALUES = ["OK", "WARNING", "SUSPENDED"] as const;
export type CostSafetyStatus = (typeof COST_SAFETY_STATUS_VALUES)[number];

export interface VibeOrgCostSafetyStateResponse {
  organizationId: string;
  status: CostSafetyStatus;
  suspendedReason: string | null;
  present: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface VibeOrgConsumptionCapResponse {
  organizationId: string;
  /** Raw overrides — null = use platform default for this type. */
  computeMinCap: number | null;
  buildMinCap: number | null;
  egressMbCap: number | null;
  backupMinCap: number | null;
  /** Resolved effective caps (override ?? platform default). */
  effectiveComputeMinCap: number;
  effectiveBuildMinCap: number;
  effectiveEgressMbCap: number;
  effectiveBackupMinCap: number;
  present: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * One row of the fleet read.
 *
 * NOT the same shape as `VibeOrgCostSafetyStateResponse`: that one carries
 * `present` and nullable timestamps because it answers for an org that may have
 * no row at all. Every item here IS a row, so `present` would be a constant
 * `true` and the timestamps can never be null.
 *
 * `organizationName` is nullable on purpose — a cost-safety row can outlive its
 * organization, and the honest answer is `null` beside the raw id.
 *
 * Declared as a `type`, not an `interface`: only a type alias carries the
 * implicit index signature that `printTable`'s `Record<string, unknown>` row
 * parameter needs, so flipping this to an interface breaks the render call.
 */
export type VibeOrgCostSafetyStateListItem = {
  organizationId: string;
  organizationName: string | null;
  status: CostSafetyStatus;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface ListVibeOrgCostSafetyStatesResponse {
  items: VibeOrgCostSafetyStateListItem[];
  /**
   * Rows matching the `--status` filter, independent of the page. The number IS
   * the report: "1 suspended org" and "1 of 300" call for entirely different
   * responses, and a page cannot tell them apart.
   */
  total: number;
}
