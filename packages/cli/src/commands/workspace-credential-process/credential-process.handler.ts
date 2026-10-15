import type { Seconds } from "../../client";
import { refuse, reportFailure } from "../../errors";
import { EXIT_CODES } from "../../exit-codes";
import { emitDocument } from "../../output";
import { accessIsLower } from "../../workspace-direct-mount/mount-access";
import { isMountId } from "../../workspace-direct-mount/mount-id";
import { processCredentialsDocument } from "../../workspace-direct-mount/process-credentials-document";
import { readSession } from "../../workspace-direct-mount/read-session";
import { refreshCooldownFailure } from "../../workspace-direct-mount/refresh-cooldown";
import { checkCredentialProcess } from "./check-credential-process";
import { failRefresh, reportRefreshFailure } from "./fail-refresh";
import { recordRefreshOutcome } from "./record-refresh-outcome";
import { refreshedSession } from "./refreshed-session";
import { remintSession } from "./remint-session";

/** Everything `nexus workspace credential-process` reads off the command line. */
export interface CredentialProcessOptions {
  check?: boolean;
}

/**
 * The `nexus workspace credential-process` action. Returns the exit code
 * rather than setting it, because the registrar owns `process.exitCode` and the
 * SDK reads stdout: every path here either emits ONE document or emits nothing.
 */
export async function runCredentialProcess(
  mountId: string,
  opts: CredentialProcessOptions,
  globals: { timeout?: Seconds }
): Promise<number> {
  if (!isMountId(mountId)) {
    return refuse(
      `"${mountId}" is not a mount id.`,
      'A mount id is the 16 hex digits "nexus workspace status --json" reports as mountId for a direct-engine mount.'
    );
  }
  const read = readSession(mountId);
  if (!read.ok) {
    return reportFailure(
      "local-failed",
      read.why === "missing"
        ? `No session is recorded for mount ${mountId}.`
        : `The session file for mount ${mountId} is unreadable.`,
      'The drive needs a fresh mount: "nexus workspace status" names its slug, then run: nexus workspace remount <slug>.'
    );
  }
  const { session } = read;
  if (opts.check) return checkCredentialProcess(session);

  const now = new Date();
  const fresh = processCredentialsDocument(session, now);
  if (fresh !== null) {
    emitDocument(fresh);
    return EXIT_CODES.success;
  }

  const coolingDown = refreshCooldownFailure(session, now);
  if (coolingDown !== null) {
    const ago = Math.round((now.getTime() - new Date(coolingDown.at).getTime()) / 1000);
    return reportRefreshFailure(
      session,
      coolingDown.reason,
      `refused without asking Nexus — the last renewal failed ${ago}s ago`
    );
  }

  const result = await remintSession(session, globals);
  if (!result.ok) return failRefresh(session, result.reason, result.detail);

  const { minted } = result;
  if (minted.workspace.id !== session.workspace.id) {
    return failRefresh(
      session,
      "workspace-replaced",
      `Nexus answered with workspace ${minted.workspace.id}`
    );
  }
  if (accessIsLower(minted.access, session.access)) {
    return failRefresh(session, "access-downgraded", `Nexus granted ${minted.access}`);
  }
  const renewedAt = new Date();
  const renewed = refreshedSession(session, minted, renewedAt);
  const document = processCredentialsDocument(renewed, renewedAt);
  if (document === null) {
    return failRefresh(
      session,
      "remote-error",
      `Nexus minted a credential already expiring at ${minted.expiresAt}`
    );
  }
  recordRefreshOutcome(renewed, { at: renewedAt.toISOString(), outcome: "ok" }, renewedAt);
  emitDocument(document);
  return EXIT_CODES.success;
}
