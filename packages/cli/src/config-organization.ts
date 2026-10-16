import type { NexusProfile } from "./config-types";

// ---------------------------------------------------------------------------
// Organization resolution
// ---------------------------------------------------------------------------

/** How the organization the next request acts on was determined. */
export type OrganizationSource =
  | "env" // NEXUS_ORGANIZATION_ID — per-shell, does not touch config
  | "profile" // the resolved profile's stored orgId
  | "token"; // no selection: the key's own org decides, server-side

/** The organization a command will act on, and what selected it. */
export interface ResolvedOrganization {
  organizationId?: string;
  source: OrganizationSource;
}

/**
 * Resolve the organization the `organization-id` header will name.
 *
 * ONE definition of this precedence, read by the client that sends the header
 * AND by `auth status`, which reports it. They were separate: the client sent
 * `NEXUS_ORGANIZATION_ID || profile.orgId` while status printed `profile.orgId`
 * unconditionally, so a shell that had set the env var was told it was acting on
 * the profile's organization and acting on another one — the one surface whose
 * whole job is answering "which org am I in" was the one that lied (NEX-2525).
 *
 * The env var is deliberately on top: it is the per-shell org selector, the
 * counterpart of `NEXUS_PROFILE`, and the only way to hold two organizations
 * concurrently under a single cross-org token whose `orgId` lives in one shared
 * config file.
 *
 * 🔴 THIS FILE IS THE ORG CANON, AND `organization-precedence-is-one-rule.
 * test.ts` NAMES IT BY PATH. That gate reads this function off disk, derives its
 * selector order from the body's own lines, and censuses every file in
 * `packages/{cli,mcp-server}/src` that reads `NEXUS_ORGANIZATION_ID` against a
 * hand-written set of two paths — this one and the bridge's. A second reader
 * anywhere is a fourth copy of the precedence as far as that census is
 * concerned, and it reds.
 */
export function resolveOrganization(profile: NexusProfile): ResolvedOrganization {
  const fromEnv = process.env.NEXUS_ORGANIZATION_ID;
  if (fromEnv) return { organizationId: fromEnv, source: "env" };
  if (profile.orgId) return { organizationId: profile.orgId, source: "profile" };
  return { source: "token" };
}
