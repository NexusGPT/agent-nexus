import { loadConfig, saveConfig } from "./config-store";
import type { NexusProfile } from "./config-types";

// ---------------------------------------------------------------------------
// Profile CRUD helpers
// ---------------------------------------------------------------------------

/** Get a profile by name, or undefined if it doesn't exist. */
export function getProfile(name: string): NexusProfile | undefined {
  return loadConfig().profiles[name];
}

/** Save (upsert) a single profile. */
export function saveProfile(name: string, profile: NexusProfile): void {
  const config = loadConfig();
  config.profiles[name] = profile;
  // If this is the first profile, set it as active
  if (!config.activeProfile || Object.keys(config.profiles).length === 1) {
    config.activeProfile = name;
  }
  saveConfig(config);
}

/** Remove a profile. Returns true if it existed. */
export function removeProfile(name: string): boolean {
  const config = loadConfig();
  if (!(name in config.profiles)) return false;

  delete config.profiles[name];

  // If we removed the active profile, promote the first remaining one
  if (config.activeProfile === name) {
    const remaining = Object.keys(config.profiles);
    config.activeProfile = remaining[0] ?? "";
  }

  saveConfig(config);
  return true;
}

/** Set the active profile. Throws if the profile doesn't exist. */
export function setActiveProfile(name: string): void {
  const config = loadConfig();
  if (!(name in config.profiles)) {
    const available = Object.keys(config.profiles).join(", ");
    throw new Error(
      `Profile "${name}" not found.` +
        (available ? ` Available: ${available}. Run: nexus auth list` : " Run: nexus auth login")
    );
  }
  config.activeProfile = name;
  saveConfig(config);
}

/**
 * Set the active organization on a profile (for org-unbound tokens).
 * Persists `orgId`/`orgName` so later commands send the `organization-id` header.
 * Throws if the profile doesn't exist.
 *
 * `orgName` is CLEARED when omitted, never left alone. The previous behaviour —
 * `if (orgName !== undefined)` — meant switching to an org whose name we do not
 * know (a platform-operator key targeting a tenant outside the owner's
 * memberships, which has no membership row to read a name from) moved `orgId`
 * while the OLD org's name stayed behind. `status` then showed the new id beside
 * the previous tenant's name, which is worse than showing no name at all: it
 * names the wrong customer.
 */
export function setProfileOrganization(name: string, orgId: string, orgName?: string): void {
  const config = loadConfig();
  const profile = config.profiles[name];
  if (!profile) {
    throw new Error(`Profile "${name}" not found. Run: nexus auth list`);
  }
  profile.orgId = orgId;
  profile.orgName = orgName;
  saveConfig(config);
}

/** Return all profiles and the active profile name. */
export function listProfiles(): { profiles: Record<string, NexusProfile>; activeProfile: string } {
  const config = loadConfig();
  return { profiles: config.profiles, activeProfile: config.activeProfile };
}
