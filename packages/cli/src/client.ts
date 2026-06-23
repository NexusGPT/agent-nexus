import { NexusClient } from "@agent-nexus/sdk";

import { resolveBaseUrl, type ResolvedProfile, resolveProfile } from "./config";

// ---------------------------------------------------------------------------
// Last-resolved profile — read by the context banner
// ---------------------------------------------------------------------------

let _lastResolved: ResolvedProfile | null = null;

/** Returns the profile that was resolved on the most recent `createClient` call. */
export function getLastResolvedProfile(): ResolvedProfile | null {
  return _lastResolved;
}

/**
 * Create a NexusClient from resolved config.
 * Accepts optional overrides from global --api-key / --base-url / --profile flags.
 */
export function createClient(opts?: {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
  timeout?: number;
}): NexusClient {
  const resolved = resolveProfile(opts);
  _lastResolved = resolved;

  // Personal (cross-org) tokens act on the profile's selected org via the
  // organization-id header. An explicit NEXUS_ORGANIZATION_ID env wins (headless),
  // then the profile's orgId. Harmless for org-scoped keys (server ignores it for
  // keys that carry their own org). See NEX-2474.
  const organizationId = process.env.NEXUS_ORGANIZATION_ID || resolved.profile.orgId;

  return new NexusClient({
    apiKey: opts?.apiKey ?? resolved.profile.apiKey,
    baseUrl:
      opts?.baseUrl || process.env.NEXUS_BASE_URL || resolved.profile.baseUrl || resolveBaseUrl(),
    ...(organizationId ? { organizationId } : {}),
    timeout: opts?.timeout
  });
}
