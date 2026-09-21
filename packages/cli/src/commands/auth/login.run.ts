import { color } from "../../output";
import type { Prompter } from "./login.prompter";
import { resolveCrossOrgIdentity } from "./login.resolve-cross-org";
import { resolveApiKey } from "./login.resolve-key";
import { resolveOrgScopedIdentity } from "./login.resolve-org-scoped";
import { resolveProfileName } from "./login.resolve-profile-name";
import { saveLoginProfile } from "./login.save";
import { printLoginTips } from "./login.tips";

/**
 * The whole of `nexus auth login` after the prompter exists.
 *
 * Each step answers `null` when it has already set an exit code (or printed
 * "Aborted.") and the run must stop — which is what the early `return`s inside
 * the single long function this was extracted from did.
 */
export async function runLogin(input: {
  ask: Prompter["ask"];
  effective: { apiKey?: string; profile?: string; env?: string };
  baseUrl: string | undefined;
  dashboardUrl: string | undefined;
  resolvedBaseUrl: string;
}): Promise<void> {
  const { ask, effective, baseUrl, dashboardUrl, resolvedBaseUrl } = input;

  const key = await resolveApiKey(ask, effective.apiKey);
  if (!key) return;
  const { apiKey, isPersonalToken, isPlatformOperatorKey } = key;

  const identity = isPersonalToken
    ? await resolveCrossOrgIdentity({ ask, resolvedBaseUrl, apiKey, isPlatformOperatorKey })
    : await resolveOrgScopedIdentity(resolvedBaseUrl, apiKey);
  if (!identity) return;
  const { orgName, orgId, userEmail } = identity;

  if (orgName) {
    console.log(`Organization: ${color.cyan(orgName)}`);
  }
  if (userEmail) {
    console.log(`User: ${color.cyan(userEmail)}`);
  }

  const profileName = await resolveProfileName({ ask, provided: effective.profile, orgName });
  if (profileName === null) return;

  saveLoginProfile({
    profileName,
    apiKey,
    baseUrl,
    dashboardUrl,
    orgName,
    orgId,
    userEmail,
    isPersonalToken,
    isPlatformOperatorKey
  });

  printLoginTips(profileName, isPersonalToken);
}
