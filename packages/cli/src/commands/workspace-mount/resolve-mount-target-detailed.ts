import type { WorkspaceKind } from "@agent-nexus/sdk";

import type { createClient } from "../../client";
import type { MountTargetResolution } from "./mount-target";

/**
 * Inspect the org's workspace list to learn whether `slug` is owned by an
 * org-owned workspace, an admin-shared one, or both — pick the id of the copy
 * the mount will serve (shared when `wantShared`, else org-owned-first,
 * matching the server's bare-slug resolution), and read that copy's storage
 * KIND so the caller can mount read-only when the server would refuse writes
 * anyway.
 *
 * A list call that fails yields a null `target` beside the `listError` that
 * caused it, so the caller can fall back to a plain bare-slug mount AND still
 * name the cause. {@link resolveMountTarget} is the wrapper that drops the
 * error for callers which genuinely do not need it.
 *
 * ⚠️ `kind` IS ABSENT ON THE DEGRADED PATH, AND ABSENT IS NOT "WRITABLE".
 * A null target and a `kind`-less target both mean the same thing — nobody
 * asked the server — so the caller must not read either as permission to mount
 * read-write silently. The write still fails at the gateway; all that is lost
 * is the warning.
 */
export async function resolveMountTargetDetailed(
  client: ReturnType<typeof createClient>,
  slug: string,
  wantShared: boolean
): Promise<MountTargetResolution> {
  // `kind` is on the wire (`WorkspaceItemSchema`) and was missing from this
  // annotation AND from the SDK's own `Workspace` interface, so no compiler
  // anywhere could see that the mount path never read it. Both are widened
  // together; `packages/sdk/src/types/types-match-the-v1-contract.test.ts` now
  // pins the SDK half against the contract so it cannot narrow again.
  let workspaces: { id: string; slug: string; isShared: boolean; kind: WorkspaceKind }[];
  try {
    ({ workspaces } = await client.workspaces.list());
  } catch (listError) {
    return { target: null, listError };
  }
  const matches = workspaces.filter((w) => w.slug === slug);
  const shared = matches.find((w) => w.isShared);
  const orgOwned = matches.find((w) => !w.isShared);
  const chosen = wantShared ? shared : (orgOwned ?? shared);
  return {
    target: {
      shared: !!shared,
      orgOwned: !!orgOwned,
      workspaceId: chosen?.id,
      kind: chosen?.kind
    },
    listError: null
  };
}
