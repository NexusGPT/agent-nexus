import type { RefreshFailureReason } from "./refresh-record";

/** The names a message may cite. Never a bucket, a prefix or a mount id. */
export interface RefreshContext {
  readonly slug: string;
  readonly profile: string;
}

export interface RefreshFailureText {
  /** A short headline — the notification's subtitle and the status column's word. */
  readonly title: string;
  /** The notification body: what happened and what to do, for a person at a desk. */
  readonly body: (ctx: RefreshContext) => string;
  /** The `status` column's fix and the helper's stderr line, for a person at a terminal. */
  readonly statusHint: (ctx: RefreshContext) => string;
  /** True when the next click may succeed on its own, so `status` stays exit 0. */
  readonly transient: boolean;
}

/**
 * One row per reason, and ONE table: the notification, the `status` column and
 * the helper's stderr all read from here, so the three surfaces cannot tell a
 * user three different stories about one failure. `satisfies` over the closed
 * union means a reason added to the union does not compile until it has a row.
 */
/** Two reasons share the offline story; two share the gone-workspace story. Spelled once each. */
const CANT_REACH_NEXUS = {
  title: "Can't reach Nexus",
  body: () =>
    "Can't reach Nexus to renew access. Files will show errors until you're back online. " +
    "Unsaved changes upload on their own once you are."
} as const;
const WORKSPACE_GONE_BODY = ({ slug }: RefreshContext): string =>
  `This workspace was deleted or replaced. Run: nexus workspace unmount ${slug}`;

export const REFRESH_FAILURE_TABLE = {
  "not-authenticated": {
    title: "Access expired",
    body: ({ profile }) =>
      "Access expired. Files will show errors until you sign in again. In Terminal run: " +
      `nexus auth login --profile ${profile}, then open the folder again.`,
    statusHint: ({ profile, slug }) =>
      `not signed in — run: nexus auth login --profile ${profile} (keep this profile name). ` +
      "The drive itself recovers on your next click. THIS LINE DOES NOT: it is the last " +
      "renewal's own record, and only a renewal rewrites it — so `status` keeps reporting " +
      `the failure, and keeps exiting non-zero, until the drive is next used. Run: nexus workspace remount ${slug} to clear it now.`,
    transient: false
  },
  "connection-failed": {
    ...CANT_REACH_NEXUS,
    statusHint: () =>
      "cannot reach Nexus — retries on your next click. Unsent saves upload on their own once you are online.",
    transient: true
  },
  "timed-out": {
    ...CANT_REACH_NEXUS,
    statusHint: () =>
      "Nexus did not answer in time — retries on your next click. Unsent saves upload on their own once it does.",
    transient: true
  },
  "not-found": {
    title: "Workspace gone",
    body: WORKSPACE_GONE_BODY,
    statusHint: ({ slug }) =>
      `Nexus no longer serves "${slug}" to this key (deleted, or your access was narrowed) — ` +
      `run: nexus workspace unmount ${slug}`,
    transient: false
  },
  "workspace-replaced": {
    title: "Workspace replaced",
    body: WORKSPACE_GONE_BODY,
    statusHint: ({ slug }) =>
      `a different workspace now answers to "${slug}" — the drive stays on the old one. ` +
      `Run: nexus workspace unmount ${slug}, then mount it again`,
    transient: false
  },
  "access-downgraded": {
    title: "Write access removed",
    body: ({ slug }) =>
      "Your write access was removed. Changes saved from now on will NOT upload. " +
      `Run: nexus workspace remount ${slug}`,
    statusHint: ({ slug }) =>
      `your write access to "${slug}" was removed — run: nexus workspace remount ${slug} ` +
      "(it comes back read-only). Files saved since then will not upload; copy them out first.",
    transient: false
  },
  "remote-error": {
    title: "Nexus answered with an error",
    body: () =>
      "Nexus answered with an error while renewing access. Files will show errors until it " +
      "recovers; check with: nexus workspace status",
    statusHint: () =>
      "Nexus answered with an error — retry later, and check with: nexus workspace status",
    transient: false
  },
  "local-failed": {
    title: "Could not save access",
    body: () => "Nexus could not save its access file. Run: nexus workspace status",
    statusHint: ({ slug }) =>
      "the access file could not be written — check free space and ownership under " +
      `~/.nexus-mcp, then run: nexus workspace remount ${slug}`,
    transient: false
  }
} as const satisfies Record<RefreshFailureReason, RefreshFailureText>;

/**
 * The one gate from a string in a file to the closed union. Answered off the
 * table rather than a second list: `satisfies Record<RefreshFailureReason, …>`
 * on an object literal refuses a missing key AND an excess one, so the table's
 * own keys are exactly the union and nothing here can drift from it.
 */
export function isRefreshFailureReason(value: unknown): value is RefreshFailureReason {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(REFRESH_FAILURE_TABLE, value)
  );
}
