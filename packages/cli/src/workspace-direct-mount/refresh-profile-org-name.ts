import { loadConfig, setProfileOrganization } from "../config";
import type { DirectPins } from "./direct-pins";

/**
 * Write the server's organization name back into the profile that named the
 * org, so the NEXT mount reads a current one.
 *
 * The volume name can take the fresh value straight from the mint, but the
 * DEFAULT mount point cannot: `~/nexus/<org>/<slug>` is resolved before the
 * mint, deliberately, so every local refusal happens before a credential is
 * minted. Refreshing the stored copy is what closes that gap without moving the
 * mint ahead of the refusals.
 *
 * 🔴 ONLY when the profile still names the org this drive is pinned to. The
 * writer sets `orgId` and `orgName` TOGETHER, so calling it for a drive whose
 * pinned org is not the profile's current one would move the profile's active
 * organization — a remount of a drive pinned to an org the user has since
 * switched away from would silently switch them back. A remount reads its pins
 * from the REGISTRY ROW, not from the live scope, so the two genuinely differ.
 *
 * Silent on every failure. This is a label, and a read-only config directory
 * must not cost a caller the drive it just mounted successfully.
 */
export function refreshProfileOrgName(pins: DirectPins, serverOrgName: string | null): void {
  if (serverOrgName === null || serverOrgName === pins.orgName) return;
  try {
    const profile = loadConfig().profiles[pins.profile];
    if (profile?.orgId !== pins.orgId) return;
    setProfileOrganization(pins.profile, pins.orgId, serverOrgName);
  } catch {
    // Nothing to report: the mount is fine, and the next mount tries again.
  }
}
