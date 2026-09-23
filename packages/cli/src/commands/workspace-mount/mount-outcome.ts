import type { MountRecord } from "../../mount-registry";

export interface MountOutcome {
  /** The engine's half of the registry row; the caller adds the scope's. */
  readonly record: MountRecord;
  /** True when a read-write request was granted read: the drive is read-only. */
  readonly grantedReadOnly: boolean;
  /**
   * Saves a previous direct mount left in the cache, now uploading; null on
   * other engines, {@link PENDING_UPLOADS_UNKNOWN} when the cache cannot be read.
   */
  readonly pendingUploads: number | null;
  /**
   * The acting organization's name as the SERVER answered it during the mint;
   * null on the gateway engines, which mint nothing and so learn nothing. The
   * caller prefers it over the profile's saved copy when stamping the registry
   * row, because that copy is written at sign-in and never refreshed.
   */
  readonly serverOrgName: string | null;
}
