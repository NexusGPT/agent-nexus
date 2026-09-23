export interface WatchOptions {
  /** Give up waiting for a terminal deployment status after this long. */
  deployTimeoutMs: number;
  /** Give up waiting for the edge to confirm, AFTER the deployment went healthy. */
  edgeTimeoutMs: number;
  pollIntervalMs: number;
}

export const WATCH_DEFAULTS: WatchOptions = {
  // Generous: a cold build (clone, install, image push) legitimately runs for
  // minutes, and a watch that gives up early is worse than no watch — it reports
  // a failure that did not happen.
  deployTimeoutMs: 15 * 60_000,
  // The agent probes the edge on its reconcile pass (~15s) and the probe is
  // throttled, so confirmation lags HEALTHY by a pass or two. Minutes, not
  // seconds.
  edgeTimeoutMs: 3 * 60_000,
  pollIntervalMs: 3_000
};
