import { reportFailure } from "../../errors";
import type { LoginIdentity } from "./login.identity";

/**
 * Org-scoped key: validate via a cheap authenticated probe.
 *
 * `null` means the run is over and the caller must return immediately: the exit
 * code is already set, exactly as the inline `return` this replaces did.
 *
 * The validation fetch is deliberately NOT wrapped: a network failure there
 * propagates to the action's own catch, which is where it was reported from
 * before this move.
 */
export async function resolveOrgScopedIdentity(
  resolvedBaseUrl: string,
  apiKey: string
): Promise<LoginIdentity | null> {
  console.log("Validating...");
  const validateRes = await fetch(`${resolvedBaseUrl}/api/public/v1/agents?limit=1`, {
    headers: { "api-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });

  if (!validateRes.ok) {
    process.exitCode = reportFailure(
      "remote-error",
      `Validation failed (HTTP ${validateRes.status}). Check your key and try again.`
    );
    return null;
  }

  let orgName: string | undefined;
  let orgId: string | undefined;
  let userEmail: string | undefined;

  try {
    const meRes = await fetch(`${resolvedBaseUrl}/api/public/v1/me`, {
      headers: { "api-key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000)
    });
    if (meRes.ok) {
      const meJson = (await meRes.json()) as {
        success?: boolean;
        data?: { orgId?: string; orgName?: string; userEmail?: string };
      };
      if (meJson.data) {
        orgName = meJson.data.orgName ?? undefined;
        orgId = meJson.data.orgId ?? undefined;
        userEmail = meJson.data.userEmail ?? undefined;
      }
    }
  } catch {
    // /me may be unreachable on older backends — continue without org info
  }

  return { orgName, orgId, userEmail };
}
