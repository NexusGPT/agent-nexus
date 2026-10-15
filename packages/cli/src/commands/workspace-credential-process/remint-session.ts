import { type WorkspaceMountCredentials } from "@agent-nexus/sdk";

import { createClient, type Seconds, seconds, secondsToMs } from "../../client";
import { mintBodyFor } from "../../workspace-direct-mount/mint-body";
import type { MountSession } from "../../workspace-direct-mount/mount-session";
import { refreshFailureReasonFor } from "../../workspace-direct-mount/refresh-failure-reason";
import { REFRESH_FAILURE_TABLE } from "../../workspace-direct-mount/refresh-failure-table";
import type { RefreshFailureReason } from "../../workspace-direct-mount/refresh-record";
import {
  REFRESH_RETRY_DELAY_MS,
  refreshMayRetry
} from "../../workspace-direct-mount/refresh-retry-budget";
import { describeError } from "./describe-error";

/** The client's ceiling for ONE attempt; `refreshMayRetry` bounds the sum. */
const REFRESH_TIMEOUT_SECONDS: Seconds = seconds(20);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RemintResult =
  | { readonly ok: true; readonly minted: WorkspaceMountCredentials }
  | { readonly ok: false; readonly reason: RefreshFailureReason; readonly detail: string };

/**
 * One re-mint through the PINNED profile and organization. The client is
 * built from `session.profile` — so the key is read from `config.json` on every
 * run and a fresh `auth login` under that name heals the mount — and from
 * `session.orgId` as an override, so nothing that happened to the shell or the
 * active profile since the mount can re-point it. The body is `mintBodyFor`'s,
 * the same one the mount sent.
 */
export async function remintSession(
  session: MountSession,
  globals: { timeout?: Seconds }
): Promise<RemintResult> {
  // The same ceiling the client gets, in the unit the budget is kept in.
  const timeoutMs = secondsToMs(globals.timeout ?? REFRESH_TIMEOUT_SECONDS);
  let client: ReturnType<typeof createClient>;
  try {
    client = createClient({
      profile: session.profile,
      baseUrl: session.baseUrl,
      organizationId: session.orgId,
      timeout: globals.timeout ?? REFRESH_TIMEOUT_SECONDS,
      maxRetries: 0
    });
  } catch (error) {
    // The profile is gone (`auth logout`) or unreadable: the fix is the same
    // sign-in the not-authenticated text names, under the same profile name.
    return { ok: false, reason: "not-authenticated", detail: describeError(error) };
  }

  const startedAt = Date.now();
  for (let attempt = 1; ; attempt += 1) {
    try {
      const minted = await client.workspaces.mintMountCredentials(
        session.workspace.slug,
        mintBodyFor(session.workspace, session.access)
      );
      return { ok: true, minted };
    } catch (error) {
      const reason = refreshFailureReasonFor(error);
      const retry =
        REFRESH_FAILURE_TABLE[reason].transient &&
        refreshMayRetry({ attempt, elapsedMs: Date.now() - startedAt, timeoutMs });
      if (!retry) return { ok: false, reason, detail: describeError(error) };
      await sleep(REFRESH_RETRY_DELAY_MS);
    }
  }
}
