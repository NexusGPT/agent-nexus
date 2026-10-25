import { invalidInput } from "../errors";
import type { MountScope } from "../mount-registry";
import type { Blocked } from "./direct-local-block";
import { orTheGateway } from "./or-the-gateway";

/** The two pins a direct mount's renewal acts on — required, or the engine is refused. */
export interface DirectPins {
  readonly profile: string;
  readonly orgId: string;
  readonly orgName?: string;
}

/**
 * The direct engine renews its access every hour by re-reading the profile's
 * saved key and minting under the recorded organization. A key that arrived
 * through --api-key or NEXUS_API_KEY was never saved, so nothing could re-read
 * it; a scope with no organization has nothing to pin the drive to. Both are
 * refused BEFORE any mint, naming the fix — returned, so `auto` can fall back.
 */
export function directPins(
  scope: MountScope
): { readonly ok: true; readonly pins: DirectPins } | Blocked {
  if (scope.profile === undefined) {
    return {
      ok: false,
      block: "raw-api-key",
      refusal: invalidInput(
        "--engine direct needs a saved profile: the API key came from --api-key or NEXUS_API_KEY, " +
          "and the drive's hourly renewal re-reads the key from the profile that saved it.",
        `Run: nexus auth login, then mount without --api-key.${orTheGateway()}`
      )
    };
  }
  if (scope.orgId === undefined) {
    return {
      ok: false,
      block: "no-organization",
      refusal: invalidInput(
        `--engine direct needs an organization to pin the drive to, and profile "${scope.profile}" resolves none.`,
        `Run: nexus auth use-org <org> (or set NEXUS_ORGANIZATION_ID), then mount again.${orTheGateway()}`
      )
    };
  }
  return { ok: true, pins: { profile: scope.profile, orgId: scope.orgId, orgName: scope.orgName } };
}
