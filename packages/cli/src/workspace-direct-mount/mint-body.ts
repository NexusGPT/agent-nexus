import type { MintWorkspaceMountCredentialsBody } from "@agent-nexus/sdk";

import type { MountAccess } from "../mount-registry";

/**
 * The mint body a mount and every renewal send. `workspaceId` goes only for a
 * shared mount, where the bare slug would resolve to the org-owned copy. For an
 * org-owned mount the bare slug is what lets a replaced workspace show up as a
 * DIFFERENT id, which the renewal refuses as `workspace-replaced` rather than
 * serving credentials for a stranger.
 */
export function mintBodyFor(
  workspace: { readonly shared: boolean; readonly id: string | undefined },
  access: MountAccess
): MintWorkspaceMountCredentialsBody {
  return {
    ...(workspace.shared && workspace.id !== undefined ? { workspaceId: workspace.id } : {}),
    access
  };
}
