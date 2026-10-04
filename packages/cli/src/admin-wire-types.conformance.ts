/**
 * THE DRIFT GATE for `admin-wire-types.ts`.
 *
 * The CLI publishes standalone, so `@nexus/types` cannot be a runtime
 * dependency and the Vibe ADMIN wire shapes are hand-declared — the same
 * constraint, and the same exposure, that `vibe-wire-types.conformance.ts`
 * closes for the tenant surface. Until this file existed the only thing asking
 * for lockstep was a comment saying so, and TWO shapes had drifted past it:
 *
 *   · `AdminVibeBuildJobResponse.builder` was `"NIXPACKS" | "DOCKERFILE"`; the
 *     contract is NULLABLE, because the build strategy is reported with the
 *     job's terminal outcome. `vibe-build-job claim` returns a RUNNING row, so
 *     the CLI declared a string on the one response that is reliably null.
 *   · `AdminVibeDeploymentResponse` had no `versionNumber` — the user-facing
 *     `v{n}`. The contract's own comment says an admin sees both it and the
 *     internal blue/green `color`; the admin CLI could show only the slot.
 *
 * Neither broke a command, which is the point. An unmodelled key is not printed
 * and a wrongly-non-null one renders as `null`, so both read as "the server did
 * not send it" rather than as a stale copy.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 *
 * Every assertion is a `const` whose declared type is `true` when the shapes
 * agree and a descriptive TUPLE when they do not, so `pnpm typecheck` prints
 * the offending field names rather than `'false' is not assignable to 'true'`.
 * There is no runtime behaviour here; the module exists to be compiled.
 *
 * The comparison target is `TApi[…]["Response"]` — the ENDPOINT contract, not
 * the entity schema behind it. A response is what the CLI actually receives, so
 * a field that exists on an entity but never leaves the server cannot produce a
 * false failure.
 *
 * The operators are deliberately NOT shared with `vibe-wire-types.conformance`.
 * That file is not importable without dragging its own fifty shapes into this
 * compilation, and a `Mirrors` that two gates share is a `Mirrors` that neither
 * can change. They are twelve lines; the duplication is cheaper than the
 * coupling, and each file's copy is checked by its own assertions.
 *
 * ── Why this file cannot reach the published binary ─────────────────────────
 *
 * `src/index.ts` cannot reach this module, so tsup's bundle graph never visits
 * it and the `@nexus/types` import below stays out of `dist/`.
 * `wire-types-bundle.test.ts` holds that as an assertion over EVERY module the
 * binary can reach, so it covers this file too without being told about it.
 */
import type { TApi } from "@nexus/types";

import type { AdminVibeBuildJobResponse, AdminVibeDeploymentResponse } from "./admin-wire-types";
import { AGREES, type Mirrors, type Wire } from "./wire-conformance.types";

/** The response body of an admin endpoint, unwrapped from its envelope. */
type Data<Domain extends keyof TApi, Op extends keyof TApi[Domain]> = Wire<
  TApi[Domain][Op] extends { Response: infer R } ? (R extends { data: infer D } ? D : R) : never
>;

// ============================================================
// Build jobs
//
// `Claim` is the operation compared on purpose: it is the transition that
// produces the RUNNING row whose `builder` is null, so it is the response that
// would have caught the drift this gate was written for.
// ============================================================

type WireBuildJob = Data<"AdminVibeBuildJob", "Claim">;
const _buildJob: Mirrors<"AdminVibeBuildJobResponse", AdminVibeBuildJobResponse, WireBuildJob> =
  AGREES;

// ============================================================
// Deployments
// ============================================================

type WireDeployment = Data<"AdminVibeDeployment", "MarkHealthy">;
const _deployment: Mirrors<
  "AdminVibeDeploymentResponse",
  AdminVibeDeploymentResponse,
  WireDeployment
> = AGREES;
// The module exists to be compiled. Exporting the bindings keeps `noUnusedLocals`
// from deleting the gate by complaining about it.
export { _buildJob, _deployment };
