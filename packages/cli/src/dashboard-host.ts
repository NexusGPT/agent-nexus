import {
  dashboardHostPairedWith,
  resolveBaseUrl,
  resolveDashboardUrlWithSource,
  resolveProfile
} from "./config";
import { printWarning } from "./output";

/**
 * The globals that decide WHICH dashboard a link points at.
 *
 * 🚨 IT TAKES THE OBJECT, NOT ONE FIELD, AND THAT SHAPE IS THE FIX. The first
 * version of this took a bare `override?: string`, so every call site passed
 * `globals.dashboardUrl` and silently dropped `globals.profile` — while the
 * request itself went through `resolveBaseUrl(globals.baseUrl, globals.profile)`
 * and honoured it. `--profile staging` therefore created a resource on staging
 * and returned a link to production, where the link opens, the dashboard is the
 * wrong org's, and the resource is not there. It reads as a failed write.
 *
 * A call site that is handed `optsWithGlobals()` whole cannot forget half of it,
 * which is why the signature is this and not two optional strings.
 */
export interface DashboardUrlContext {
  /** The global `--dashboard-url`, when one was passed. */
  readonly dashboardUrl?: string;
  /** The global `--profile`, so the link follows the environment the request went to. */
  readonly profile?: string;
  /** The global `--base-url`, so the disagreement check sees the host the request really used. */
  readonly baseUrl?: string;
}

/**
 * The console host for this invocation, trailing slash dropped.
 *
 * ⚠️ SAYS SO WHEN THE LINK IS A GUESS THAT CONTRADICTS THE REQUEST. A profile
 * saved by `auth login --base-url http://localhost:3001` carries half a pair:
 * the request goes to the laptop and the link falls back to the production
 * console, and nothing said so (NEX-6503). The fallback itself stays — it is
 * the documented last resort, and for a profile with no host at all it is the
 * right answer. The warning needs BOTH: nobody typed the link (`env-name`),
 * and the request host's paired console is not it. A typed `--dashboard-url`,
 * whatever it names, is never second-guessed.
 *
 * Stderr through `printWarning`, so a `--json` document stays clean.
 */
export function resolveDashboardHost(context: DashboardUrlContext = {}): string {
  const link = resolveDashboardUrlWithSource(context.dashboardUrl, context.profile);
  const host = link.url.replace(/\/+$/, "");
  if (link.source !== "env-name") return host;

  const request = resolveBaseUrl(context.baseUrl, context.profile).replace(/\/+$/, "");
  const paired = dashboardHostPairedWith(request);
  if (paired === host) return host;

  // debt: one warning per call; dedupe if a list command ever maps a link over rows
  printWarning(
    `Requests go to ${request} but the dashboard link falls back to ${host}.`,
    `Pin it once: nexus auth login${profileFlagFor(context.profile)} --base-url ${request} --dashboard-url ${paired ?? "<the console that serves it>"}`,
    "Or pass --dashboard-url on this command."
  );
  return host;
}

/**
 * The `--profile` half of the hint: the flag as typed, else the stored profile
 * the request resolved through (`NEXUS_PROFILE`, a `.nexusrc`, the active one).
 * Nothing when no stored profile was involved — `--api-key` bypasses them all,
 * and a hint naming a profile that was never read would send the login to the
 * wrong place.
 */
function profileFlagFor(typed: string | undefined): string {
  if (typed) return ` --profile ${typed}`;
  try {
    const resolved = resolveProfile();
    return resolved.source === "override" ? "" : ` --profile ${resolved.name}`;
  } catch {
    return "";
  }
}
