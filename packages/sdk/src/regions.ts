/**
 * THE NEXUS DEPLOYMENTS A CLIENT CAN TARGET BY NAME, AND THE API HOST OF EACH.
 *
 * One table, owned here, because this is the package the other two clients
 * already depend on: `@agent-nexus/cli` and `@agent-nexus/mcp-server` bundle
 * this module rather than spelling a host of their own. Changing where a region
 * lives is a one-line edit to {@link NEXUS_REGION_BASE_URLS}.
 *
 * ── PRECEDENCE, IDENTICAL IN ALL THREE CLIENTS ───────────────────────────────
 *
 *   explicit base URL  >  region  >  NEXUS_BASE_URL  >  the EU default
 *
 * A region is a name for a base URL, so an explicit URL — the more specific of
 * the two — wins when both are given. Both are typed into THIS call, so both
 * outrank an environment variable exported once into a shell.
 *
 * ── WHY THERE IS NO `NEXUS_REGION` ENVIRONMENT VARIABLE ──────────────────────
 *
 * `NEXUS_BASE_URL` already selects a deployment from the environment. A second
 * variable for the same choice is a second precedence to keep in agreement with
 * the first, and the two disagreeing is how a request lands in a deployment the
 * user did not pick. Export `NEXUS_BASE_URL=<the region's host>` instead.
 */

/**
 * API host per region.
 *
 * `eu` is the original deployment and the default when nothing is selected —
 * `DEFAULT_NEXUS_BASE_URL` below IS this row, so the no-option behaviour cannot
 * drift from the table.
 *
 * `us` is the planned US deployment. Its host does not serve traffic yet; it is
 * declared so callers can be pointed at it the day it does, and so that day's
 * change, if the host moves, is this one line.
 */
export const NEXUS_REGION_BASE_URLS = {
  eu: "https://api.nexusgpt.io",
  us: "https://api.us.gpt.nexus"
} as const;

/** A region {@link NEXUS_REGION_BASE_URLS} holds a host for. */
export type NexusRegion = keyof typeof NEXUS_REGION_BASE_URLS;

/** Every accepted region name, in declaration order — for help text and refusals. */
export const NEXUS_REGIONS = Object.keys(NEXUS_REGION_BASE_URLS) as readonly NexusRegion[];

/** The region a client targets when no base URL, region or env var selects one. */
export const DEFAULT_NEXUS_REGION: NexusRegion = "eu";

/** The API host a client targets when nothing selects one. */
export const DEFAULT_NEXUS_BASE_URL: string = NEXUS_REGION_BASE_URLS[DEFAULT_NEXUS_REGION];

/**
 * True when `value` names a region {@link NEXUS_REGION_BASE_URLS} serves.
 *
 * Case-SENSITIVE and untrimmed on purpose: each client refuses an unknown name
 * rather than resolving it, and `"US"` reaching the default deployment quietly
 * is the defect a refusal exists to prevent.
 */
export function isNexusRegion(value: string): value is NexusRegion {
  return Object.prototype.hasOwnProperty.call(NEXUS_REGION_BASE_URLS, value);
}
