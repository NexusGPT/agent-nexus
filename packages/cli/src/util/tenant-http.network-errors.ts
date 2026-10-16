import { NexusConnectionError, NexusTimeoutError } from "@agent-nexus/sdk";

/**
 * What a failed `fetch` means, for every verb in this transport.
 *
 * One copy, because the three verbs differ in what they do with the RESULT and
 * not in what a dead socket means. An abort reaching here is always the
 * transport's own deadline: a caller-supplied signal is checked BEFORE this is
 * reached (`tenantStream`), so a Ctrl-C never renders as a timeout.
 */
export function toTenantNetworkError(err: unknown, timeoutMs: number): Error {
  if (err instanceof DOMException && err.name === "AbortError") {
    return new NexusTimeoutError(timeoutMs);
  }
  return new NexusConnectionError(
    err instanceof Error ? err.message : "Network request failed",
    err instanceof Error ? err : undefined
  );
}
