import type { LiveIdentity } from "../../auth-probe";
import { type NexusProfile, type ResolvedProfile, saveProfile } from "../../config";

/** Refresh the profile's cached org/user identity from a live `/me` answer. */
export function syncIdentityToProfile(
  resolved: ResolvedProfile,
  identity: LiveIdentity | undefined
): void {
  // Mirror the authoritative /me identity into the stored profile so
  // `list`/`status` reflect reality. This is a SYNC, not a merge: a field the
  // live response omits/nulls is cleared from the cache, so a stale org or
  // email can't linger after the real value changes.
  //
  // Skip the write for an ephemeral `--api-key` / `NEXUS_API_KEY` override —
  // `resolveProfile` names that result "override"; persisting it would write
  // a bogus "override" profile into config.json.
  if (identity && resolved.source !== "override") {
    const synced: NexusProfile = { ...resolved.profile };
    setOrClear(synced, "orgName", identity.orgName);
    setOrClear(synced, "orgId", identity.orgId);
    setOrClear(synced, "userEmail", identity.userEmail);
    if (
      synced.orgName !== resolved.profile.orgName ||
      synced.orgId !== resolved.profile.orgId ||
      synced.userEmail !== resolved.profile.userEmail
    ) {
      // Best-effort cache refresh: a write failure (read-only FS, disk full,
      // permissions) must not fail whoami and must not be reported as a
      // failure to reach the API — auth already succeeded and the live
      // identity is still shown below.
      try {
        saveProfile(resolved.name, synced);
      } catch {
        // ignore — caching is an optimization, not the command's purpose
      }
    }
  }
}

/**
 * Mirror an authoritative live value into a profile field: set it when present,
 * delete it when the live response omits/nulls it (so stale values don't linger).
 */
function setOrClear(
  profile: NexusProfile,
  key: "orgName" | "orgId" | "userEmail",
  value: string | undefined | null
): void {
  if (value) profile[key] = value;
  else delete profile[key];
}
