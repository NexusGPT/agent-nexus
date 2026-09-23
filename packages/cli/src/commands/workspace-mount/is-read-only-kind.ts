import type { WorkspaceKind } from "@agent-nexus/sdk";

/**
 * Which workspace kinds the server refuses every write against, keyed
 * exhaustively on the SDK's `WorkspaceKind` so a kind added to the wire cannot
 * silently default to writable — this table stops compiling until someone
 * classifies it.
 *
 * 🚨 THE SERVER IS THE AUTHORITY AND THIS IS A PREDICTION OF IT. `KIND_IS_READ_ONLY`
 * in the backend's `workspace.entity.ts` is what actually answers 403, on the
 * WebDAV gateway and on every REST write. This copy exists only so the mount can
 * be made read-only UP FRONT instead of mounting read-write and letting the user
 * discover the refusal one failed save at a time.
 *
 * The two are compile-forced to be EXHAUSTIVE and are not forced to AGREE. A new
 * kind classified writable here and read-only there reproduces exactly the defect
 * this table removes, so classify it in both or in neither.
 */
const WORKSPACE_KIND_IS_READ_ONLY: Record<WorkspaceKind, boolean> = {
  DRIVE: false,
  CODE: true
};

/** True when the server will refuse every write against a workspace of this kind. */
export function isReadOnlyKind(kind: WorkspaceKind): boolean {
  return WORKSPACE_KIND_IS_READ_ONLY[kind];
}
