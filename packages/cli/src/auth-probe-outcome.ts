/**
 * WHAT A CREDENTIAL PROBE CAN CONCLUDE, AND WHY THE FAILURES ARE NOT A BOOLEAN.
 *
 * ── THE OUTCOMES ARE SEPARATE BECAUSE THE ACTIONS ARE OPPOSITE ───────────────
 *
 * ⚠️ "THE SERVER IS UNREACHABLE" MUST NEVER BE REPORTED AS "YOUR KEY IS
 * INVALID". One says get a new key; the other says check your network. An
 * instrument that collapses them has the same defect it was built to fix, one
 * layer down — the reader still cannot tell which thing to go and do.
 *
 * The union below therefore keeps FIVE distinct failures rather than a boolean,
 * and each maps to its own category in `exit-codes.ts`:
 *
 * | outcome       | what happened                       | what to do            |
 * | ------------- | ----------------------------------- | --------------------- |
 * | `no-key`      | the profile stores no key at all    | log in                |
 * | `rejected`    | the server read the key and said no | get a new key         |
 * | `remote-error`| the server was reached and broke    | retry later           |
 * | `unreachable` | nothing answered — DNS, TLS, socket | check the network     |
 * | `timed-out`   | it answered too slowly, or not yet  | retry, and re-read it |
 *
 * `timed-out` is deliberately NOT folded into `unreachable`, even though a bare
 * `catch` sees them as one throw. A timeout leaves the request possibly still
 * running server-side; an unreachable host does not. `whoami` collapsed the two
 * before this module existed.
 *
 * ── WHAT `verified` DOES NOT PROVE ───────────────────────────────────────────
 *
 * That the key authenticates against THIS base URL, right now. It is not a
 * statement about permissions, about the organization the next request will
 * name, or about any other host. The caller still reports those from its own
 * resolution.
 */

/** The identity `/me` reports, when the endpoint exists and the key is good. */
export interface LiveIdentity {
  orgId?: string;
  orgName?: string;
  userEmail?: string;
  userName?: string;
  role?: string;
}

/**
 * What a live probe found. A closed union, so a caller cannot handle "the good
 * one" and let every failure fall through a default — the shape that produced
 * the defect `auth-probe.ts` exists to close.
 */
export type CredentialProbe =
  /**
   * The server read the key and accepted it.
   *
   * `identity` is `null` on a backend too old to serve `/me`: the key is still
   * PROVEN good — a second call confirmed it — and there is simply no live
   * identity to report. A caller must fall back to its stored fields there, and
   * must not read `null` as "no organization".
   */
  | { readonly outcome: "verified"; readonly identity: LiveIdentity | null }
  /** The profile holds no key. Refused locally; no request was sent. */
  | { readonly outcome: "no-key" }
  /** The server read the key and refused it. HTTP 401 or 403. */
  | { readonly outcome: "rejected"; readonly status: number }
  /** The request arrived and the server failed it. Any other non-2xx. */
  | { readonly outcome: "remote-error"; readonly status: number }
  /** Nothing answered — DNS, TLS, socket, offline. Retryable. */
  | { readonly outcome: "unreachable" }
  /** The CLI stopped waiting. The request may still be running. */
  | { readonly outcome: "timed-out" };
