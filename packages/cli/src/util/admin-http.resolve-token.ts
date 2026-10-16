import { AdminCliError } from "./admin-errors";
import type { AdminHttpOptions } from "./admin-http.types";

/**
 * Resolve the admin token: `--admin-token` first, then `NEXUS_ADMIN_TOKEN`.
 *
 * Token source matches the precedent set by
 * `apps/backend/src/tools/scripts/nuke-orgs.ts` — the operator copies a Clerk
 * JWT out of the browser session and passes it here. The CLI never persists it
 * (admin sessions are short-lived).
 *
 * A leading `Bearer ` is stripped because that is how the value appears in
 * DevTools, which is where `AdminCliError.missingToken`'s own hint sends the
 * operator to find it — so pasting the whole header value works rather than
 * producing `Bearer Bearer …` on the wire.
 */
export function resolveAdminToken(opts: AdminHttpOptions): string {
  const raw = opts.adminToken ?? process.env.NEXUS_ADMIN_TOKEN ?? "";
  const stripped = raw.replace(/^Bearer\s+/i, "").trim();
  if (!stripped) {
    throw AdminCliError.missingToken();
  }
  return stripped;
}
