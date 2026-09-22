import type { Command } from "commander";

import {
  resolveBaseUrl,
  type ResolvedProfile,
  resolveProfile,
  setProfileOrganization
} from "../../config";
import { refuse, reportFailure } from "../../errors";
import { color, isJsonMode, printSuccess } from "../../output";
import { classifyUseOrgRefusal } from "./_shared/classify-use-org-refusal";
import { fetchOrganizations, type UserOrganization } from "./_shared/fetch-organizations";
import { PLATFORM_OPERATOR_TOKEN_PREFIX } from "./_shared/token-prefixes";

/**
 * `nexus auth use-org <orgId>` up to and including the membership listing: the
 * resolution, the two refusals that must be decided BEFORE any request is sent,
 * and the fetch itself.
 */
export async function runUseOrg(orgId: string, program: Command): Promise<void> {
  const globals = program.optsWithGlobals();
  let resolved;
  try {
    resolved = resolveProfile(globals);
  } catch {
    process.exitCode = reportFailure(
      "not-authenticated",
      "Not logged in.",
      "Run: nexus auth login"
    );
    return;
  }

  // The prefix is the authoritative signal for "org-scoped" (the stored flag
  // may be absent on a manually-added or older-config profile). Precedence
  // lives in classifyUseOrgRefusal, which documents why.
  const refusal = classifyUseOrgRefusal({
    apiKey: resolved.profile.apiKey,
    personalToken: resolved.profile.personalToken,
    source: resolved.source
  });

  if (refusal === "org-scoped-key") {
    process.exitCode = refuse(
      `Profile "${resolved.name}" uses an organization-scoped key, which is bound to a ` +
        "single organization and cannot switch. Create a personal token to act across orgs: " +
        "Settings → API Keys → Personal Tokens, then `nexus auth login`."
    );
    return;
  }

  if (refusal === "env-override") {
    process.exitCode = refuse(
      "Cannot set an active org for an --api-key / NEXUS_API_KEY override. " +
        "Use the NEXUS_ORGANIZATION_ID env var instead."
    );
    return;
  }

  // Through the canon, with both globals — see `status.handler.ts`. This one
  // WRITES: the org it stores is the one the listing came back with, so a
  // listing fetched from the wrong host writes another environment's org id
  // onto the profile.
  const baseUrl = resolveBaseUrl(globals.baseUrl, globals.profile);
  let organizations: UserOrganization[];
  try {
    organizations = await fetchOrganizations(
      baseUrl,
      resolved.profile.apiKey,
      globals.timeout as number | undefined
    );
  } catch (err) {
    process.exitCode = reportFailure("connection-failed", (err as Error).message);
    return;
  }

  applyUseOrg(orgId, resolved, organizations);
}

/**
 * Select the target organization from the listing and store it on the profile.
 * Split from the resolution above only to stay inside the 80-line function cap.
 */
function applyUseOrg(
  orgId: string,
  resolved: ResolvedProfile,
  organizations: UserOrganization[]
): void {
  let match = organizations.find((org) => org.organizationId === orgId);
  let outsideMemberships = false;
  if (!match) {
    // `fetchOrganizations` lists MEMBERSHIPS. A platform-operator key
    // (NEX-3037) is defined by reaching orgs its owner is not a member of,
    // so refusing here would reject precisely the switch the credential
    // exists to perform — the membership list can never contain the target.
    //
    // Client-side only: the server still authorizes every request against
    // `PublicApiKey.isPlatformOperator`, so an ordinary user typing an
    // `nxs_o_`-shaped key gains nothing from this branch.
    if (!resolved.profile.apiKey.startsWith(PLATFORM_OPERATOR_TOKEN_PREFIX)) {
      process.exitCode = reportFailure(
        "not-found",
        `You are not a member of "${orgId}", or it does not exist.`,
        "Run: nexus auth orgs"
      );
      return;
    }
    // The name is unknown — it is not our org — so show the id and say why.
    // Prose BEFORE the success document is still two things on stdout, so
    // the human line stays human and the fact rides in the payload below.
    if (!isJsonMode()) {
      console.log(
        color.dim(
          `Platform-operator key: "${orgId}" is not one of your organizations. ` +
            "Switching anyway; every request will be recorded in the admin audit log."
        )
      );
    }
    outsideMemberships = true;
    match = { organizationId: orgId, name: null, role: "org:admin" };
  }

  try {
    setProfileOrganization(resolved.name, match.organizationId, match.name ?? undefined);
  } catch (err) {
    process.exitCode = reportFailure("local-failed", (err as Error).message);
    return;
  }

  printSuccess(`Active organization set to "${match.name ?? match.organizationId}".`, {
    profile: resolved.name,
    "org id": match.organizationId,
    role: match.role,
    outsideMemberships
  });
}
