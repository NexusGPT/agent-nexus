import { URL_MAP } from "./config-env-hosts";
import { resolveEnvName } from "./config-env-resolve";
import { findNexusRc } from "./config-nexusrc";
import { lookupProfile, refusalForNoProfile } from "./config-profile-lookup";
import { loadConfig } from "./config-store";
import type { ProfileSource, ResolvedProfile } from "./config-types";

/**
 * WHICH PROFILE AND WHICH API HOST — two answers that share one chain, and one
 * `NEXUS_BASE_URL` read, so they live in one file. `config-resolve-api-key.ts`
 * is the third answer; it reads no environment variable of its own.
 *
 * 🔴 THIS FILE IS THE BASE-URL CANON, AND `base-url-precedence-is-one-rule.
 * test.ts` NAMES IT BY PATH. That gate reads {@link resolveBaseUrl} off disk,
 * derives its selector ORDER from the body's own lines, and censuses every file
 * in `packages/{cli,mcp-server,sdk}/src` that reads `NEXUS_BASE_URL` or a
 * resolved profile's stored `baseUrl` — asserting the result equals a
 * hand-written set holding this path. Moving either read into a sibling file is
 * a SIXTH copy of the precedence as far as that census is concerned, and it
 * reds. Both reads therefore stay here: {@link resolveProfile}'s two override
 * arms and {@link resolveBaseUrl}'s third term.
 */

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
  const lookup = (name: string, source: ProfileSource, rcPath?: string): ResolvedProfile =>
    lookupProfile((cachedConfig ??= loadConfig()), name, source, rcPath);

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
  throw refusalForNoProfile(Object.keys(config.profiles));
}

// ---------------------------------------------------------------------------
// API host resolution
// ---------------------------------------------------------------------------

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
