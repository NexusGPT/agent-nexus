/**
 * THE TWO HOST TABLES `NEXUS_ENV` SELECTS BETWEEN, AND THE ONE KEY THEY SHARE.
 *
 * Declaring them here, apart from the resolvers that read them, is what lets
 * `dashboardHostPairedWith` walk one table backwards and the other forwards
 * without spelling a single host of its own.
 *
 * 🚨 THE TWO MAPS ARE EXPORTED BECAUSE THEIR TWO CANON READERS LIVE IN OTHER
 * FILES — `config-resolve.ts` for the API host, `config-dashboard-url.ts` for
 * the console — AND FOR NO OTHER CALLER. They were private to `config.ts`
 * before it was split, so a third importer resolving a host from a table
 * directly would be a copy of a precedence that neither gate's env-var census
 * can see: those censuses match `NEXUS_BASE_URL` and `NEXUS_ORGANIZATION_ID`
 * textually, and a table read names neither. `config.ts` therefore does NOT
 * re-export them, and `base-url-precedence-is-one-rule.test.ts` censuses this
 * module's importers against a hand-written set of exactly those two files.
 */

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
export const URL_MAP: Record<NexusEnvName, string> = {
  production: "https://api.nexusgpt.io",
  staging: "https://api-staging.gpt.nexus",
  dev: "http://localhost:3001"
};

export const DASHBOARD_URL_MAP: Record<NexusEnvName, string> = {
  production: "https://gpt.nexus",
  staging: "https://staging.gpt.nexus",
  dev: "http://localhost:3000"
};

/** True when `value` names an environment both maps above hold a host for. */
export function isNexusEnvName(value: string): value is NexusEnvName {
  return NEXUS_ENV_NAMES.some((name) => name === value);
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
