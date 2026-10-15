import type { MountSession } from "../../workspace-direct-mount/mount-session";
import type { RefreshContext } from "../../workspace-direct-mount/refresh-failure-table";

/** The two fields every refresh failure's `statusHint` is written against. */
export function refreshContextOf(session: MountSession): RefreshContext {
  return { slug: session.workspace.slug, profile: session.profile };
}
