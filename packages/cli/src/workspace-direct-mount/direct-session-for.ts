import type { WorkspaceMountCredentials } from "@agent-nexus/sdk";

import type { DirectPins } from "./direct-pins";
import type { MountSession } from "./mount-session";
import { toVolumeName } from "./volume-name";

/** What a fresh direct session is built from: the mint's answer and the mount's own pins. */
export interface DirectSessionInput {
  readonly mountId: string;
  readonly baseUrl: string;
  readonly pins: DirectPins;
  readonly minted: WorkspaceMountCredentials;
  /**
   * The organization name to label the volume with — the SERVER's, not the copy
   * the profile saved at sign-in, falling back to the profile's when the lookup
   * answered none. The caller resolves it, because it also writes it back into
   * the profile.
   */
  readonly orgName: string | undefined;
  readonly mintedAt: Date;
}

/** The session file one direct mount writes: the minted triplet under the mount's pins. */
export function directSessionFor(input: DirectSessionInput): MountSession {
  const { minted, pins } = input;
  return {
    version: 1,
    mountId: input.mountId,
    profile: pins.profile,
    baseUrl: input.baseUrl,
    orgId: pins.orgId,
    workspace: {
      id: minted.workspace.id,
      slug: minted.workspace.slug,
      shared: minted.workspace.isShared
    },
    access: minted.access,
    volumeName: toVolumeName(minted.workspace.name, input.orgName),
    credentials: {
      accessKeyId: minted.credentials.accessKeyId,
      secretAccessKey: minted.credentials.secretAccessKey,
      sessionToken: minted.credentials.sessionToken
    },
    expiresAt: minted.expiresAt,
    mintedAt: input.mintedAt.toISOString()
  };
}
