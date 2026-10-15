import { invalidInput } from "../errors";
import type { MountScope } from "../mount-registry";
import { OR_DROP_DIRECT } from "./or-drop-direct";

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
 * refused BEFORE any mint, naming the fix.
 */
export function directPins(scope: MountScope): DirectPins {
  if (scope.profile === undefined) {
    throw invalidInput(
      "--engine direct needs a saved profile: the API key came from --api-key or NEXUS_API_KEY, " +
        "and the drive's hourly renewal re-reads the key from the profile that saved it.",
      `Run: nexus auth login, then mount without --api-key.${OR_DROP_DIRECT}`
    );
  }
  if (scope.orgId === undefined) {
    throw invalidInput(
      `--engine direct needs an organization to pin the drive to, and profile "${scope.profile}" resolves none.`,
      `Run: nexus auth use-org <org> (or set NEXUS_ORGANIZATION_ID), then mount again.${OR_DROP_DIRECT}`
    );
  }
  return { profile: scope.profile, orgId: scope.orgId, orgName: scope.orgName };
}
