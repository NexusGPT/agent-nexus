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
 */
export async function fetchOrgIdentity(
  resolvedBaseUrl: string,
  apiKey: string,
  orgId: string
): Promise<{ userEmail: string | undefined; orgName: string | undefined }> {
  try {
    const meRes = await fetch(`${resolvedBaseUrl}/api/public/v1/me`, {
      headers: {
        "api-key": apiKey,
        "organization-id": orgId,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(30_000)
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
