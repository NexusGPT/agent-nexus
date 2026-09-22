import { timeoutSecondsToMs } from "../../client";
import { AUTH_REQUEST_DEFAULT_TIMEOUT_MS } from "./_shared/auth-request-timeout";

/**
 * Resolve the owning user's email — and the org's NAME — for the chosen
 * org (best-effort).
 *
 * The name matters most in the case it was previously never filled:
 * a platform-operator key targeting a FOREIGN org has no membership row
 * to read a name from, so `auth status` and `auth orgs` would show a
 * bare `org_...` id for the one tenant this credential exists to reach.
 * This request is already being made and already carries the selected
 * org, so the name comes back for free — it was simply not being read.
 *
 * Every failure answers `undefined` for both fields, so an unreachable or
 * older backend leaves the caller's own values standing rather than clearing
 * them.
 *
 * `timeoutSeconds` is the global `--timeout`, in SECONDS.
 */
export async function fetchOrgIdentity(
  resolvedBaseUrl: string,
  apiKey: string,
  orgId: string,
  timeoutSeconds?: number
): Promise<{ userEmail: string | undefined; orgName: string | undefined }> {
  try {
    const meRes = await fetch(`${resolvedBaseUrl}/api/public/v1/me`, {
      headers: {
        "api-key": apiKey,
        "organization-id": orgId,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(
        timeoutSecondsToMs(timeoutSeconds) ?? AUTH_REQUEST_DEFAULT_TIMEOUT_MS
      )
    });
    if (meRes.ok) {
      const meJson = (await meRes.json()) as {
        data?: { userEmail?: string; orgName?: string };
      };
      return {
        userEmail: meJson.data?.userEmail ?? undefined,
        orgName: meJson.data?.orgName ?? undefined
      };
    }
  } catch {
    // best-effort
  }
  return { userEmail: undefined, orgName: undefined };
}
