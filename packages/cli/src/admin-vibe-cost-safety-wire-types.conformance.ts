/**
 * THE DRIFT GATE for `admin-vibe-cost-safety-wire-types.ts`.
 *
 * Split out of `admin-wire-types.conformance.ts`, one gate per admin surface.
 *
 * `Data` is re-declared here rather than shared. That is the same trade that
 * file's own header makes for the operators — "the duplication is cheaper than
 * the coupling" — and here it is also FORCED: `wire-types-bundle.test.ts`
 * requires every `.conformance.ts` to import `@nexus/types`, so a module that
 * took `Data` from a shared vocabulary would carry that import unused, which
 * `unused-imports/no-unused-imports` reports and this package has no warning
 * budget for.
 */

import type { TApi } from "@nexus/types";

import type {
  ListVibeOrgCostSafetyStatesResponse,
  VibeOrgConsumptionCapResponse,
  VibeOrgCostSafetyStateListItem,
  VibeOrgCostSafetyStateResponse
} from "./admin-vibe-cost-safety-wire-types";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of an admin endpoint, unwrapped from its envelope. */
type Data<Domain extends keyof TApi, Op extends keyof TApi[Domain]> = Wire<
  TApi[Domain][Op] extends { Response: infer R } ? (R extends { data: infer D } ? D : R) : never
>;

// ============================================================
// Cost safety
// ============================================================

type WireCostSafetyState = Data<"AdminVibeCostSafety", "GetVibeOrgCostSafetyState">;
const _costSafetyState: Mirrors<
  "VibeOrgCostSafetyStateResponse",
  VibeOrgCostSafetyStateResponse,
  WireCostSafetyState
> = AGREES;

type WireCostSafetyList = Data<"AdminVibeCostSafety", "ListVibeOrgCostSafetyStates">;
const _costSafetyList: Mirrors<
  "ListVibeOrgCostSafetyStatesResponse",
  ListVibeOrgCostSafetyStatesResponse,
  WireCostSafetyList
> = AGREES;

type WireCostSafetyItem = WireCostSafetyList["items"][number];
const _costSafetyItem: Mirrors<
  "VibeOrgCostSafetyStateListItem",
  VibeOrgCostSafetyStateListItem,
  WireCostSafetyItem
> = AGREES;

// ============================================================
// Consumption caps
// ============================================================

type WireConsumptionCap = Data<"AdminVibeConsumptionCap", "GetVibeOrgConsumptionCap">;
const _consumptionCap: Mirrors<
  "VibeOrgConsumptionCapResponse",
  VibeOrgConsumptionCapResponse,
  WireConsumptionCap
> = AGREES;
// The module exists to be compiled. Exporting the bindings keeps `noUnusedLocals`
// from deleting the gate by complaining about it.
export { _consumptionCap, _costSafetyItem, _costSafetyList, _costSafetyState };
