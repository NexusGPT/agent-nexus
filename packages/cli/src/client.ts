import { NexusClient } from "@agent-nexus/sdk";
import { InvalidArgumentError } from "commander";

import { resolveBaseUrl, type ResolvedProfile, resolveProfile } from "./config";

/**
 * Parse the global `--timeout <seconds>` flag. Accepts any positive number of
 * seconds (fractions allowed); rejects everything else at parse time so a typo
 * fails fast instead of silently falling back to the default timeout.
 */
export function parseTimeoutSeconds(raw: string): number {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new InvalidArgumentError("--timeout must be a positive number of seconds.");
  }
  return seconds;
}

/**
 * Convert the global `--timeout` flag (seconds) to the milliseconds the HTTP
 * clients expect. Every command path that builds its own client (SDK client,
 * raw `nexus api` HttpClient, vibe tenant transport) converts through here so
 * the flag means the same thing everywhere.
 */
export function timeoutSecondsToMs(seconds: number | undefined): number | undefined {
  return seconds !== undefined ? seconds * 1000 : undefined;
}

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
  /** Timeout in SECONDS (the unit of the global `--timeout` flag), not ms. */
  timeout?: number;
}): NexusClient {
  const resolved = resolveProfile(opts);
  _lastResolved = resolved;

  // Personal (cross-org) tokens act on the profile's selected org via the
  // organization-id header. An explicit NEXUS_ORGANIZATION_ID env wins (headless),
  // then the profile's orgId. See NEX-2474.
  //
  // For an ORG-SCOPED key this header is accepted only while it names that key's
  // own org — which is the ordinary case, since `auth login` stores orgId from the
  // key itself. Naming a different org is refused by the server with
  // ORG_SCOPED_KEY_ORG_MISMATCH rather than answered from the key's own org, so
  // setting NEXUS_ORGANIZATION_ID to another tenant fails loudly instead of
  // returning the wrong tenant's rows (NEX-3175).
  const organizationId = process.env.NEXUS_ORGANIZATION_ID || resolved.profile.orgId;

  return new NexusClient({
    apiKey: opts?.apiKey ?? resolved.profile.apiKey,
    baseUrl:
      opts?.baseUrl || process.env.NEXUS_BASE_URL || resolved.profile.baseUrl || resolveBaseUrl(),
    ...(organizationId ? { organizationId } : {}),
    timeout: timeoutSecondsToMs(opts?.timeout)
  });
}
