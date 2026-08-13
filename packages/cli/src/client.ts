import { NexusClient } from "@agent-nexus/sdk";
import { InvalidArgumentError } from "commander";

import { resolveBaseUrl, type ResolvedProfile, resolveProfile } from "./config";

/**
 * A number that has been STATED to be in seconds.
 *
 * `createClient`'s timeout is seconds and every transport under it is
 * milliseconds. Both are `number`, so nothing stopped a constant named
 * `PROMPT_ASSISTANT_TIMEOUT_MS` crossing that boundary — it was multiplied by
 * 1000 a second time, overflowed Node's 32-bit timer, and aborted every
 * request instantly (NEX-3707). The docblock saying SECONDS was already there
 * and was already right; a docblock is not a check.
 *
 * The brand makes the unit part of the TYPE, so a plain millisecond number can
 * no longer be passed where seconds are expected. It fires in the editor,
 * which matters more than a CI gate here: the branch that reproduced this
 * defect four times over is months behind staging and its author will meet the
 * error at the line rather than after a push.
 *
 * A brand cannot be constructed by accident — `seconds()` is the only way in,
 * and calling it is the moment somebody states the unit out loud.
 */
export type Seconds = number & { readonly __brand: unique symbol };

/**
 * State that a number is in seconds.
 *
 * Deliberately unvalidated beyond finiteness: `timeoutSecondsToMs` owns the
 * range refusal, and duplicating it here would put two ceilings in the code
 * that could disagree.
 */
export function seconds(value: number): Seconds {
  return value as Seconds;
}

/**
 * The largest delay Node's timers accept: 2^31 - 1 ms, about 24.8 days.
 *
 * Every timeout this CLI builds ends in `setTimeout(() => controller.abort(),
 * ms)` — in the SDK's `HttpClient` and in the vibe tenant transport. Node
 * CLAMPS a delay above this ceiling **to 1 ms**, warning only with a
 * `TimeoutOverflowWarning` on stderr. So an overlong timer does not wait
 * longer than intended; it aborts the request immediately, before it leaves
 * the machine, and reports itself as a timeout after the number of seconds it
 * never waited.
 */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/** The same ceiling in the unit `--timeout` speaks. */
export const MAX_TIMEOUT_SECONDS = Math.floor(MAX_TIMEOUT_MS / 1000);

/**
 * Parse the global `--timeout <seconds>` flag. Accepts any positive number of
 * seconds (fractions allowed); rejects everything else at parse time so a typo
 * fails fast instead of silently falling back to the default timeout.
 */
export function parseTimeoutSeconds(raw: string): Seconds {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("--timeout must be a positive number of seconds.");
  }
  if (parsed > MAX_TIMEOUT_SECONDS) {
    throw new InvalidArgumentError(
      `--timeout must be at most ${MAX_TIMEOUT_SECONDS} seconds; a longer timer overflows ` +
        `Node's 32-bit delay and aborts the request immediately instead of waiting.`
    );
  }
  // Minted through the helper rather than cast, so `seconds()` stays the ONE
  // construction site for the brand. The local was called `seconds` and shadowed
  // it, which is what forced a second cast here.
  return seconds(parsed);
}

/**
 * Convert a timeout expressed in SECONDS to the milliseconds the HTTP clients
 * expect. Every command path that builds its own client (SDK client, raw
 * `nexus api` HttpClient, vibe tenant transport) converts through here, so the
 * global `--timeout <seconds>` flag and every command's own default mean the
 * same thing everywhere.
 *
 * This is the one place the unit changes, so it is where an out-of-range value
 * is REFUSED rather than left to Node's silent clamp-to-1ms. A value already in
 * milliseconds is the way this goes wrong: it is multiplied by 1000 a second
 * time, overflows, and every request aborts instantly (NEX-3707). Refusing is
 * louder than clamping — a clamp to 24.8 days is indistinguishable from working.
 */
export function timeoutSecondsToMs(seconds: number | undefined): number | undefined {
  if (seconds === undefined) return undefined;
  const ms = seconds * 1000;
  if (!Number.isFinite(ms) || ms > MAX_TIMEOUT_MS) {
    throw new RangeError(
      `Timeout of ${seconds}s is ${ms} ms, past the ${MAX_TIMEOUT_MS} ms ceiling Node's timers ` +
        `accept. Pass at most ${MAX_TIMEOUT_SECONDS} seconds. A value this large is usually ` +
        `milliseconds handed to a parameter that takes seconds.`
    );
  }
  return ms;
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
  /**
   * Timeout in SECONDS — the unit of the global `--timeout` flag this is
   * usually spread from. Typed as `Seconds` so a millisecond value cannot be
   * passed here at all; mint one with `seconds(...)`.
   */
  timeout?: Seconds;
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
