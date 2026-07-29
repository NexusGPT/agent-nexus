/**
 * `--watch` — block until a deployment reaches a terminal state, then confirm
 * the app is actually being SERVED before reporting success.
 *
 * This exists because every engagement re-derived the same bash poll loop by
 * hand, and the hand-written ones all shared two defects this module refuses to
 * reproduce:
 *
 *   - they stopped at `HEALTHY`, which is an ALLOCATION verdict. It is reached
 *     from a Nomad-native check against the container's port; the request never
 *     traverses the tenant's edge. An app can be HEALTHY and unreachable.
 *   - they treated "the loop ended" as "the deploy worked", so a timeout, a
 *     rollback and a success were the same exit code.
 *
 * Success here therefore requires BOTH: a terminal `HEALTHY`, and the tenant's
 * own edge reporting `ROUTED` for the app **from an observation made after that
 * HEALTHY** — see {@link waitForEdge}. Everything else exits non-zero.
 */

import { color, isJsonMode } from "../output";

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

export interface WatchDeploymentSnapshot {
  id: string;
  status: string;
  versionNumber: number;
  errorReason: string | null;
}

export interface WatchAppSnapshot {
  publicUrl: string | null;
  edgeReachability: WatchEdgeReachability | null;
  edgeReachabilityAt: string | null;
  edgeReachabilityDetail: string | null;
}

/** The gate on a deployment awaiting review — `null` when it is ungated. */
export interface WatchApprovalSnapshot {
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
}

/** The reads the watcher needs, injected so it can be tested without HTTP. */
export interface WatchIo {
  readDeployment(): Promise<WatchDeploymentSnapshot>;
  readApp(): Promise<WatchAppSnapshot>;
  /**
   * The deployment's approval request, or `null` if it has none. Consulted ONLY
   * while the deployment is `AWAITING_APPROVAL`, so an ungated deploy never pays
   * for the request.
   */
  readApproval(): Promise<WatchApprovalSnapshot | null>;
  /** Injected so tests advance time instead of spending it. */
  sleep(ms: number): Promise<void>;
  /** Injected for the same reason — the watcher compares observation instants. */
  now(): number;
}

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

/**
 * Why the watch ended. Only `served` is a success — the caller exits non-zero on
 * every other outcome, including the ones where nothing is known to be broken.
 * "We could not confirm it" and "it works" must not share an exit code.
 */
export type WatchOutcome =
  | { kind: "served"; deployment: WatchDeploymentSnapshot; app: WatchAppSnapshot }
  | { kind: "failed"; deployment: WatchDeploymentSnapshot }
  | { kind: "superseded"; deployment: WatchDeploymentSnapshot }
  | { kind: "displaced"; deployment: WatchDeploymentSnapshot }
  | {
      kind: "approval-refused";
      deployment: WatchDeploymentSnapshot;
      approval: WatchApprovalSnapshot;
    }
  | { kind: "deploy-timeout"; deployment: WatchDeploymentSnapshot; waitedMs: number }
  | {
      kind: "edge-unconfirmed";
      deployment: WatchDeploymentSnapshot;
      app: WatchAppSnapshot;
      waitedMs: number;
    };

const TERMINAL_FAILURES: ReadonlySet<string> = new Set(["FAILED", "ROLLED_BACK"]);

/**
 * An approval outcome that will never become a deployment. The gate itself is
 * terminal even though the DEPLOYMENT's status is not — see `watchDeployment`.
 */
const REFUSED_APPROVALS: ReadonlySet<string> = new Set(["REJECTED", "EXPIRED"]);

/**
 * Poll until the deployment leaves the in-flight states, then hand off to the
 * edge confirmation.
 *
 * `AWAITING_APPROVAL` is deliberately not terminal — a reviewer can still
 * approve — but it is announced, because a watch sitting silent on a gated
 * deploy looks identical to one that has wedged.
 *
 * **A refused gate has to be read off the approval request, not the deployment.**
 * `RecordVibeApprovalDecisionUseCase` advances the deployment only on APPROVE;
 * its own comment is "REJECTs leave the deployment where it is for the rollback
 * path / admin investigation". So a rejected or expired deploy sits in
 * `AWAITING_APPROVAL` forever, and a watcher reading only the deployment would
 * wait out the full deploy timeout and then report a timeout — the wrong reason,
 * handed over after the longest possible delay, for something that was decided
 * immediately.
 */
