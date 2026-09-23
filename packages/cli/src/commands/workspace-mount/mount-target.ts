import type { WorkspaceKind } from "@agent-nexus/sdk";

/** What `resolveMountTarget` learned about the slug we're about to mount. */
export interface MountTarget {
  /** True when an admin-shared workspace owns this slug. */
  shared: boolean;
  /** True when the calling org owns a workspace with this slug. */
  orgOwned: boolean;
  /** Immutable id of the copy we'll actually mount (the chosen one). */
  workspaceId?: string;
  /**
   * Storage kind of the copy we'll actually mount, and the reason this
   * function reads more than ownership. A CODE workspace is a read-only
   * projection, so mounting it read-write produces a drive that accepts a save
   * and then answers 403 — "Permission denied", naming nothing.
   *
   * Absent when the list couldn't be fetched for this slug, which is NOT the
   * same as "writable": see `resolveMountTarget`'s degradation note.
   */
  kind?: WorkspaceKind;
}

/**
 * What the list call did, for a caller that must tell "could not ask" apart
 * from "asked and the slug is not shared".
 *
 * 🚨 A NULL `target` ALWAYS MEANS THE LIST CALL FAILED. A successful list
 * yields an object on every path, so `target === null` is never "not found" —
 * it is only ever "nobody asked the server". `listError` is that failure,
 * carried out rather than swallowed, so the caller can rethrow it and let the
 * CLI's own taxonomy name the cause. Swallowing it is what made `workspace
 * mount` report a network failure as CLI_UNKNOWN_ERROR.
 */
export type MountTargetResolution = {
  target: MountTarget | null;
  /** The error `workspaces.list()` threw, or `null` when it succeeded. */
  listError: unknown;
};
