export interface UserOrganization {
  organizationId: string;
  name: string | null;
  role: string;
}

/** Fetch the organizations a token can act on (GET /me/organizations). */
export async function fetchOrganizations(
  baseUrl: string,
  apiKey: string
): Promise<UserOrganization[]> {
  const res = await fetch(`${baseUrl}/api/public/v1/me/organizations`, {
    headers: { "api-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) {
    throw new Error(`Could not list organizations (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as { data?: UserOrganization[] };
  return json.data ?? [];
}
