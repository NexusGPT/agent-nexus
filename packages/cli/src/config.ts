import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// URL map
// ---------------------------------------------------------------------------

const URL_MAP: Record<string, string> = {
  production: "https://api.nexusgpt.io",
  dev: "http://localhost:3001"
};

const DASHBOARD_URL_MAP: Record<string, string> = {
  production: "https://gpt.nexus",
  dev: "http://localhost:3000"
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(os.homedir(), ".nexus-mcp");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const NEXUSRC_FILENAME = ".nexusrc";
const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single saved organization/key pair. */
export interface NexusProfile {
  apiKey: string;
  baseUrl?: string;
  dashboardUrl?: string;
  orgName?: string;
  orgId?: string;
  /** Email of the user that owns the API key (captured at login from /me). */
  userEmail?: string;
  /**
   * True when `apiKey` is org-unbound — a personal cross-org token (`nxs_p_`) or
   * a platform-operator token (`nxs_o_`, NEX-3037). One
   * key usable across every org the user belongs to. The active org is `orgId`,
   * sent as the `organization-id` header; switch it with `nexus auth use-org`.
   * See NEX-2474.
   */
  personalToken?: boolean;
}

/** V2 config: multiple named profiles with one active. */
export interface NexusConfigV2 {
  activeProfile: string;
  profiles: Record<string, NexusProfile>;
}

/** V1 (legacy) flat config — used only for migration detection. */
interface NexusConfigV1 {
  apiKey?: string;
  baseUrl?: string;
}

/** Contents of a .nexusrc file. */
export interface NexusRcFile {
  profile: string;
}

/** How the active profile was determined. */
export type ProfileSource =
  | "flag" // --profile flag
  | "env" // NEXUS_PROFILE env var
  | "directory" // .nexusrc file
  | "active" // config.activeProfile
  | "default" // fallback to "default" profile
  | "override"; // --api-key flag or NEXUS_API_KEY env (bypasses profiles)

/** Result of profile resolution — includes the source for the context banner. */
export interface ResolvedProfile {
  name: string;
  profile: NexusProfile;
  source: ProfileSource;
  /** Path to .nexusrc when source === "directory". */
  rcPath?: string;
}

// ---------------------------------------------------------------------------
// Config file I/O — shared with @agent-nexus/mcp-server
// ---------------------------------------------------------------------------

/**
 * Load config from disk. Auto-migrates V1 → V2 on first read.
 * Returns an empty V2 config if the file doesn't exist.
 */
export function loadConfig(): NexusConfigV2 {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // V2 format: has "profiles" key
    if ("profiles" in parsed && typeof parsed.profiles === "object") {
      return parsed as unknown as NexusConfigV2;
    }

    // V1 format: flat { apiKey, baseUrl } — migrate to V2
    const v1 = parsed as NexusConfigV1;
    if (v1.apiKey) {
      const migrated: NexusConfigV2 = {
        activeProfile: "default",
        profiles: {
          default: {
            apiKey: v1.apiKey,
            ...(v1.baseUrl ? { baseUrl: v1.baseUrl } : {})
          }
        }
      };
      saveConfig(migrated);
      return migrated;
    }

    return emptyConfig();
  } catch {
    return emptyConfig();
  }
}

/** Write V2 config to disk with restricted permissions. */
export function saveConfig(config: NexusConfigV2): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600
  });
}

/** Delete the config file entirely. */
export function clearConfig(): void {
  try {
    fs.unlinkSync(CONFIG_FILE);
  } catch {
    /* ignore */
  }
}

function emptyConfig(): NexusConfigV2 {
  return { activeProfile: "", profiles: {} };
}

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

// ---------------------------------------------------------------------------
// Profile name validation
// ---------------------------------------------------------------------------

/** Validate a profile name. Returns null if valid, or an error message. */
export function validateProfileName(name: string): string | null {
  if (!PROFILE_NAME_RE.test(name)) {
    return (
      `Invalid profile name "${name}". ` +
      "Use lowercase letters, numbers, hyphens, underscores (max 32 chars, must start with alphanumeric)."
    );
  }
  return null;
}

/** Slugify a string into a valid profile name. */
export function slugifyProfileName(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "default"
  );
}

// ---------------------------------------------------------------------------
// .nexusrc — directory pinning
// ---------------------------------------------------------------------------

/**
 * Walk up from `startDir` looking for a `.nexusrc` file.
 * Returns the parsed profile name and path, or null if not found.
 */
export function findNexusRc(
  startDir: string = process.cwd()
): { profile: string; rcPath: string } | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    const rcPath = path.join(dir, NEXUSRC_FILENAME);
    try {
      const raw = fs.readFileSync(rcPath, "utf-8");
      const parsed = JSON.parse(raw) as NexusRcFile;
      if (parsed.profile && typeof parsed.profile === "string") {
        return { profile: parsed.profile, rcPath };
      }
    } catch {
      // Not found or invalid — keep walking
    }

    if (dir === root) break;
    dir = path.dirname(dir);
  }

  return null;
}

/** Write a `.nexusrc` file in the given directory. */
export function writeNexusRc(dir: string, profile: string): void {
  const rcPath = path.join(dir, NEXUSRC_FILENAME);
  fs.writeFileSync(rcPath, JSON.stringify({ profile }, null, 2) + "\n");
}

