import { countPendingUploads } from "../workspace-direct-mount/count-pending-uploads";
import { directMountOutcome } from "../workspace-direct-mount/direct-mount-outcome";
import type { DirectMountRequest } from "../workspace-direct-mount/direct-mount-request";
import { directSessionFor } from "../workspace-direct-mount/direct-session-for";
import { mintBodyFor } from "../workspace-direct-mount/mint-body";
import { refreshProfileOrgName } from "../workspace-direct-mount/refresh-profile-org-name";
import { refuseCodeWorkspaceOnDirect } from "../workspace-direct-mount/refuse-code-workspace-on-direct";
import { refusePendingUploadsUnderReadOnly } from "../workspace-direct-mount/refuse-pending-uploads-under-read-only";
import { refuseWrongCacheCopy } from "../workspace-direct-mount/refuse-wrong-cache-copy";
import { removeOwnSession } from "../workspace-direct-mount/remove-own-session";
import { sessionPathsFor } from "../workspace-direct-mount/session-paths";
import { mintOrRefuse } from "./workspace-mount/mint-or-refuse";
import type { MountOutcome } from "./workspace-mount/mount-outcome";
import { startDirectDrive } from "./workspace-mount/start-direct-drive";

// ── The direct engine ─────────────────────────────────────────────────────────
//
// rclone signing S3 requests itself with a one-hour credential this CLI mints
// from the API key and renews through `workspace credential-process`. This file
// is the engine's ORDER OF OPERATIONS, and every step it names is its own
// module: `workspace-direct-mount/` is the engine's spawn-free half — the pins,
// the brand on the credential_process line, the session file, the refusals —
// and the steps that spawn or print are in `workspace-mount/`.

/**
 * Mount a workspace with the direct engine: mint, write the session and the
 * credential_process line, prove the refresh path, spawn rclone.
 *
 * The order is the failure budget. Every local check that can refuse runs
 * before the one network call, the mint; everything after the mint is inside
 * ONE catch that deletes the session directory, so a drive that never came up
 * leaves no credential on disk. The mount point is the caller's: it created it
 * and takes it back on failure.
 */
export async function mountDirect(request: DirectMountRequest): Promise<MountOutcome> {
  const { slug, mountPath, mountId, pins } = request;
  const paths = sessionPathsFor(mountId);

  refuseWrongCacheCopy(paths, request.shared, slug);

  const pendingUploads = countPendingUploads(paths.cacheDir);
  const pendingSaves = { slug, cacheDir: paths.cacheDir, pendingUploads };
  if (request.readOnly) {
    refusePendingUploadsUnderReadOnly({ ...pendingSaves, cause: "requested" });
  }

  const requestedAccess = request.readOnly ? "read" : "read-write";
  const minted = await mintOrRefuse(
    request,
    mintBodyFor({ shared: request.shared, id: request.workspaceId }, requestedAccess)
  );
  // The list may have been unreachable, or answered before a replacement: the
  // mint's own answer is the kind the drive would actually serve.
  refuseCodeWorkspaceOnDirect(slug, minted.workspace.kind);

  const grantedReadOnly = !request.readOnly && minted.access === "read";
  if (grantedReadOnly) {
    refusePendingUploadsUnderReadOnly({ ...pendingSaves, cause: "granted" });
  }
  const readOnly = request.readOnly || grantedReadOnly;

  const mintedAt = new Date();
  // The name the SERVER holds, not the copy the profile saved at sign-in. That
  // copy is written by `auth login` / `use-org` / `switch` and re-read by
  // nothing, so an organization renamed afterwards kept labelling the volume,
  // the mount list and the default folder with its old name — the one thing the
  // org half of a volume name exists to get right. The profile's value stays as
  // the fallback: a lookup that answered none must not produce a nameless drive.
  const orgName = minted.organization.name ?? pins.orgName;
  refreshProfileOrgName(pins, minted.organization.name);
  const session = directSessionFor({
    mountId,
    baseUrl: request.baseUrl,
    pins,
    minted,
    orgName,
    mintedAt
  });

  try {
    const pid = await startDirectDrive({
      slug,
      mountPath,
      mountId,
      paths,
      session,
      minted,
      readOnly,
      shared: request.shared,
      awsConfig: request.awsConfig,
      binary: request.binary
    });
    return directMountOutcome({
      slug,
      mountPath,
      mountId,
      baseUrl: request.baseUrl,
      minted,
      pid,
      mintedAt,
      grantedReadOnly,
      pendingUploads
    });
  } catch (error) {
    removeOwnSession(mountId, session);
    throw error;
  }
}
