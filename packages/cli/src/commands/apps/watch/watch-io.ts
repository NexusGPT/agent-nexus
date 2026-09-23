import type {
  WatchApprovalSnapshot,
  WatchAppSnapshot,
  WatchDeploymentSnapshot
} from "./watch-snapshots";

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
