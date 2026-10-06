/**
 * The WIRE SHAPES of a Vibe app's environment — its plaintext variables and the
 * access cards imported into it — as `nexus apps env …` reads them.
 *
 * Re-declared for the reason `vibe-wire-types.ts` gives: the CLI ships
 * standalone and `@nexus/types` is not a runtime dependency. Its own module
 * because the environment is one cohesive surface and `vibe-wire-types.ts` sits
 * on the shrink-only size ledger; that file re-exports every name, so
 * `vibe-wire-types.conformance.ts` still holds each one to the contract.
 *
 * A field the contract reads leniently is typed `Listed | VibeUnlistedValue`:
 * a value a newer backend added arrives as the server's word, and every reader
 * asks the listed guard before indexing by it.
 */

import type { VibeUnlistedValue } from "./vibe-deploy-state-vocabulary";

// Env vars — mirror packages/types/src/api/domains/vibe/schemas/
// env-vars.schemas.ts. Scope + name shape are validated locally before
// the HTTP call so a typo surfaces without a round-trip; the backend's
// Zod boundary re-validates either way.
export const VIBE_ENV_VAR_SCOPES = ["ALL", "PROD", "STAGING"] as const;
export type VibeEnvVarScope = (typeof VIBE_ENV_VAR_SCOPES)[number];

export function isVibeEnvVarScope(v: string): v is VibeEnvVarScope {
  return (VIBE_ENV_VAR_SCOPES as readonly string[]).includes(v);
}

export interface VibeAppEnvVarDto {
  id: string;
  vibeAppId: string;
  organizationId: string;
  name: string;
  value: string;
  scope: VibeEnvVarScope | VibeUnlistedValue;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Card bindings — mirror packages/types/src/api/domains/vibe/schemas/
// card-bindings.schemas.ts.

/**
 * How an imported access card is DELIVERED into the app's environment.
 * Mirrors the Prisma enum `VibeCardProjection`.
 *
 * Only `HANDLE` is selectable on the write path: the app reads an address and
 * the credential never enters its process. The other three name delivery paths
 * that do put material at or near the app, and each ships behind its own
 * enforcement — they are carried here so a row written by a newer backend
 * renders as a known name rather than an unrecognised string.
 */
export type VibeCardProjection = "HANDLE" | "SENTINEL" | "AMBIENT" | "LEASED_TOKEN";

/**
 * Whether the app may use the card RIGHT NOW.
 *
 * DERIVED server-side from the grant's status and the card's own lifecycle
 * columns, never stored, so this CLI does not re-derive "revoked" from a
 * timestamp and reach a different answer than the deployer does.
 *
 * Only `ACTIVE` projects. Every other value means the next deployment refuses
 * this entry and names it — which is why the status is a column and not a
 * detail behind `--json`.
 */
export type VibeCardBindingStatus =
  | "ACTIVE"
  | "PENDING_APPROVAL"
  | "PAUSED"
  | "REVOKED"
  | "EXPIRED";

/**
 * One access card imported into one app's environment under one NAME.
 *
 * READ-ONLY over this transport, by the route's shape rather than by a check:
 * importing a card delegates a human's credential authority, so the create /
 * update / delete routes accept no API key at all — and an API key is the only
 * credential this CLI holds. Cards are imported from the console; the CLI shows
 * what was imported, which is what a deployment will actually see.
 */
export interface VibeAppCardBindingDto {
  id: string;
  vibeAppId: string;
  organizationId: string;
  /** The environment variable name the app reads. Same grammar as a literal. */
  name: string;
  scope: VibeEnvVarScope | VibeUnlistedValue;
  /**
   * `nxc_<grantId>` — the value the app reads out of its environment.
   *
   * An ADDRESS, not a bearer: presenting it proves nothing, because the broker
   * re-authorizes the calling app's own identity on every call. Printing it in
   * full is therefore safe, and is the point — it is exactly what the app sees.
   */
  handle: string;
  projection: VibeCardProjection | VibeUnlistedValue;
  status: VibeCardBindingStatus | VibeUnlistedValue;
  accessCardId: string;
  /** The card's name, as its owner wrote it. */
  accessCardName: string;
  /** The credential the card attenuates, so the reader knows whose authority this is. */
  credentialName: string;
  /** How many actions the card permits. A COUNT — never the policy itself. */
  allowedActionCount: number;
  /** The owner's daily tolerance and what is left of it. `null` = uncapped. */
  quotaPerDay: number | null;
  quotaRemaining: number | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListEnvVarsResponse {
  envVars: VibeAppEnvVarDto[];
  /**
   * Access cards imported into this app's environment.
   *
   * ABSENT — not empty — on a backend that predates card brokering, which is
   * why it is optional: this CLI ships standalone to npm and is routinely
   * pointed at a backend older than itself. Absent means "this server has
   * nothing to say about cards"; `[]` means "it does, and this app has none".
   * Rendering both as an empty section would assert the second when only the
   * first is true.
   */
  cardBindings?: VibeAppCardBindingDto[];
}

export interface UpsertEnvVarResponse {
  envVar: VibeAppEnvVarDto;
}

export interface DeleteEnvVarResponse {
  deletedId: string;
}
