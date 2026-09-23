/**
 * The three schema-mirrored unions the watcher reasons over.
 *
 * Together because they are one responsibility — the vocabulary this package
 * shares with `VibeDeploymentStatus`, `VibeAppVisibility` and the edge prober's
 * verdict — and because a rename upstream should be ONE place to repair here.
 */

/** Lifecycle of one deployment — mirrors `VibeDeploymentStatus` in the schema. */
export type WatchDeploymentStatus =
  | "BUILDING"
  | "AWAITING_APPROVAL"
  | "DEPLOYING"
  | "HEALTHY"
  | "FAILED"
  | "ROLLED_BACK"
  | "SUPERSEDED"
  | "DISPLACED";

/**
 * What the tenant's edge last said about the app's public host. `null` means
 * NEVER OBSERVED — the probe only asks about a healthy, settled deployment — and
 * is never treated as a verdict.
 */
export type WatchEdgeReachability =
  | "ROUTED"
  | "UNROUTED"
  | "UNAVAILABLE"
  | "NO_SUCH_APP"
  | "UNKNOWN";

/** Who may reach the deployed app — mirrors `VibeAppVisibility` in the schema. */
export type WatchAppVisibility = "PRIVATE" | "PUBLIC";
