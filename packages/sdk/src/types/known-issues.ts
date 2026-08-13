/**
 * Platform known issues, scoped to one CLI route.
 *
 * ## Timestamps are STRINGS here, and the contract's `z.date()` is not a
 * disagreement
 *
 * `KnownIssuesForRouteResponseSchema` declares `updatedAt` and `capturedAt` as
 * `z.date()`, which is correct on the server: the handler holds real `Date`
 * objects and `V1ResponseValidationInterceptor` parses the payload BEFORE it is
 * serialized. By the time it reaches this package it has been through
 * `JSON.stringify`, so it is an ISO-8601 string. Every other type in this
 * directory publishes `createdAt: string` for the same reason.
 *
 * Parse it yourself if you want a `Date`. This package does not, because a
 * client that silently rehydrates some fields and not others is worse than one
 * that hands back exactly what the wire carried.
 */
export interface KnownIssue {
  /** The human-facing ticket id, e.g. `NEX-1234`. */
  identifier: string;
  title: string;
  /** The workflow state's NAME, e.g. `In Progress` — not its type. */
  status: string;
  url: string;
  /** ISO-8601. */
  updatedAt: string;
}

export interface KnownIssuesForRouteResponse {
  /** Echoes the route id that was asked for. */
  route: string;
  issues: KnownIssue[];
  /**
   * When the snapshot serving this answer was captured. ISO-8601, or `null`
   * before the first poll of the serving process completes.
   */
  capturedAt: string | null;
  /**
   * 🔴 READ THIS BEFORE RENDERING AN EMPTY `issues`.
   *
   * `false` means the ticket provider has not been read yet. It is NOT "this
   * route is clean". A client that prints "no known issues" on `polled: false`
   * is making a confident claim on no evidence, which is the exact false green
   * this surface exists to avoid. Say "not checked yet" instead.
   */
  polled: boolean;
}
