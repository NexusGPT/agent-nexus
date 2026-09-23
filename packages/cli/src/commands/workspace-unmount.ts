import type { Command } from "commander";

import { resolveBaseUrl, resolveProfile } from "../config";
import { handleError } from "../errors";
import {
  ENGINE_LIVENESS,
  findMount,
  findMountsBySlug,
  type MountRecord,
  type MountScope,
  readMounts,
  unmountMissMessage,
  writeMounts
} from "../mount-registry";
import { color, isJsonMode, printSuccess } from "../output";
import { describePendingUploads } from "../workspace-direct-mount/pending-uploads-unknown";
import { actingScope } from "./workspace-mount/acting-scope";
import { isRecordedRcloneProcess } from "./workspace-mount/is-recorded-rclone-process";
import { jsonPendingUploads } from "./workspace-mount/json-pending-uploads";
import { unmountPath } from "./workspace-mount/unmount-path";
import { removeDirectSession } from "./workspace-mount-direct";

/** Kill the detached rclone a pid-probed engine recorded, if it is still that process. */
function killRecordedProcess(record: MountRecord): void {
  if (ENGINE_LIVENESS[record.engine] !== "pid") return;
  if (typeof record.pid !== "number" || !isRecordedRcloneProcess(record)) return;
  try {
    process.kill(record.pid);
  } catch {
    /* already gone */
  }
}

/**
 * Resolve the acting-org scope for `unmount` without requiring auth. Unmount
 * operates purely on the local registry, so a user with no configured profile
 * must still be able to run it — resolution failures fall back to `undefined`,
 * and the registry lookup then matches by slug.
 *
 * A raw `--api-key`/`NEXUS_API_KEY` override with no NEXUS_ORGANIZATION_ID also
 * resolves to `undefined`: it carries no org or profile identity (only a base
 * URL), so scoping the lookup by it would hide a row written under a real
 * org/profile key. Treating it as an unknown scope lets `findMount` fall back
 * to a slug match instead.
 *
 * That fallback is deliberately NARROW, because `undefined` here is also what a
 * typo'd `--profile` produces (the profile lookup throws and the `catch` below
 * swallows it, error and all). `findMount` will hand back a unique slug match
 * only when the record names NO org or profile; anything owned makes the caller
 * list the candidates and ask the user to name one. Otherwise a mistyped flag
 * would silently OS-detach and delete another org's mount.
 */
function resolveScopeBestEffort(opts: {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
}): MountScope | undefined {
  try {
    const resolved = resolveProfile(opts);
    // Through the canon — see `workspace-mount/resolve-auth.ts`.
    // This copy has to agree with that one exactly or `findMount` looks in a
    // different `url:` bucket than the mount was recorded under.
    const baseUrl = resolveBaseUrl(opts.baseUrl, opts.profile).replace(/\/$/, "");
    const scope = actingScope(resolved, baseUrl);
    if (!scope.orgId && !scope.profile) return undefined;
    return scope;
  } catch {
    return undefined;
  }
}

/**
 * The `unmount` verb, registered on the `workspace` namespace
 * `registerWorkspaceCommands` owns, in the position that function gives it.
 * A local operation on the mount registry: no auth, no API call.
 */
export function registerWorkspaceUnmountCommand(ws: Command, program: Command): void {
  // ── unmount ──────────────────────────────────────────────────────────────
  ws.command("unmount")
    .alias("umount")
    .description("Unmount a previously mounted workspace")
    .argument("<slug>", "Workspace slug")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace unmount support-docs
  $ nexus workspace umount support-docs      # same command

Notes:
  IT NEEDS NO AUTH AND MAKES NO API CALL. This is a local operation on the
  mount registry, so it works with no profile configured and after a key has
  been revoked.
  IT RESOLVES BY ACTING ORG FIRST. The same slug can be mounted for several
  organizations; when the active org owns none of them the error LISTS the
  candidates and tells you to switch profile or pass --profile, instead of
  saying the mount does not exist.
  UNSAVED WORK IN FLIGHT IS NOT FLUSHED FOR YOU. Writes propagate within
  seconds — let a large copy finish before unmounting. On a direct-engine
  drive the saves not yet uploaded are KEPT in the drive's cache and counted:
  "N file(s) not yet uploaded; nexus workspace mount <slug> --engine direct
  uploads them" — the same workspace mounted again under the same organization
  and profile reuses that cache and drains it. The cache directory is deleted
  only when it holds nothing.
  A DIRECT-ENGINE DRIVE'S ACCESS FILES ARE DELETED, AND ITS LAST KEY IS NOT.
  The session and the renewal config go; the storage key minted last stays
  valid until the expiry the command prints (an hour at most) — there is no
  revoke call for it. --json carries that instant as accessValidUntil, and
  the kept-save count as pendingUploads; both are null on other engines, and
  pendingUploads is the string "unknown" when the cache cannot be read.
  THE MOUNT-POINT DIRECTORY SURVIVES, EMPTY, AND YOU MUST REMOVE IT YOURSELF.
  Since "workspace mount" refuses a mount point that is not empty, the leftover
  directory is usually fine — but it is what bites you when something later
  writes into it while unmounted. Run "rmdir" on the path you passed to --at.
  A mount point with no record answers "No mount recorded for <slug>". If the
  OS still has it mounted, unmount it with the platform tool (umount /
  fusermount -u) — this command only knows what it recorded.
  Verify with "nexus workspace status": the row is gone.`
    )
    .action((slug: string) => {
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

        if (isJsonMode()) {
          console.log(
            JSON.stringify(
              {
                unmounted: true,
                slug,
                pendingUploads: jsonPendingUploads(leftovers?.pendingUploads),
                accessValidUntil: leftovers?.accessValidUntil ?? null
              },
              null,
              2
            )
          );
          return;
        }
        printSuccess(`Unmounted "${slug}" (${record.mountPath})`);
        if (leftovers !== null && leftovers.pendingUploads > 0) {
          console.log(
            color.yellow(
              `  ${describePendingUploads(leftovers.pendingUploads)} file(s) not yet uploaded; ` +
                `nexus workspace mount ${slug} --engine direct uploads them.`
            )
          );
        }
        if (leftovers?.accessValidUntil) {
          console.log(
            color.dim(
              `  The last minted access stays valid until ${leftovers.accessValidUntil}; AWS has no revoke call for it.`
            )
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
