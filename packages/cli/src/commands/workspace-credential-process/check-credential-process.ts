import { reportFailure } from "../../errors";
import { EXIT_CODES } from "../../exit-codes";
import { emitDocument, isJsonMode, printSuccess } from "../../output";
import { checkRefreshPath } from "../../workspace-direct-mount/check-refresh-path";
import type { MountSession } from "../../workspace-direct-mount/mount-session";
import { REFRESH_FAILURE_TABLE } from "../../workspace-direct-mount/refresh-failure-table";
import { refreshContextOf } from "./refresh-context-of";

/**
 * `--check`: is the mount's refresh path usable, without minting anything?
 * `checkRefreshPath` is the probe — the same one `mount` runs before spawning
 * rclone and `status` runs on every direct row. Prints no credential value on
 * either channel.
 */
export function checkCredentialProcess(session: MountSession): number {
  const probe = checkRefreshPath(session);
  if (!probe.ok) {
    return reportFailure(
      "local-failed",
      `${probe.problem}.`,
      REFRESH_FAILURE_TABLE["local-failed"].statusHint(refreshContextOf(session))
    );
  }
  const summary = {
    ok: true,
    mountId: session.mountId,
    profile: session.profile,
    workspace: session.workspace.slug,
    access: session.access,
    expiresAt: session.expiresAt,
    lastRefresh: session.lastRefresh ?? null
  };
  if (isJsonMode()) {
    emitDocument(summary);
  } else {
    printSuccess(`credential-process ${session.mountId}: the refresh path is usable`, {
      profile: session.profile,
      workspace: session.workspace.slug,
      access: session.access,
      expires: session.expiresAt
    });
  }
  return EXIT_CODES.success;
}
