// ── Workspace mount registry ─────────────────────────────────────────────────
//
// On-disk record of which workspaces are mounted, so `unmount`/`status` can find
// a mount again. The registry lives at `~/.nexus-mcp/workspace-mounts.json`.
//
// Historically it was a `Record<slug, MountRecord>` — keyed by bare workspace
// slug, machine-wide, org-blind. That allowed only ONE mount per slug across ALL
// orgs (NEX-2360): a user in two orgs could not mount each org's `general-context`
// at distinct paths simultaneously. The registry is now keyed by
// `<kind>:<id>|<slug>` where `<kind>:<id>` identifies the ACTING ORG pinned at
// mount time (`org:<orgId>`, else `profile:<name>`, else `url:<baseUrl>`), and
// each record carries the org/profile that owns it (NEX-2372: `status` reads
// these back, together with the ro/rw mode).
//
// ── WHERE EACH PART LIVES ────────────────────────────────────────────────────
//
// This file is the entry point and declares nothing of its own, so every
// importer keeps one import path while each concern stays its own module. The
// reasoning that used to sit in this header moved WITH the code it is about:
//
//   `.model.ts`           the record, the scope, and the engine tables
//   `.store.ts`           where the file lives, and how it is read and written
//   `.mount-path.ts`      the default mount point `~/nexus/<org>/<slug>`
//   `.key.ts`             the `<kind>:<id>|<slug>` key space, and why it is tagged
//   `.scope-match.ts`     which rows the acting scope may touch, from both sides
//   `.find.ts`            finding a recorded mount by slug, legacy rows included
//   `.mount-point.ts`     one registry row per mount point, across every scope
//   `.describe.ts`        naming an owner, a scope, and a list of candidate rows
//   `.mount-refusals.ts`  what `mount` says when it will not mount
//   `.miss-messages.ts`   what `unmount`/`remount` say about somebody else's row

export { describeOwner, describeScope } from "./mount-registry.describe";
export { findMount, findMountsBySlug } from "./mount-registry.find";
export {
  isLegacyKey,
  mountKey,
  mountScopeId,
  type MountScopeIdentity,
  mountScopeIdentity,
  type MountScopeKind,
  scopeIdOfKind
} from "./mount-registry.key";
export { ownedElsewhereMessage, unmountMissMessage } from "./mount-registry.miss-messages";
export {
  type Engine,
  ENGINE_LIVENESS,
  ENGINES,
  type MountAccess,
  type MountRecord,
  type MountScope,
  type RcloneEngine
} from "./mount-registry.model";
export { defaultMountPath, mountPathOrgSegment } from "./mount-registry.mount-path";
export {
  claimMountPoint,
  findMountsByPath,
  type MountPointClaim
} from "./mount-registry.mount-point";
export { alreadyMountedMessage, mountPointTakenMessage } from "./mount-registry.mount-refusals";
export { ownerConflictsWithScope, scopeCandidateKeys } from "./mount-registry.scope-match";
export {
  ensureStateSubdir,
  LOG_DIR,
  readMounts,
  STATE_DIR,
  STATE_FILE,
  writeMounts
} from "./mount-registry.store";
