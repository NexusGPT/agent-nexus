import { type MountRecord, type MountScope, writeMounts } from "../../mount-registry";

/** The scope facts a row is stamped with at mount time. */
export interface MountRowFields {
  readonly useShared: boolean;
  readonly requestedReadOnly: boolean;
  readonly scope: MountScope;
  readonly actingOrgName: string | undefined;
  readonly workspaceId: string | undefined;
}

/**
 * Org-scope the registry (NEX-2360): key by `<kind>:<acting-org>|<slug>`
 * and stamp the org/profile pinned at mount time, plus the ro/rw mode
 * (NEX-2372) and the org-owned-vs-admin-shared disambiguation
 * (NEX-2362), so `unmount`/`status` can tell which drive this is.
 */
export function recordMount(
  mounts: Record<string, MountRecord>,
  key: string,
  record: MountRecord,
  fields: MountRowFields
): void {
  const { useShared, requestedReadOnly, scope, actingOrgName, workspaceId } = fields;
  mounts[key] = {
    ...record,
    shared: useShared,
    readOnly: requestedReadOnly,
    ...(scope.orgId ? { orgId: scope.orgId } : {}),
    ...(actingOrgName ? { orgName: actingOrgName } : {}),
    ...(scope.profile ? { profile: scope.profile } : {}),
    ...(workspaceId ? { workspaceId } : {})
  };
  writeMounts(mounts);
}