export async function watchDeployment(
  io: WatchIo,
  options: WatchOptions,
  onTransition: (status: string) => void
): Promise<WatchOutcome> {
  const startedAt = io.now();
  let lastStatus: string | null = null;

  for (;;) {
    const deployment = await io.readDeployment();
    if (deployment.status !== lastStatus) {
      lastStatus = deployment.status;
      onTransition(deployment.status);
    }

    if (deployment.status === "HEALTHY") {
      // Baseline the edge verdict the app carries RIGHT NOW, before waiting on a
      // new one. See `waitForEdge` — this read is what keeps the freshness test
      // a comparison between two server instants.
      const baseline = await io.readApp();
      return waitForEdge(io, options, deployment, baseline, onTransition);
    }
    if (TERMINAL_FAILURES.has(deployment.status)) return { kind: "failed", deployment };
    // A different deployment took over this app. Nothing is broken, but the
    // thing being watched will never become live, so this cannot exit clean.
    if (deployment.status === "SUPERSEDED") return { kind: "superseded", deployment };
    // Same verdict, different history, and the difference is why this is not
    // folded into the branch above: a superseded version served traffic first,
    // a displaced one never did. Returning here also stops the watch from
    // sitting out the full deploy timeout on a deployment whose outcome is
    // already settled — which is the whole complaint this status answers.
    if (deployment.status === "DISPLACED") return { kind: "displaced", deployment };

    if (deployment.status === "AWAITING_APPROVAL") {
      const approval = await io.readApproval();
      if (approval !== null && REFUSED_APPROVALS.has(approval.status)) {
        return { kind: "approval-refused", deployment, approval };
      }
    }

    const waitedMs = io.now() - startedAt;
    if (waitedMs >= options.deployTimeoutMs) {
      return { kind: "deploy-timeout", deployment, waitedMs };
    }
    await io.sleep(options.pollIntervalMs);
  }
}

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
async function waitForEdge(
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

/**
 * An ISO-8601 instant, or `null` for anything unusable. Every way of failing to
 * parse resolves to "not observed". On the CURRENT reading that fails the
 * freshness test, which is the safe direction — the alternative is confirming a
 * rollout on a timestamp we could not read. On the BASELINE it is equally safe
 * in the other direction: an unreadable baseline means any real observation
 * counts as newer, and a stale `ROUTED` cannot have a readable timestamp while
 * the baseline that captured that same value does not.
 */
function parseInstant(raw: string | null): number | null {
  if (raw === null || raw.length === 0) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Render the outcome and return the process exit code. Success is `0` and
 * nothing else is: a caller scripting `nexus vibe deploy --watch` must be able
 * to branch on the exit code alone.
 */
export function reportWatchOutcome(outcome: WatchOutcome, appId: string): number {
  if (isJsonMode()) {
    // The ONLY document a watched run writes to stdout — the trigger printer is
    // suppressed upstream when a watch follows, because two documents on one
    // stream is not parseable by `jq` and the whole point of --json is that it
    // is. `kind` is dropped in favour of `outcome`, rather than appearing twice.
    const { kind, ...rest } = outcome;
    console.log(JSON.stringify({ outcome: kind, ...rest }, null, 2));
    return kind === "served" ? 0 : 1;
  }

  switch (outcome.kind) {
    case "served":
      console.log(
        color.green("✓") +
          ` v${String(outcome.deployment.versionNumber)} is healthy and served` +
          (outcome.app.publicUrl === null ? " (no public URL — in-cluster only)" : "")
      );
      if (outcome.app.publicUrl !== null) console.log(`  ${outcome.app.publicUrl}`);
      return 0;

    case "failed":
      console.log(
        color.red("✗") +
          ` v${String(outcome.deployment.versionNumber)} ${outcome.deployment.status.toLowerCase().replace("_", " ")}`
      );
      if (outcome.deployment.errorReason !== null) {
        console.log(`  ${outcome.deployment.errorReason}`);
      }
      console.log(
        color.dim(`  Build log: nexus vibe deployments get ${appId} ${outcome.deployment.id}`)
      );
      return 1;

    case "superseded":
      console.log(
        color.yellow("!") +
          ` v${String(outcome.deployment.versionNumber)} was superseded by a newer deployment — it will never go live.`
      );
      return 1;

    case "displaced":
      // Says "never went live", not "was superseded". Both end the watch the
      // same way, but only one of them served, and someone reading this line is
      // deciding whether anything needs looking at. Not "never started" — a
      // deploy already handed to the executor may have started before it lost.
      console.log(
        color.yellow("!") +
          ` v${String(outcome.deployment.versionNumber)} never went live — a newer deployment took over first. Nothing was interrupted.`
      );
      return 1;

    case "approval-refused":
      console.log(
        color.red("✗") +
          ` v${String(outcome.deployment.versionNumber)} approval ${outcome.approval.status.toLowerCase()} — it will never deploy.`
      );
      // Says the quiet part: the deployment row still reads AWAITING_APPROVAL
      // and always will, so someone reading it later is not looking at a deploy
      // that is still waiting on them.
      console.log(
        color.dim(
          "  The deployment stays AWAITING_APPROVAL by design; the gate is what was decided."
        )
      );
      return 1;

    case "deploy-timeout":
      // NOT a failure claim. The deploy may still be converging; what is true is
      // that we stopped looking, and saying so is the entire contract.
      console.log(
        color.yellow("!") +
          ` still ${outcome.deployment.status} after ${formatDuration(outcome.waitedMs)} — stopped waiting.`
      );
      console.log(
        color.dim(`  Still running: nexus vibe deployments get ${appId} ${outcome.deployment.id}`)
      );
      return 1;

    case "edge-unconfirmed":
      console.log(
        color.yellow("!") +
          ` v${String(outcome.deployment.versionNumber)} is HEALTHY, but the edge has not confirmed it is served (${formatDuration(outcome.waitedMs)}).`
      );
      console.log(
        `  Last edge verdict: ${outcome.app.edgeReachability ?? "never observed"}` +
          (outcome.app.edgeReachabilityDetail === null
            ? ""
            : ` — ${outcome.app.edgeReachabilityDetail}`)
      );
      // HEALTHY is an allocation verdict from a check that never crosses the
      // edge, so this is exactly the state where the two can disagree. Reporting
      // it as success is the failure this whole module exists to prevent.
      console.log(color.dim("  HEALTHY means the container passed its own check, not that a"));
      console.log(color.dim("  visitor can reach it. Check the app's public URL directly."));
      return 1;
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}m${String(seconds % 60)}s`;
}
