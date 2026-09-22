import { timeoutSecondsToMs } from "../../../client";
import { AUTH_REQUEST_DEFAULT_TIMEOUT_MS } from "./auth-request-timeout";

export interface UserOrganization {
  organizationId: string;
  name: string | null;
  role: string;
}

/**
 * Fetch the organizations a token can act on (GET /me/organizations).
 *
 * `timeoutSeconds` is the global `--timeout`, in SECONDS; unset leaves
 * {@link AUTH_REQUEST_DEFAULT_TIMEOUT_MS} in force. Reached by `auth login`,
 * `auth orgs` and `auth use-org` alike, so the three share one budget.
 */
export async function fetchOrganizations(
  baseUrl: string,
  apiKey: string,
  timeoutSeconds?: number
): Promise<UserOrganization[]> {
  const res = await fetch(`${baseUrl}/api/public/v1/me/organizations`, {
    headers: { "api-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(
      timeoutSecondsToMs(timeoutSeconds) ?? AUTH_REQUEST_DEFAULT_TIMEOUT_MS
    )
  });
  if (!res.ok) {
    throw new Error(`Could not list organizations (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as { data?: UserOrganization[] };
  return json.data ?? [];
}
