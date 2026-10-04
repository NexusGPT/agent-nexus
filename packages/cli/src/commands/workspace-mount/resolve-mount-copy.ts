import type { createClient } from "../../client";
import { failure } from "../../errors";
import type { MountTarget } from "./mount-target";
import { resolveMountTargetDetailed } from "./resolve-mount-target-detailed";

/** Which copy of the slug this mount serves, and whether it is the shared one. */
export interface MountCopy {
  readonly target: MountTarget | null;
  readonly useShared: boolean;
}

/**
 * Resolve which copy of the slug we're about to mount. A slug can name
 * BOTH an org-owned workspace and an admin-shared one; the bare slug
 * resolves to the org-owned copy server-side, so without this the user
 * can silently mount the wrong drive (NEX-2362). Best-effort: a list
 * hiccup degrades to the legacy bare-slug mount rather than blocking.
 */
export async function resolveMountCopy(
  client: ReturnType<typeof createClient>,
  slug: string,
  shared: boolean
): Promise<MountCopy> {
  const { target, listError } = await resolveMountTargetDetailed(client, slug, shared);

  // `--shared` is an explicit request, so never proceed unverified: a
  // missing list (target === null) means we couldn't confirm the shared
  // workspace exists, and a confirmed-absent one is a hard error. Either
  // way, mounting the `_shared/<slug>` path blindly would yield a live
  // mount that 404s on every request (esp. under rclone). The default
  // (bare-slug) path still degrades gracefully when the list is missing.
  if (shared) {
    if (!target) {
      // RETHROW THE LIST'S OWN ERROR, never a fresh one. A null target
      // only ever means `workspaces.list()` threw, and that error already
      // knows what it was — unreachable API, a 401, a 5xx. Replacing it
      // with a plain `Error` here erased that: `handleError` had nothing
      // left to classify and stamped CLI_UNKNOWN_ERROR on a failure the
      // CLI had just diagnosed, which is the one thing an error document's
      // `code` must never do. The message below is worth less than the
      // cause, so the cause wins.
      throw (
        listError ??
        new Error(`Couldn't verify workspaces for "${slug}" — fetching the workspace list failed.`)
      );
    }
    if (!target.shared) {
      throw failure(
        "not-found",
        `No admin-shared workspace has the slug "${slug}".`,
        "Run `nexus workspace list` to see available workspaces, or drop --shared for the org-owned one."
      );
    }
  }

  const useShared = shared || (!!target?.shared && !target.orgOwned);

  return { target, useShared };
}
