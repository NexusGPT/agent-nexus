import { NexusClient } from "@agent-nexus/sdk";
import { V1_RESPONSE_CONTRACT } from "@agent-nexus/sdk/v1-response-contract";

import { reportRetryOnStderr } from "./client-retry-notice";
import {
  resolveBaseUrl,
  type ResolvedProfile,
  resolveOrganization,
  resolveProfile
} from "./config";
import { createContractReporter } from "./contract-warnings";
import { createApiDeprecationReporter } from "./route-deprecation-warnings";
import { type Seconds, timeoutSecondsToMs } from "./timeout-seconds";

/**
 * THE SDK CLIENT EVERY TYPED COMMAND BUILDS, AND THE PROFILE IT RESOLVED.
 *
 * Roughly five hundred files import `./client`, so this specifier is fixed. The
 * timeout UNIT algebra it used to carry is now `timeout-seconds.ts`, the
 * `--timeout` parser is `timeout-flag.ts`, and the retry notice is
 * `client-retry-notice.ts`; all three are re-exported below so no caller moves.
 */

export { reportRetryOnStderr } from "./client-retry-notice";
export { parseTimeoutSeconds } from "./timeout-flag";
export {
  MAX_TIMEOUT_MS,
  MAX_TIMEOUT_SECONDS,
  type Seconds,
  seconds,
  secondsToMs,
  timeoutSecondsToMs
} from "./timeout-seconds";

// ---------------------------------------------------------------------------
// Last-resolved profile — read by the context banner
// ---------------------------------------------------------------------------

let _lastResolved: ResolvedProfile | null = null;

/** Returns the profile that was resolved on the most recent `createClient` call. */
export function getLastResolvedProfile(): ResolvedProfile | null {
  return _lastResolved;
}

/** The global flags and caller pins {@link createClient} accepts. */
export interface CreateClientOptions {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
  /**
   * Timeout in SECONDS — the unit of the global `--timeout` flag this is
   * usually spread from. Typed as `Seconds` so a millisecond value cannot be
   * passed here at all; mint one with `seconds(...)`.
   */
  timeout?: Seconds;
  /**
   * The organization this client acts on, PINNED by the caller rather than
   * resolved from the environment and the profile.
   *
   * Only a caller that recorded the org at an earlier moment passes this: a
   * direct-engine mount's credential refresh acts on the organization the
   * mount was made for, so `auth use-org` or an exported
   * `NEXUS_ORGANIZATION_ID` after mounting cannot re-point a live drive at
   * another tenant. Every other caller leaves it unset and gets the shared
   * precedence below.
   */
  organizationId?: string;
  /**
   * How many times the SDK may replay a retryable failure. Unset means the
   * SDK's own default; `0` disables retrying, which a caller running under an
   * external deadline (rclone's credential_process kills the helper at 60 s)
   * needs so its own bounded retry is the only one.
   */
  maxRetries?: number;
}

/**
 * Create a NexusClient from resolved config.
 * Accepts optional overrides from global --api-key / --base-url / --profile flags.
 */
export function createClient(opts?: CreateClientOptions): NexusClient {
  const resolved = resolveProfile(opts);
  _lastResolved = resolved;

  // Personal (cross-org) tokens act on the profile's selected org via the
  // organization-id header. An explicit NEXUS_ORGANIZATION_ID env wins (headless),
  // then the profile's orgId. See NEX-2474. The precedence itself lives in
  // `resolveOrganization` so `auth status` reports the org this header will
  // actually carry rather than a second opinion about it (NEX-2525).
  //
  // For an ORG-SCOPED key this header is accepted only while it names that key's
  // own org — which is the ordinary case, since `auth login` stores orgId from the
  // key itself. Naming a different org is refused by the server with
  // ORG_SCOPED_KEY_ORG_MISMATCH rather than answered from the key's own org, so
  // setting NEXUS_ORGANIZATION_ID to another tenant fails loudly instead of
  // returning the wrong tenant's rows (NEX-3175).
  //
  // A caller-pinned `organizationId` bypasses that chain entirely: the org was
  // decided when the caller recorded it, and re-resolving it now is how a
  // refresh for one tenant's mount would be served from another.
  const organizationId =
    opts?.organizationId ?? resolveOrganization(resolved.profile).organizationId;

  return new NexusClient({
    apiKey: opts?.apiKey ?? resolved.profile.apiKey,
    // ONE definition — see `resolveBaseUrl`. A hand-rolled chain here inverted its 2nd and 3rd terms.
    baseUrl: resolveBaseUrl(opts?.baseUrl, opts?.profile),
    ...(organizationId ? { organizationId } : {}),
    timeout: timeoutSecondsToMs(opts?.timeout),
    maxRetries: opts?.maxRetries,
    // Both of these write to stderr and neither writes to stdout, so a `--json`
    // document stays a single parseable value with either or both firing.
    onRetry: reportRetryOnStderr,
    // Warn on stderr when the server answers with a shape the API does not
    // publish. `undefined` when the user switched it off, which also switches
    // off the work behind it. See `./contract-warnings.ts`.
    onResponseContract: createContractReporter(),
    // Warn on stderr when a response says its own route is being removed.
    // Separate switch from the contract warnings on purpose — see
    // `./route-deprecation-warnings.ts`, which is also where the reason it is
    // not `./deprecation-notice.ts` is written down.
    onDeprecation: createApiDeprecationReporter(),
    // The manifest is no longer compiled into the SDK's main entry — a browser
    // consumer embedding the client for chat was shipping the shape of every v1
    // route to run a check it never installed. The CLI is the consumer that DOES
    // want it, so the CLI is what imports it; `tsup` bundles it into `dist/`
    // here exactly as it did when it arrived for free.
    responseContract: V1_RESPONSE_CONTRACT
  });
}
