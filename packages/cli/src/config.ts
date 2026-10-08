import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CategorizedCliError } from "./exit-codes";
import { warnIfLoosePermissions, writeSecretFile } from "./util/secret-file";

// ---------------------------------------------------------------------------
// URL map
// ---------------------------------------------------------------------------

/**
 * The environments `NEXUS_ENV` may name. ONE declaration, and both host maps
 * below are keyed by it.
 *
 * 🚨 THE TWO MAPS DRIFTING APART IS THE DEFECT THIS SHAPE REMOVES (NEX-5919).
 * They were two independent `Record<string, string>` literals read as
 * `URL_MAP[env] ?? URL_MAP.production`, so a name in one and not the other was
 * an error nowhere — it RESOLVED, to production. `Record<NexusEnvName, …>` has
 * no key to fall through to: a name added here reds BOTH objects until both
 * hosts are supplied, which is a typecheck rather than a convention.
 *
 * ⚠️ EXHAUSTIVENESS IS NECESSARY AND NOT SUFFICIENT — it proves every key is
 * present and nothing about any value being right. `config-nexus-env.test.ts`
 * asserts the hosts.
 */
export const NEXUS_ENV_NAMES = ["production", "staging", "dev"] as const;

/** One of {@link NEXUS_ENV_NAMES}. */
export type NexusEnvName = (typeof NEXUS_ENV_NAMES)[number];

/**
 * API hosts, and below them console hosts — `deployment/README.md`'s
 * per-environment table, read down each of its two columns.
 *
 * ⚠️ PRODUCTION AND STAGING SIT ON DIFFERENT REGISTRABLE DOMAINS,
 * `nexusgpt.io` against `gpt.nexus`, and that is the deployment rather than a
 * typo here — `deployment/config.yml` carries both. Normalising either to match
 * the other points the CLI at a host that serves nothing.
 */
const URL_MAP: Record<NexusEnvName, string> = {
  production: "https://api.nexusgpt.io",
  staging: "https://api-staging.gpt.nexus",
  dev: "http://localhost:3001"
};

const DASHBOARD_URL_MAP: Record<NexusEnvName, string> = {
  production: "https://gpt.nexus",
  staging: "https://staging.gpt.nexus",
  dev: "http://localhost:3000"
};

/** True when `value` names an environment both maps above hold a host for. */
function isNexusEnvName(value: string): value is NexusEnvName {
  return NEXUS_ENV_NAMES.some((name) => name === value);
}

/**
 * The environment `NEXUS_ENV` names, or `production` when it is unset.
 *
 * 🔴 AN UNRECOGNISED NAME IS REFUSED, NEVER RESOLVED. The `?? URL_MAP.production`
 * this replaces sent `NEXUS_ENV=staging` to PRODUCTION — exit 0, no host on
 * screen, and `nexus admin … set` writing to the live tenant base. Every typo
 * did the same, because the fallback made a name that was TYPED
 * indistinguishable from one that was never set.
 *
 * Unset therefore still means `production`: the default was never the defect.
 *
 * ⚠️ AND SO DOES EMPTY, AND SO DOES WHITESPACE — `??` DEFAULTS ON `undefined`
 * AND `null` ONLY. `NEXUS_ENV=""` is not a typo anybody made; it is what CI
 * templating produces from a variable that does not exist
 * (`NEXUS_ENV: ${{ vars.NEXUS_ENV }}`, `NEXUS_ENV=$UNSET`, `export NEXUS_ENV=`).
 * Refusing those would break callers who never chose anything, which is the
 * opposite of this function's point. `raw || "production"` is the wrong
 * spelling of the cure: `nexus/truthy-default-swallows-zero` is a live rule in
 * this package and an explicit test says what is meant anyway.
 *
 * Case is still SIGNIFICANT: `"STAGING"` refuses. A name nobody serves reaching
 * production quietly is the defect; strictness about case is the cure.
 *
 * `"CLI_UNKNOWN_NEXUS_ENV"` is spelled literally, as `"CLI_NOT_AUTHENTICATED"`
 * already is below — `errors.ts` owns the registry and importing it from here
 * would close a module cycle through `output.ts`.
 */
function resolveEnvName(raw: string | undefined): NexusEnvName {
  const trimmed = raw?.trim();
  const value = trimmed === undefined || trimmed === "" ? "production" : trimmed;
  if (isNexusEnvName(value)) return value;
  throw new CategorizedCliError(
    "invalid-input",
    "CLI_UNKNOWN_NEXUS_ENV",
    `NEXUS_ENV is set to "${value}", which is not an environment this CLI knows. ` +
      `Accepted: ${NEXUS_ENV_NAMES.join(", ")}.`,
    `Unset NEXUS_ENV, or set it to one of ${NEXUS_ENV_NAMES.join(", ")}. ` +
      `To pin hosts directly instead: --base-url / NEXUS_BASE_URL for the API, ` +
      `--dashboard-url / NEXUS_DASHBOARD_URL for the console — they are separate ` +
      `chains, and pinning one does not answer for the other.`
  );
}

