import type { createClient } from "../../client";
import { failure } from "../../errors";

import { resolveMountTargetDetailed } from "./resolve-mount-target-detailed";

/**
 * The shared twin's id when `--shared` was asked for, for the verbs that call a
 * v1 route by slug (`push`, `pull`, `history`, `revert`, `restore`). Same
 * refusals as `workspace mount --shared`: a list that could not be fetched
 * rethrows the list's own error, a slug with no shared copy is a hard error —
 * an explicit request is never served by a bare-slug guess.
 */
export async function sharedWorkspaceId(
  client: ReturnType<typeof createClient>,
  slug: string
): Promise<string | undefined> {
  const { target, listError } = await resolveMountTargetDetailed(client, slug, true);
  if (!target) {
    throw (
      listError ??
      new Error(`Couldn't verify workspaces for "${slug}" — fetching the workspace list failed.`)
    );
  }
  if (!target.shared) {
    // A categorised refusal, not a bare Error: bare, it reached `handleError`'s
    // last branch as CLI_UNKNOWN_ERROR, exit `failed`, and a --json reader could
    // not tell "no shared twin" from a crash.
    throw failure(
      "not-found",
      `No admin-shared workspace has the slug "${slug}".`,
      "Run `nexus workspace list` to see available workspaces, or drop --shared for the org-owned one."
    );
  }
  return target.workspaceId;
}
