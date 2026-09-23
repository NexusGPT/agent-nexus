import { parseInstant } from "./parse-instant";
import { TERMINAL_FAILURES } from "./terminal-failures";
import type { WatchIo } from "./watch-io";
import type { WatchOptions } from "./watch-options";
import type { WatchOutcome } from "./watch-outcome";
import type { WatchAppSnapshot, WatchDeploymentSnapshot } from "./watch-snapshots";

/**
 * Wait for the tenant's edge to report `ROUTED` **from an observation newer than
 * the one the app already carried** when the deployment went healthy.
 *
 * `edgeReachability` is a stored verdict about the APP, not about this
 * deployment: an app that was already live carries a `ROUTED` from its previous
 * version, so accepting the value alone would confirm every rollout instantly,
 * including one that never reached the edge. Requiring a NEWER observation is
 * what makes this a check rather than a formality.
 *
 * **`baseline` is why that comparison is between two server instants.** The
 * obvious version — "is `edgeReachabilityAt` later than the moment I saw
 * HEALTHY?" — compares a server timestamp against the CLIENT's wall clock, and
 * fails in both directions under ordinary skew: a client running behind accepts
 * the previous version's `ROUTED` as fresh, and one running ahead can never
 * satisfy the test at all. Baselining the value the app already carried removes
 * the client clock from the comparison; it is only used to measure elapsed
 * time, which is a single-clock question.
 *
 * A null baseline means the edge had never observed this app, so any real
 * observation is newer.
 *
 * **HEALTHY is not final, so the deployment is re-read every pass.** A running
 * instance that starts failing its check is ROLLED_BACK, and a newer deploy
 * SUPERSEDES this one — both reachable during this wait. Reporting either as
 * `edge-unconfirmed` would blame the edge for a rollout that actually failed,
 * and hand a script the wrong reason to act on.
 *
 * An app with no public URL is not served through the edge at all, so there is
 * nothing to confirm and the healthy verdict is the whole answer.
 */
export async function waitForEdge(
  io: WatchIo,
  options: WatchOptions,
  healthy: WatchDeploymentSnapshot,
  baseline: WatchAppSnapshot,
  onTransition: (status: string) => void
): Promise<WatchOutcome> {
  if (baseline.publicUrl === null) return { kind: "served", deployment: healthy, app: baseline };

  const baselineAt = parseInstant(baseline.edgeReachabilityAt);
  const startedAt = io.now();
  let announced = false;
  let lastStatus = healthy.status;

  for (;;) {
    const app = await io.readApp();

    const observedAt = parseInstant(app.edgeReachabilityAt);
    const newer = observedAt !== null && (baselineAt === null || observedAt > baselineAt);
    if (newer && app.edgeReachability === "ROUTED") {
      return { kind: "served", deployment: healthy, app };
    }

    // Re-read AFTER the edge check, so a rollout that became served in the same
    // pass it was superseded is still reported as served — it did work.
    const deployment = await io.readDeployment();
    if (deployment.status !== lastStatus) {
      lastStatus = deployment.status;
      onTransition(deployment.status);
    }
    if (TERMINAL_FAILURES.has(deployment.status)) return { kind: "failed", deployment };
    if (deployment.status === "SUPERSEDED") return { kind: "superseded", deployment };

    if (!announced) {
      announced = true;
      onTransition("HEALTHY — waiting for the edge to confirm it is being served");
    }

    const waitedMs = io.now() - startedAt;
    if (waitedMs >= options.edgeTimeoutMs) {
      return { kind: "edge-unconfirmed", deployment, app, waitedMs };
    }
    await io.sleep(options.pollIntervalMs);
  }
}
