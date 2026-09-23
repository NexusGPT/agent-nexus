/**
 * `--watch` — block until a deployment reaches a terminal state, then confirm
 * the app is actually being SERVED before reporting success.
 *
 * This exists because every engagement re-derived the same bash poll loop by
 * hand, and the hand-written ones all shared two defects this folder refuses to
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
 * HEALTHY** — see `wait-for-edge.ts`. Everything else exits non-zero.
 */

import { REFUSED_APPROVALS, TERMINAL_FAILURES } from "./terminal-failures";
import { waitForEdge } from "./wait-for-edge";
import type { WatchIo } from "./watch-io";
import type { WatchOptions } from "./watch-options";
import type { WatchOutcome } from "./watch-outcome";

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
