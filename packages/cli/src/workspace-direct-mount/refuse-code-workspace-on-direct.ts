import type { WorkspaceKind } from "@agent-nexus/sdk";

import { isReadOnlyKind } from "../commands/workspace-mount/is-read-only-kind";
import { GATEWAY_FALLBACK_FOR } from "../commands/workspace-mount/platform-rules";
import { invalidInput } from "../errors";
import { mountPlatformOf } from "./mount-platform";

/**
 * A CODE workspace is refused on the direct engine outright. Its S3 prefix
 * holds engine-owned `.checkouts/` generations beside the files, the server
 * grades every human key `read` on it, and a drive that accepted saves under
 * `--vfs-cache-mode writes` would drop them at upload — the silent-loss shape.
 * The WebDAV engine mounts it read-only through Nexus instead.
 */
export function refuseCodeWorkspaceOnDirect(slug: string, kind: WorkspaceKind): void {
  if (!isReadOnlyKind(kind)) return;
  throw invalidInput(
    `"${slug}" is a ${kind} workspace: a read-only projection of a git project whose storage also ` +
      "holds engine-owned checkout generations. The server serves it read-only, and a direct drive " +
      "would accept your saves and drop them at upload.",
    `Mount it with --engine ${GATEWAY_FALLBACK_FOR[mountPlatformOf(process.platform)]}: the gateway ` +
      `mounts "${slug}" read-only through Nexus. Change the files by pushing to the git project.`
  );
}
