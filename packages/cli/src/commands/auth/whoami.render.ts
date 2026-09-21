import type { LiveIdentity } from "../../auth-probe";
import type { ResolvedProfile } from "../../config";
import { printSuccess } from "../../output";

/** The success document for `nexus auth whoami`. */
export function printWhoami(input: {
  resolved: ResolvedProfile;
  identity: LiveIdentity | undefined;
  baseUrl: string;
  keyHint: string;
}): void {
  const { resolved, identity, baseUrl, keyHint } = input;

  // Reaching here means the key was verified. When /me answered, its
  // identity is authoritative — show exactly that (don't fall back to a
  // just-cleared stale profile value). Only the 404 legacy path, where we
  // have no live identity, reads the locally stored profile.
  const orgName = identity ? identity.orgName : resolved.profile.orgName;
  const orgId = identity ? identity.orgId : resolved.profile.orgId;
  const userEmail = identity ? identity.userEmail : resolved.profile.userEmail;

  printSuccess("Authenticated.", {
    profile: resolved.name,
    ...(orgName ? { organization: orgName } : {}),
    ...(orgId ? { "org id": orgId } : {}),
    ...(userEmail ? { user: userEmail } : {}),
    ...(identity?.role ? { role: identity.role } : {}),
    api: baseUrl,
    key: keyHint
  });
}
