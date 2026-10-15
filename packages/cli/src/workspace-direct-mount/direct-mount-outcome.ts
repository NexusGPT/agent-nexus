import type { WorkspaceMountCredentials } from "@agent-nexus/sdk";

import type { MountOutcome } from "../commands/workspace-mount/mount-outcome";

/** What one started direct drive reports back to the verb that asked for it. */
export interface DirectMountOutcomeInput {
  readonly slug: string;
  readonly mountPath: string;
  readonly mountId: string;
  readonly baseUrl: string;
  readonly minted: WorkspaceMountCredentials;
  readonly pid: number | undefined;
  readonly mintedAt: Date;
  /** True when read-write was asked for and the server granted only read. */
  readonly grantedReadOnly: boolean;
  readonly pendingUploads: number;
}

/**
 * The registry row and the three facts the caller prints, from the mint's
 * answer. `access` is the grade the SERVER granted, never the one requested,
 * and `serverOrgName` is null when the lookup named none — the caller then
 * falls back to the profile's copy.
 */
export function directMountOutcome(input: DirectMountOutcomeInput): MountOutcome {
  const { minted } = input;
  return {
    record: {
      slug: input.slug,
      engine: "direct",
      mountPath: input.mountPath,
      baseUrl: input.baseUrl,
      mountId: input.mountId,
      access: minted.access,
      workspaceId: minted.workspace.id,
      pid: input.pid,
      mountedAt: input.mintedAt.toISOString()
    },
    grantedReadOnly: input.grantedReadOnly,
    pendingUploads: input.pendingUploads,
    serverOrgName: minted.organization.name
  };
}