/** Remove a `.nexusrc` file from the given directory. Returns true if it existed. */
export function removeNexusRc(dir: string): boolean {
  const rcPath = path.join(dir, NEXUSRC_FILENAME);
  try {
    fs.unlinkSync(rcPath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Profile resolution
// ---------------------------------------------------------------------------

/**
 * Central profile resolution. Implements the full chain:
 *
 *   --api-key / NEXUS_API_KEY  (bypass profiles → source: "override")
 *     → --profile flag         (source: "flag")
 *       → NEXUS_PROFILE env    (source: "env")
 *         → .nexusrc           (source: "directory")
 *           → activeProfile    (source: "active")
 *             → "default"      (source: "default")
 *               → ERROR
 */
export function resolveProfile(opts?: {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
}): ResolvedProfile {
  // Precedence: explicit --api-key > explicit --profile > NEXUS_API_KEY env >
  // NEXUS_PROFILE env > .nexusrc > active profile > default. An explicit flag
  // always outranks an ambient env var, so `--profile prod` is honored even
  // when NEXUS_API_KEY is exported.

  // 1. Explicit --api-key bypasses profiles entirely (most specific credential).
  if (opts?.apiKey) {
    return {
      name: "override",
      profile: { apiKey: opts.apiKey, baseUrl: opts?.baseUrl ?? process.env.NEXUS_BASE_URL },
      source: "override"
    };
  }

  // Config is loaded lazily: a headless caller relying on NEXUS_API_KEY may
  // have no config file at all and must not be forced to create one.
  let cachedConfig: ReturnType<typeof loadConfig> | undefined;
  const lookup = (name: string, source: ProfileSource, rcPath?: string): ResolvedProfile => {
    const config = (cachedConfig ??= loadConfig());
    const profile = config.profiles[name];
    if (!profile) {
      const available = Object.keys(config.profiles).join(", ");
      const sourceHint =
        source === "flag"
          ? `(from --profile flag)`
          : source === "env"
            ? `(from NEXUS_PROFILE env)`
            : source === "directory"
              ? `(from .nexusrc at ${rcPath})`
              : source === "active"
                ? `(active profile)`
                : `(default profile)`;

      throw new Error(
        `Profile "${name}" ${sourceHint} not found.` +
          (available
            ? ` Available: ${available}. Run: nexus auth list`
            : " No profiles configured. Run: nexus auth login")
      );
    }
    return { name, profile, source, rcPath };
  };

  // 2. Explicit --profile flag (outranks ambient env vars).
  if (opts?.profile) {
    return lookup(opts.profile, "flag");
  }

  // 3. NEXUS_API_KEY env (no config file required — headless usage).
  if (process.env.NEXUS_API_KEY) {
    return {
      name: "override",
      profile: {
        apiKey: process.env.NEXUS_API_KEY,
        baseUrl: opts?.baseUrl ?? process.env.NEXUS_BASE_URL
      },
      source: "override"
    };
  }

  // 4. NEXUS_PROFILE env
  if (process.env.NEXUS_PROFILE) {
    return lookup(process.env.NEXUS_PROFILE, "env");
  }

  // 5. .nexusrc directory pinning
  const rc = findNexusRc();
  if (rc) {
    return lookup(rc.profile, "directory", rc.rcPath);
  }

  // 6. activeProfile from config, then "default"
  const config = (cachedConfig ??= loadConfig());
  if (config.activeProfile && config.profiles[config.activeProfile]) {
    return lookup(config.activeProfile, "active");
  }
  if (config.profiles["default"]) {
    return lookup("default", "default");
  }

  // 7. No profiles at all
  const profileNames = Object.keys(config.profiles);
  if (profileNames.length > 0) {
    throw new Error(
      `No active profile set. Available: ${profileNames.join(", ")}.\n` +
        `  Run: nexus auth switch <profile>`
    );
  }

  throw new Error("No profiles configured. Run:\n  nexus auth login");
}

// ---------------------------------------------------------------------------
// Backward-compatible resolution helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the API key.
 * Precedence: explicit --api-key override → the named --profile's key →
 * NEXUS_API_KEY env → active profile's key → error. An explicit --profile
 * outranks the ambient env var (resolution delegates to resolveProfile).
 */
export function resolveApiKey(override?: string, profile?: string): string {
  if (override) return override;
  return resolveProfile({ profile }).profile.apiKey;
}

/**
 * Resolve the API base URL.
 * Precedence: explicit --base-url override → the named --profile's base →
 * NEXUS_BASE_URL env → active profile's base → NEXUS_ENV map → production. An
 * explicit --profile outranks the ambient env var, mirroring resolveProfile.
 */
export function resolveBaseUrl(override?: string, profile?: string): string {
  if (override) return override;

  // An explicit --profile's base outranks ambient NEXUS_BASE_URL.
  if (profile) {
    try {
      const resolved = resolveProfile({ profile });
      if (resolved.profile.baseUrl) return resolved.profile.baseUrl;
    } catch {
      // Named profile missing — fall through to env / defaults.
    }
  }

  if (process.env.NEXUS_BASE_URL) return process.env.NEXUS_BASE_URL;

  try {
    const resolved = resolveProfile();
    if (resolved.profile.baseUrl) return resolved.profile.baseUrl;
  } catch {
    // No profile — fall through to defaults
  }

  const env = process.env.NEXUS_ENV ?? "production";
  return URL_MAP[env] ?? URL_MAP.production;
}

/**
 * Resolve the dashboard URL.
 * Priority: explicit override → NEXUS_DASHBOARD_URL env → active profile → NEXUS_ENV → production
 */
export function resolveDashboardUrl(override?: string): string {
  if (override) return override;
  if (process.env.NEXUS_DASHBOARD_URL) return process.env.NEXUS_DASHBOARD_URL;

  try {
    const resolved = resolveProfile();
    if (resolved.profile.dashboardUrl) return resolved.profile.dashboardUrl;
  } catch {
    // No profile — fall through to defaults
  }

  const env = process.env.NEXUS_ENV ?? "production";
  return DASHBOARD_URL_MAP[env] ?? DASHBOARD_URL_MAP.production;
}
