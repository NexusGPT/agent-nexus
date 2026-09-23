import type { MountAccess } from "../mount-registry";
import type { RefreshOutcome, RefreshRecord } from "./refresh-record";

/**
 * What `session.json` holds. `version: 1` is a READ contract: a later CLI that
 * changes the shape bumps it and keeps reading this one, because the file
 * outlives the binary that wrote it.
 *
 * `profile`, `baseUrl` and `orgId` are the pins that make a refresh act on the
 * tenant the mount was made for: the helper resolves the API key through the
 * named profile and hands `orgId` to the client as an override, so neither
 * `auth use-org` nor an exported `NEXUS_ORGANIZATION_ID` after mounting can
 * re-point it. All three are REQUIRED and non-empty — an absent pin would fall
 * through to whatever the shell or the active profile selects at refresh time,
 * which is the re-pointing the pin exists to refuse. The mint route resolves an
 * organization on every call, so there is always one to record. The API key
 * itself is never copied here — `config.json` stays its only home.
 */
export interface MountSession {
  readonly version: 1;
  readonly mountId: string;
  readonly profile: string;
  readonly baseUrl: string;
  /** The organization the mount was minted under, as the profile resolved it then. */
  readonly orgId: string;
  readonly workspace: {
    readonly id: string;
    readonly slug: string;
    readonly shared: boolean;
  };
  /** The access the server GRANTED at mount time — the floor a refresh must meet. */
  readonly access: MountAccess;
  /** The Finder label the drive was mounted with; the notification title. */
  readonly volumeName: string;
  /**
   * No bucket, prefix or region: rclone holds those in its process environment
   * from mount time, and a refresh changes none of them. The file carries only
   * what the helper needs to mint again and to hand the triplet back.
   */
  readonly credentials: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken: string;
  };
  /** ISO 8601 — when AWS stops honouring the triplet. */
  readonly expiresAt: string;
  /** ISO 8601 — when the triplet was minted. */
  readonly mintedAt: string;
  readonly lastRefresh?: RefreshRecord;
  /**
   * When each outcome was last announced on the desktop, keyed BY OUTCOME.
   * A single "last notification" record cannot debounce anything: a
   * transition is by definition to the other outcome, so the record always
   * names the outcome that is not the one about to be announced. Keeping one
   * instant per outcome is what lets a repeated ok→failed inside
   * {@link NOTIFICATION_DEBOUNCE_MS} stay quiet.
   */
  readonly lastNotified?: NotifiedAt;
}

/** ISO 8601 instants, one per outcome that has ever been announced. */
export type NotifiedAt = Partial<Record<RefreshOutcome, string>>;
