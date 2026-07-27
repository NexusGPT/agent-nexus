import { describe, expect, it } from "vitest";

import {
  type WatchApprovalSnapshot,
  type WatchAppSnapshot,
  watchDeployment,
  type WatchDeploymentSnapshot,
  type WatchIo,
  type WatchOptions
} from "./vibe-watch";

const OPTIONS: WatchOptions = {
  deployTimeoutMs: 60_000,
  edgeTimeoutMs: 30_000,
  pollIntervalMs: 1_000
};

const DEPLOYMENT = (status: string): WatchDeploymentSnapshot => ({
  id: "dep-1",
  status,
  versionNumber: 7,
  errorReason: status === "FAILED" ? "container exceeded its restart limit" : null
});

const APP = (over: Partial<WatchAppSnapshot> = {}): WatchAppSnapshot => ({
  publicUrl: "https://greeter.acme.gpt.nexus",
  edgeReachability: "ROUTED",
  edgeReachabilityAt: null,
  edgeReachabilityDetail: null,
  ...over
});

/**
 * A clock that only moves when the watcher sleeps. Every test is therefore
 * deterministic and instant — including the timeout cases, which would otherwise
 * have to actually wait out the timeout they are asserting.
 */
function makeIo(
  deploymentStatuses: readonly string[],
  apps: readonly WatchAppSnapshot[],
  approval: WatchApprovalSnapshot | null = null
): WatchIo & { clock: () => number; approvalReads: () => number } {
  let clockMs = 1_000_000;
  let deploymentIndex = 0;
  let appIndex = 0;
  let approvalIndex = 0;

  return {
    readApproval: () => {
      approvalIndex += 1;
      return Promise.resolve(approval);
    },
    approvalReads: () => approvalIndex,
    readDeployment: () => {
      const status =
        deploymentStatuses[Math.min(deploymentIndex, deploymentStatuses.length - 1)] ?? "BUILDING";
      deploymentIndex += 1;
      return Promise.resolve(DEPLOYMENT(status));
    },
    readApp: () => {
      const app = apps[Math.min(appIndex, apps.length - 1)] ?? APP();
      appIndex += 1;
      return Promise.resolve(app);
    },
    sleep: (ms) => {
      clockMs += ms;
      return Promise.resolve();
    },
    now: () => clockMs,
    clock: () => clockMs
  };
}

/**
 * Two SERVER instants. Nothing here is compared against the watcher's own clock
 * — freshness is `NEW > BASELINE`, both stamped by the same server — so these
 * are deliberately far from the fake clock's 1_000_000 in both directions, and
 * the tests still pass.
 */
const BASELINE_AT = new Date(500_000).toISOString();
const NEWER_AT = new Date(600_000).toISOString();

