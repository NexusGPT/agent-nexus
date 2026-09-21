/** Prefix that marks a personal (cross-org) token. See NEX-2474. */
export const PERSONAL_TOKEN_PREFIX = "nxs_p_";
/**
 * Platform-operator token (NEX-3037) — cross-org like a personal token, but its
 * reach is not limited to the user's own memberships. From the CLI's point of
 * view the two behave identically: both are org-unbound, both select the acting
 * org with the `organization-id` header, so both must be accepted everywhere a
 * personal token is.
 */
export const PLATFORM_OPERATOR_TOKEN_PREFIX = "nxs_o_";

/** True for any key whose acting org comes from the header rather than the key. */
export function isCrossOrgToken(apiKey: string): boolean {
  return (
    apiKey.startsWith(PERSONAL_TOKEN_PREFIX) || apiKey.startsWith(PLATFORM_OPERATOR_TOKEN_PREFIX)
  );
}
