import { reportFailure } from "../../errors";
import { fetchOrganizations, type UserOrganization } from "./_shared/fetch-organizations";
import { fetchOrgIdentity } from "./login.fetch-org-identity";
import type { LoginIdentity } from "./login.identity";
import { promptPlatformOperatorOrg } from "./login.platform-operator-org";
import type { Prompter } from "./login.prompter";
import { selectOrganization } from "./login.select-organization";

/**
 * Personal (cross-org) token: validate by listing orgs, pick one.
 *
 * `null` means the run is over and the caller must return immediately: the exit
 * code is already set, exactly as the inline `return` this replaces did.
 */
export async function resolveCrossOrgIdentity(input: {
  ask: Prompter["ask"];
  resolvedBaseUrl: string;
  apiKey: string;
  isPlatformOperatorKey: boolean;
}): Promise<LoginIdentity | null> {
  const { ask, resolvedBaseUrl, apiKey, isPlatformOperatorKey } = input;

  console.log(
    isPlatformOperatorKey ? "Validating platform-operator key..." : "Validating personal token..."
  );
  let organizations: UserOrganization[];
  try {
    organizations = await fetchOrganizations(resolvedBaseUrl, apiKey);
  } catch (err) {
    process.exitCode = reportFailure("connection-failed", (err as Error).message);
    return null;
  }

  let orgName: string | undefined;
  let orgId: string | undefined;

  // A platform-operator key acts on ANY org (NEX-3037), so the membership
  // list is a convenience here, not the set of valid answers. Prompt for
  // an org id whether or not memberships exist — gating this on an EMPTY
  // list would have covered only the holder with no orgs at all, and left
  // the motivating case (an operator who does have memberships, wanting a
  // DIFFERENT org) able to pick only from their own.
  if (isPlatformOperatorKey) {
    const chosen = await promptPlatformOperatorOrg(ask, organizations);
    if (!chosen) return null;
    orgId = chosen.orgId;
    orgName = chosen.orgName;
  }

  // Personal tokens genuinely cannot act without a membership; the
  // platform-operator case already has its org from the block above.
  if (organizations.length === 0 && !isPlatformOperatorKey) {
    process.exitCode = reportFailure(
      "not-found",
      "This token's user does not belong to any organization."
    );
    return null;
  }

  // Skipped when the platform-operator branch above already took an org
  // id by hand — `organizations` is empty there, so every index into it
  // below would be undefined.
  if (!orgId) {
    const chosen = await selectOrganization(ask, organizations);
    if (!chosen) return null;
    orgId = chosen.orgId;
    orgName = chosen.orgName;
  }

  const me = await fetchOrgIdentity(resolvedBaseUrl, apiKey, orgId);
  // Never overwrite a name already resolved from the membership list.
  return { orgName: orgName ?? me.orgName, orgId, userEmail: me.userEmail };
}