/**
 * Refuse an unrecognised `NEXUS_ENV` NOW, before a command does anything.
 *
 * 🔴 A REFUSAL THAT ARRIVES AFTER A WRITE IS WORSE THAN NO REFUSAL. The two
 * resolvers walk INDEPENDENT chains and each reaches {@link resolveEnvName}
 * last, so `resolveBaseUrl` can short-circuit on any of four earlier terms — an
 * override, a named profile, `NEXUS_BASE_URL`, or an ACTIVE PROFILE carrying a
 * `baseUrl` and no `dashboardUrl`, which needs no flag and no env var at all —
 * while `resolveDashboardUrl` falls all the way through and throws. Roughly
 * sixteen commands build their console link AFTER the mutating call, so the
 * resource was created and the process then exited non-zero: a script reads
 * that as a failed create and retries, and the retry duplicates the resource.
 *
 * The root `preAction` hook in `index.ts` calls this, so the refusal lands
 * before any action handler runs and nothing can be written first. The throws
 * inside both resolvers stay as defence in depth — with this in place they are
 * unreachable from a CLI invocation, which is the state to keep them in.
 */
export function assertKnownNexusEnv(): void {
  resolveEnvName(process.env.NEXUS_ENV);
}

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
 * Whether `config.json` is ABSENT, readable, or there and unreadable.
 *
 * 🔴 {@link loadConfig} cannot answer this and must not be changed to: it
 * returns an empty config for a missing file AND for a damaged one, which is
 * right for its callers — they want a config or a blank slate. It is wrong for
 * anyone DIAGNOSING, because "you have no profiles" and "I could not read your
 * profiles" lead to opposite advice, and the advice for the first one
 * (`nexus auth login`) writes a fresh config over the file that was merely
 * unreadable, taking every other profile with it.
 *
 * Parses rather than stats, because a truncated file exists and still cannot be
 * read. No migration and no permission warning: this answers one question.
 */
export function configFileState(): "absent" | "readable" | "unreadable" {
  let raw: string;
  try {
    raw = fs.readFileSync(CONFIG_FILE, "utf-8");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    return code === "ENOENT" ? "absent" : "unreadable";
  }
  try {
    JSON.parse(raw);
    return "readable";
  } catch {
    return "unreadable";
  }
}

/**
 * Load config from disk. Auto-migrates V1 → V2 on first read.
 * Returns an empty V2 config if the file doesn't exist.
 */
export function loadConfig(): NexusConfigV2 {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    // The file holds an API key in plaintext. A loose mode found HERE is a past
    // exposure the write path's chmod cannot undo, so it is said out loud once.
    warnIfLoosePermissions(CONFIG_FILE);
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

/**
 * Write V2 config to disk, owner-readable only.
 *
 * `writeSecretFile` rather than a `mode:` argument: a `mode:` is honoured only
 * when the path has to be CREATED, so it left an already-0644 config file
 * world-readable through every login. See `util/secret-file.ts`.
 */
export function saveConfig(config: NexusConfigV2): void {
  writeSecretFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
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
    throw new CategorizedCliError(
      "not-authenticated",
      "CLI_NOT_AUTHENTICATED",
      `No active profile set. Available: ${profileNames.join(", ")}.`,
      "Run: nexus auth switch <profile>"
    );
  }

  throw new CategorizedCliError(
    "not-authenticated",
    "CLI_NOT_AUTHENTICATED",
    "No profiles configured.",
    "Run: nexus auth login"
  );
}

// ---------------------------------------------------------------------------
// Organization resolution
// ---------------------------------------------------------------------------

/** How the organization the next request acts on was determined. */
export type OrganizationSource =
  | "env" // NEXUS_ORGANIZATION_ID — per-shell, does not touch config
  | "profile" // the resolved profile's stored orgId
  | "token"; // no selection: the key's own org decides, server-side

/** The organization a command will act on, and what selected it. */
export interface ResolvedOrganization {
  organizationId?: string;
  source: OrganizationSource;
}

/**
 * Resolve the organization the `organization-id` header will name.
 *
 * ONE definition of this precedence, read by the client that sends the header
 * AND by `auth status`, which reports it. They were separate: the client sent
 * `NEXUS_ORGANIZATION_ID || profile.orgId` while status printed `profile.orgId`
 * unconditionally, so a shell that had set the env var was told it was acting on
 * the profile's organization and acting on another one — the one surface whose
 * whole job is answering "which org am I in" was the one that lied (NEX-2525).
 *
 * The env var is deliberately on top: it is the per-shell org selector, the
 * counterpart of `NEXUS_PROFILE`, and the only way to hold two organizations
 * concurrently under a single cross-org token whose `orgId` lives in one shared
 * config file.
 */