describe("watchDeployment", () => {
  it("succeeds only once the edge reports a NEWER observation than the app carried", async () => {
    const io = makeIo(
      ["BUILDING", "DEPLOYING", "HEALTHY"],
      [
        // baseline read, taken the moment HEALTHY is seen
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: BASELINE_AT }),
        APP({ edgeReachability: "UNROUTED", edgeReachabilityAt: NEWER_AT }),
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: NEWER_AT })
      ]
    );
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("served");
  });

  it("does not accept the ROUTED the app was ALREADY carrying", async () => {
    // The trap the whole check exists for: a live app carries its previous
    // version's ROUTED, so accepting the value alone confirms a rollout that
    // never reached the edge. Same value, same timestamp, forever.
    const io = makeIo(
      ["HEALTHY"],
      [APP({ edgeReachability: "ROUTED", edgeReachabilityAt: BASELINE_AT })]
    );
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("edge-unconfirmed");
  });

  it("never compares an edge timestamp against the client clock", async () => {
    // Both instants are DECADES behind the fake clock. Under the old
    // client-vs-server comparison a fresh ROUTED could never satisfy the test,
    // and the run would always time out. Server-to-server, it passes.
    const io = makeIo(
      ["HEALTHY"],
      [
        APP({ edgeReachability: "UNROUTED", edgeReachabilityAt: BASELINE_AT }),
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: NEWER_AT })
      ]
    );
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("served");
  });

  it("accepts the first real observation when the edge had never seen the app", async () => {
    const io = makeIo(
      ["HEALTHY"],
      [
        APP({ edgeReachability: null, edgeReachabilityAt: null }),
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: NEWER_AT })
      ]
    );
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("served");
  });

  it("treats a never-observed edge as unconfirmed, never as healthy", async () => {
    const io = makeIo(["HEALTHY"], [APP({ edgeReachability: null, edgeReachabilityAt: null })]);
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("edge-unconfirmed");
  });

  it("treats an unparseable edge timestamp as unconfirmed", async () => {
    const io = makeIo(
      ["HEALTHY"],
      [
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: BASELINE_AT }),
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: "not-a-date" })
      ]
    );
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("edge-unconfirmed");
  });

  it("needs no edge confirmation for an app with no public URL", async () => {
    // Nothing routes it, so there is nothing for the edge to confirm — waiting
    // would time out on a deployment that is entirely fine.
    const io = makeIo(["HEALTHY"], [APP({ publicUrl: null, edgeReachability: null })]);
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("served");
  });

  it("reports a rollback that happens AFTER healthy as failed, not as an edge problem", async () => {
    // HEALTHY is not final: a running instance that starts failing its check is
    // rolled back. Blaming the edge would hand a script the wrong reason.
    const io = makeIo(
      ["HEALTHY", "ROLLED_BACK"],
      [APP({ edgeReachability: "UNROUTED", edgeReachabilityAt: BASELINE_AT })]
    );
    const outcome = await watchDeployment(io, OPTIONS, () => {});
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.deployment.status).toBe("ROLLED_BACK");
  });

  it("reports a supersede that happens AFTER healthy as superseded", async () => {
    const io = makeIo(
      ["HEALTHY", "SUPERSEDED"],
      [APP({ edgeReachability: "UNROUTED", edgeReachabilityAt: BASELINE_AT })]
    );
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("superseded");
  });

  it("still reports served when the edge confirms in the same pass as a supersede", async () => {
    // It DID work. The edge is checked before the deployment re-read precisely
    // so a rollout that reached the edge is never reported as a failure.
    const io = makeIo(
      ["HEALTHY", "SUPERSEDED"],
      [
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: BASELINE_AT }),
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: NEWER_AT })
      ]
    );
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("served");
  });

  it("reports a failed deployment with its reason", async () => {
    const io = makeIo(["BUILDING", "FAILED"], [APP()]);
    const outcome = await watchDeployment(io, OPTIONS, () => {});
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.deployment.errorReason).toBe("container exceeded its restart limit");
    }
  });

  it("treats ROLLED_BACK before healthy as a failure too", async () => {
    const io = makeIo(["DEPLOYING", "ROLLED_BACK"], [APP()]);
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("failed");
  });

  it("reports SUPERSEDED separately — nothing broke, but it will never go live", async () => {
    const io = makeIo(["DEPLOYING", "SUPERSEDED"], [APP()]);
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("superseded");
  });

  it("reports a REJECTED gate at once instead of waiting out the deploy timeout", async () => {
    // The deployment stays AWAITING_APPROVAL forever on a reject — the backend
    // says so ("REJECTs leave the deployment where it is"). Reading only the
    // deployment would burn the whole deploy budget and then report a timeout,
    // which is the wrong reason delivered as slowly as possible.
    const io = makeIo(["AWAITING_APPROVAL"], [APP()], { status: "REJECTED" });
    const outcome = await watchDeployment(io, OPTIONS, () => {});
    expect(outcome.kind).toBe("approval-refused");
    if (outcome.kind === "approval-refused") {
      expect(outcome.approval.status).toBe("REJECTED");
      // Decided on the first pass, not after edgeTimeoutMs or deployTimeoutMs.
      expect(io.clock()).toBe(1_000_000);
    }
  });

  it("reports an EXPIRED gate the same way — nobody is coming to approve it", async () => {
    const io = makeIo(["AWAITING_APPROVAL"], [APP()], { status: "EXPIRED" });
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("approval-refused");
  });

  it("keeps waiting on a PENDING gate — that is the case a reviewer can still act on", async () => {
    const io = makeIo(
      ["AWAITING_APPROVAL", "DEPLOYING", "HEALTHY"],
      [
        APP({ edgeReachability: "UNROUTED", edgeReachabilityAt: BASELINE_AT }),
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: NEWER_AT })
      ],
      { status: "PENDING" }
    );
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("served");
  });

  it("never asks about approvals for a deployment that was never gated", async () => {
    // The read costs a request per poll, and an ungated deploy 404s on it.
    const io = makeIo(
      ["BUILDING", "DEPLOYING", "HEALTHY"],
      [
        APP({ edgeReachability: "UNROUTED", edgeReachabilityAt: BASELINE_AT }),
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: NEWER_AT })
      ]
    );
    await watchDeployment(io, OPTIONS, () => {});
    expect(io.approvalReads()).toBe(0);
  });

  it("treats a null approval as ungated rather than refused", async () => {
    // 404 from the approval endpoint means "no gate", which is a fact about the
    // deployment — it must not read as a decision nobody made.
    const io = makeIo(["AWAITING_APPROVAL"], [APP()], null);
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("deploy-timeout");
  });

  it("keeps waiting through AWAITING_APPROVAL — a reviewer can still approve", async () => {
    const io = makeIo(
      ["AWAITING_APPROVAL", "AWAITING_APPROVAL", "DEPLOYING", "HEALTHY"],
      [
        APP({ edgeReachability: "UNROUTED", edgeReachabilityAt: BASELINE_AT }),
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: NEWER_AT })
      ]
    );
    expect((await watchDeployment(io, OPTIONS, () => {})).kind).toBe("served");
  });

  it("gives up on a deployment that never terminates, and says so as a timeout", async () => {
    const io = makeIo(["BUILDING"], [APP()]);
    const outcome = await watchDeployment(io, OPTIONS, () => {});
    expect(outcome.kind).toBe("deploy-timeout");
    if (outcome.kind === "deploy-timeout") {
      expect(outcome.waitedMs).toBeGreaterThanOrEqual(OPTIONS.deployTimeoutMs);
      // Still BUILDING — the outcome must not claim the deploy failed.
      expect(outcome.deployment.status).toBe("BUILDING");
    }
  });

  it("bounds the edge wait separately from the deploy wait", async () => {
    const io = makeIo(
      ["HEALTHY"],
      [APP({ edgeReachability: "UNROUTED", edgeReachabilityAt: BASELINE_AT })]
    );
    const outcome = await watchDeployment(io, OPTIONS, () => {});
    expect(outcome.kind).toBe("edge-unconfirmed");
    if (outcome.kind === "edge-unconfirmed") {
      expect(outcome.waitedMs).toBeGreaterThanOrEqual(OPTIONS.edgeTimeoutMs);
      // The deploy budget is untouched by the edge wait: an edge that never
      // confirms must not be reported as a deployment that never finished.
      expect(outcome.waitedMs).toBeLessThan(OPTIONS.deployTimeoutMs);
    }
  });

  it("announces each distinct status once, not once per poll", async () => {
    const seen: string[] = [];
    const io = makeIo(
      ["BUILDING", "BUILDING", "BUILDING", "DEPLOYING", "HEALTHY"],
      [
        APP({ edgeReachability: "UNROUTED", edgeReachabilityAt: BASELINE_AT }),
        APP({ edgeReachability: "ROUTED", edgeReachabilityAt: NEWER_AT })
      ]
    );
    await watchDeployment(io, OPTIONS, (s) => seen.push(s));
    expect(seen).toEqual(["BUILDING", "DEPLOYING", "HEALTHY"]);
  });
});
