import type {
  WatchApprovalSnapshot,
  WatchAppSnapshot,
  WatchDeploymentSnapshot
} from "./watch-snapshots";

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