export function resolveOrganization(profile: NexusProfile): ResolvedOrganization {
  const fromEnv = process.env.NEXUS_ORGANIZATION_ID;
  if (fromEnv) return { organizationId: fromEnv, source: "env" };
  if (profile.orgId) return { organizationId: profile.orgId, source: "profile" };
  return { source: "token" };
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
 * Resolve the API base URL. ONE definition, read by the client that SENDS a
 * request and by `auth status` which REPORTS it — there were five; the gate is
 * `base-url-precedence-is-one-rule.test.ts`. Precedence: --base-url → named
 * --profile (which outranks the env var) → NEXUS_BASE_URL → active → NEXUS_ENV.
 *
 * 🔴 THROWS on a `NEXUS_ENV` naming no known environment, rather than answering
 * the production host. See {@link resolveEnvName}.
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

  // 🔴 THE `NEXUS_ENV` READ STAYS IN THIS BODY, LAST. The gate derives this
  // resolver's selector ORDER by scanning these lines, so hoisting the read
  // into a helper that does not name the variable deletes the `env-name` term.
  const env = resolveEnvName(process.env.NEXUS_ENV);
  return URL_MAP[env];
}

/**
 * Resolve the dashboard URL.
 *
 * Priority: explicit override → named --profile → NEXUS_DASHBOARD_URL env →
 * active profile → NEXUS_ENV.
 *
 * 🔴 THROWS on a `NEXUS_ENV` naming no known environment, exactly as
 * `resolveBaseUrl` does — the two read ONE table, so they cannot disagree about
 * which names exist. A console link for an environment the request never went
 * to is the failure this whole docblock is about.
 *
 * 🚨 `profile` IS NOT OPTIONAL POLISH — WITHOUT IT THIS ANSWERS ABOUT A
 * DIFFERENT ENVIRONMENT THAN THE REQUEST WENT TO. `resolveBaseUrl` and
 * `resolveApiKey` both take it, so `--profile staging` sends the request to
 * staging; this function used to take only the override and resolve the ACTIVE
 * profile, so the link came back pointing at production. The failure looks like
 * a missing resource: the link opens, the dashboard is the wrong org's, and the
 * thing the command just created is not there.
 *
 * ⚠️ THE NAMED PROFILE OUTRANKS `NEXUS_DASHBOARD_URL`, matching `resolveBaseUrl`
 * exactly. An explicit flag beats an ambient env var, and the two resolvers
 * disagreeing about that ordering is how the host and the link drift apart on
 * one invocation.
 */
export function resolveDashboardUrl(override?: string, profile?: string): string {
  return resolveDashboardUrlWithSource(override, profile).url;
}

/** Which step of {@link resolveDashboardUrlWithSource} answered. */
export type DashboardUrlSource =
  | "override" // --dashboard-url flag
  | "named-profile" // the --profile's stored dashboardUrl
  | "env" // NEXUS_DASHBOARD_URL
  | "active-profile" // the active profile's stored dashboardUrl
  | "env-name"; // the NEXUS_ENV table — the one host nobody typed

export interface ResolvedDashboardUrl {
  url: string;
  source: DashboardUrlSource;
}

/**
 * {@link resolveDashboardUrl}, with the step that answered. Same chain, same
 * order; the tag is for a caller that also knows where the REQUEST went and
 * wants to say so when a guessed link contradicts it. `env-name` is the only
 * source a human never typed — every other step is a value somebody set.
 */
export function resolveDashboardUrlWithSource(
  override?: string,
  profile?: string
): ResolvedDashboardUrl {
  if (override) return { url: override, source: "override" };

  if (profile) {
    try {
      const resolved = resolveProfile({ profile });
      if (resolved.profile.dashboardUrl) {
        return { url: resolved.profile.dashboardUrl, source: "named-profile" };
      }
    } catch {
      // Named profile missing — fall through to env / defaults.
    }
  }

  if (process.env.NEXUS_DASHBOARD_URL) {
    return { url: process.env.NEXUS_DASHBOARD_URL, source: "env" };
  }

  try {
    const resolved = resolveProfile();
    if (resolved.profile.dashboardUrl) {
      return { url: resolved.profile.dashboardUrl, source: "active-profile" };
    }
  } catch {
    // No profile — fall through to defaults
  }

  const env = resolveEnvName(process.env.NEXUS_ENV);
  return { url: DASHBOARD_URL_MAP[env], source: "env-name" };
}

/**
 * The dashboard that goes with `apiBaseUrl`, or `undefined` when that API host
 * is not one of the three this CLI ships.
 *
 * Two tables, one shared key. `URL_MAP` maps an environment name to its API
 * host; `DASHBOARD_URL_MAP` maps the same name to its dashboard host. So the
 * walk is: API host → environment name (first table, read backwards) →
 * dashboard host (second table, read forwards). Nothing here spells a host, so
 * the pair cannot drift from what `auth login --env` writes.
 */
export function dashboardHostPairedWith(apiBaseUrl: string): string | undefined {
  const apiHost = apiBaseUrl.replace(/\/+$/, "");

  // URL_MAP, read backwards: which environment name has this API host?
  const environmentName = NEXUS_ENV_NAMES.find((candidate) => URL_MAP[candidate] === apiHost);
  if (environmentName === undefined) return undefined;

  // DASHBOARD_URL_MAP, read forwards: that environment's dashboard host.
  return DASHBOARD_URL_MAP[environmentName];
}
