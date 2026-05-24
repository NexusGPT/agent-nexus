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

  return new NexusClient({
    apiKey: opts?.apiKey ?? resolved.profile.apiKey,
    baseUrl:
      opts?.baseUrl || process.env.NEXUS_BASE_URL || resolved.profile.baseUrl || resolveBaseUrl(),
    timeout: opts?.timeout
  });
}
