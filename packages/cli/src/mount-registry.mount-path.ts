import os from "node:os";
import path from "node:path";

import type { MountScope } from "./mount-registry.model";

/**
 * THE DEFAULT MOUNT POINT: `~/nexus/<org>/<slug>`.
 *
 * Scoping the registry KEY does not scope the mount POINT — `--at` names any
 * path, rows written before the org segment existed sit at `~/nexus/<slug>`,
 * and two orgs whose names slugify alike share a segment. The invariant the key
 * alone cannot hold is `claimMountPoint`'s, in
 * `mount-registry.mount-point.ts`; this file only decides what the default is.
 */

/**
 * An id may be used as a directory name VERBATIM or not at all.
 *
 * Verbatim because it is an identity, not a label: `org_39FoxcMixrC5rGX65cZ…`
 * is what the folder is called today, and rewriting it — lowercasing, turning
 * `_` into `-` — would rename every existing default mount point. Refused
 * outright when it does not match, because there is no honest way to "clean" an
 * identity: the result would name an organization that does not exist.
 */
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * The `<org>` segment of a default mount point: the organization's NAME
 * slugified (lowercase, `[a-z0-9-]`) when it is known, its id when only that is,
 * and nothing when the scope names no organization at all (a raw --api-key with
 * no NEXUS_ORGANIZATION_ID) — then the path is the org-less `~/nexus/<slug>`.
 *
 * 🔴 BOTH HALVES ARE SANITISED, and the id half is the one that was not. The
 * name is slugified because it is a display string; the id looked safe because
 * it looks like `org_2rES0…`. It is not checked anywhere on the way here —
 * `resolveOrganization` returns `NEXUS_ORGANIZATION_ID` verbatim — so it is
 * caller input reaching `path.join`, and `../../tmp/x` there resolves the
 * default mount point OUTSIDE `~/nexus`, which `createMountDir` then creates.
 * `assertMountableSlug` refuses exactly this on the other half of the same path,
 * for exactly this reason; this is that guard, applied to the segment the
 * `~/nexus/<org>/<slug>` default added.
 *
 * An id that survives no character is dropped rather than replaced: an empty
 * segment falls back to the org-less path, which is a real layout, where a
 * placeholder would invent a directory name no organization owns.
 */
export function mountPathOrgSegment(
  scope: Pick<MountScope, "orgId" | "orgName">
): string | undefined {
  const fromName =
    scope.orgName === undefined
      ? ""
      : scope.orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
  if (fromName !== "") return fromName;
  return scope.orgId !== undefined && SAFE_PATH_SEGMENT.test(scope.orgId) ? scope.orgId : undefined;
}

/** `~/nexus/<org>/<slug>` — see {@link mountPathOrgSegment} for the `<org>` half. */
export function defaultMountPath(
  slug: string,
  scope: Pick<MountScope, "orgId" | "orgName">
): string {
  const org = mountPathOrgSegment(scope);
  const segments = org === undefined ? [slug] : [org, slug];
  return path.join(os.homedir(), "nexus", ...segments);
}
