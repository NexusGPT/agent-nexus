import { saveProfile } from "../../config";
import { printSuccess } from "../../output";

/**
 * Step 6 — persist the profile, then report it.
 *
 * 🔴 EVERY FIELD IS SPREAD CONDITIONALLY ON PURPOSE. A bare `orgName` would
 * write an `undefined` key into config.json where the absent field used to be
 * simply missing, so collapsing these changes what lands on disk.
 */
export function saveLoginProfile(input: {
  profileName: string;
  apiKey: string;
  baseUrl: string | undefined;
  dashboardUrl: string | undefined;
  orgName: string | undefined;
  orgId: string | undefined;
  userEmail: string | undefined;
  isPersonalToken: boolean;
  isPlatformOperatorKey: boolean;
}): void {
  const {
    profileName,
    apiKey,
    baseUrl,
    dashboardUrl,
    orgName,
    orgId,
    userEmail,
    isPersonalToken,
    isPlatformOperatorKey
  } = input;

  saveProfile(profileName, {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(dashboardUrl ? { dashboardUrl } : {}),
    ...(orgName ? { orgName } : {}),
    ...(orgId ? { orgId } : {}),
    ...(userEmail ? { userEmail } : {}),
    ...(isPersonalToken ? { personalToken: true } : {})
  });

  printSuccess(`Saved profile "${profileName}".`, {
    ...(orgName ? { organization: orgName } : {}),
    ...(isPersonalToken
      ? {
          type: isPlatformOperatorKey
            ? "platform-operator key (any org, audited)"
            : "personal token (cross-org)"
        }
      : {}),
    profile: profileName,
    config: "~/.nexus-mcp/config.json"
  });
}
