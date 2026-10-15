import type { Command } from "commander";

import { handleError } from "../../errors";
import {
  findMount,
  findMountsBySlug,
  readMounts,
  unmountMissMessage,
  writeMounts
} from "../../mount-registry";
import { removeDirectSession } from "../../workspace-direct-mount/remove-direct-session";
import { killRecordedProcess } from "./kill-recorded-process";
import { reportUnmount } from "./report-unmount";
import { resolveScopeBestEffort } from "./resolve-scope-best-effort";
import { unmountPath } from "./unmount-path";

/** The `nexus workspace unmount` action: a local operation on the mount registry. */
export function runWorkspaceUnmount(program: Command, slug: string): void {
  try {
    const mounts = readMounts();
    // Scope to the acting org so the right per-org mount is targeted when
    // the same slug is mounted for multiple orgs (NEX-2360). Best-effort:
    // works with no configured profile, falling back to an UNOWNED slug
    // match only — an owned row is never detached on an unresolved scope.
    const scope = resolveScopeBestEffort(program.optsWithGlobals());
    const found = findMount(mounts, slug, scope);
    if (!found) {
      // Never say "No mount recorded" when the slug IS mounted — just for a
      // different (or ambiguous) org. `unmountMissMessage` owns which remedy
      // fits, because which one is TRUE depends on whether the candidates
      // have an owner to switch to at all.
      const candidates = findMountsBySlug(mounts, slug);
      if (candidates.length > 0) {
        throw new Error(unmountMissMessage(slug, candidates, scope));
      }
      throw new Error(`No mount recorded for "${slug}". See \`nexus workspace status\`.`);
    }
    const { key, record } = found;

    // OS-level unmount detaches both native WebDAV and rclone-FUSE cleanly.
    unmountPath(record.mountPath);
    // rclone leaves a detached process; reap it if the unmount didn't.
    killRecordedProcess(record);
    const leftovers = record.engine === "direct" ? removeDirectSession(record) : null;
    delete mounts[key];
    writeMounts(mounts);

    reportUnmount(slug, record, leftovers);
  } catch (err) {
    process.exitCode = handleError(err);
  }
}
