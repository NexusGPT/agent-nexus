/**
 * The AWS regions a Vibe tenant cluster may be provisioned into.
 *
 * Deliberately re-declared rather than imported from `@nexus/types`, which owns
 * the canonical list (`shared/domain/vibe/allowed-regions.ts`). Not because a
 * workspace package is out of reach — `@agent-nexus/sdk` is one and is bundled
 * in — but because `@nexus/types` would drag zod and the generated Prisma enums
 * into a CLI whose only runtime dependency is `commander`. The backend's Zod
 * boundary rejects a bad region regardless: this copy exists to fail before the
 * HTTP call and to name the choices in `--help`, not to enforce the policy.
 *
 * Both CLI surfaces that provision a cluster read it from here (the operator's
 * `admin vibe-tenant-cluster provision` and an org's own `vibe cluster
 * provision`), so the two can never offer different regions — a region is
 * immutable once a cluster is minted, so a list that drifted between them would
 * let one surface create a cluster the other cannot express.
 *
 * EU only, for RGPD data residency. London (`eu-west-2`) is intentionally
 * absent — post-Brexit the UK is outside the EU, so it does not satisfy
 * EU-residency even though AWS labels it `eu-*`. Milan (`eu-south-1`) and Spain
 * (`eu-south-2`) satisfy residency and are absent for the other reason: they
 * are AWS opt-in regions, not enabled on the account, so a tenant provisioned
 * into either hard-fails at provision time.
 *
 * A COPY, BUT NOT A FREE ONE. `packages/types/src/shared/domain/vibe/allowed-regions.test.ts`
 * reads this declaration from source and asserts it equals the canonical list,
 * so the two cannot drift. Edit it there first; this file follows. That gate
 * lives in `@nexus/types` rather than here because `packages/cli` is not one of
 * the packages CI runs vitest for — a spec added here would execute in zero
 * jobs while the PR read green.
 */
export const VIBE_ALLOWED_REGIONS = [
  "eu-west-1", // Ireland
  "eu-west-3", // Paris
  "eu-central-1", // Frankfurt
  "eu-north-1" // Stockholm
] as const;

export type VibeAllowedRegion = (typeof VIBE_ALLOWED_REGIONS)[number];

export function isVibeAllowedRegion(value: string): value is VibeAllowedRegion {
  return (VIBE_ALLOWED_REGIONS as readonly string[]).includes(value);
}

/**
 * Tenant-cluster lifecycle states — mirrors `$Enums.VibeTenantClusterStatus`.
 * The CLI never validates these locally (they only ever arrive from the server),
 * so a plain type union is enough — no runtime array.
 */
export type VibeTenantClusterStatus =
  | "PROVISIONING"
  | "HEALTHY"
  | "UPDATING"
  | "DEGRADED"
  | "DISABLING"
  | "DISABLED_RETAINED"
  | "DESTROYING"
  | "DESTROYED";
