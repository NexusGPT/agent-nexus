import type { WorkspaceMountCredentials } from "@agent-nexus/sdk";

import type { MountSession } from "../../workspace-direct-mount/mount-session";

/** The session after a successful re-mint: new triplet, same pins. */
export function refreshedSession(
  session: MountSession,
  minted: WorkspaceMountCredentials,
  now: Date
): MountSession {
  return {
    ...session,
    credentials: {
      accessKeyId: minted.credentials.accessKeyId,
      secretAccessKey: minted.credentials.secretAccessKey,
      sessionToken: minted.credentials.sessionToken
    },
    expiresAt: minted.expiresAt,
    mintedAt: now.toISOString()
  };
}
