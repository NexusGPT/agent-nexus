import { DASHBOARD_URL_MAP } from "./config-env-hosts";
import { resolveEnvName } from "./config-env-resolve";
import { resolveProfile } from "./config-resolve";

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
