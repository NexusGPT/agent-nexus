import { STOP_WINDOW_MS } from "./win32/stop-rclone-hidden";

/** The `--help` prose for `nexus workspace unmount`. */
export const WORKSPACE_UNMOUNT_HELP = `
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
  seconds — let a large copy finish before unmounting. On a direct or rclone
  drive the saves not yet uploaded are KEPT in the drive's cache and counted:
  "N file(s) not yet uploaded; nexus workspace mount <slug> --engine <engine>
  uploads them" (with --shared when the drive was the admin-shared copy) —
  the same copy mounted again on the same engine, under the same organization
  and profile, reuses that cache and drains it. The
  cache directory is deleted only when it holds nothing. An rclone drive
  mounted before drives had their own cache folder is not counted, and its
  unsent saves, in rclone's default cache folder, no later mount uploads.
  A DIRECT-ENGINE DRIVE'S ACCESS FILES ARE DELETED, AND ITS LAST KEY IS NOT.
  The session and the renewal config go; the storage key minted last stays
  valid until the expiry the command prints (an hour at most) — there is no
  revoke call for it. --json carries that instant as accessValidUntil, and
  the kept-save count as pendingUploads. accessValidUntil is null off the
  direct engine; pendingUploads is null on the webdav engine and on an
  uncounted rclone drive, and the string "unknown" when the cache cannot be
  read.
  THE MOUNT-POINT DIRECTORY SURVIVES, EMPTY, AND YOU MUST REMOVE IT YOURSELF.
  Since "workspace mount" refuses a mount point that is not empty, the leftover
  directory is usually fine — but it is what bites you when something later
  writes into it while unmounted. Run "rmdir" on the path you passed to --at.
  On Windows the folder is gone after unmount: WinFsp removes it with the drive.
  A mount point with no record answers "No mount recorded for <slug>". If the
  OS still has it mounted, unmount it with the platform tool (umount /
  fusermount -u) — this command only knows what it recorded.
  ON WINDOWS rclone.exe is first asked to exit (Ctrl-C to the hidden console
  it runs in), so Explorer drops the drive at once; one still running after
  ${String(STOP_WINDOW_MS / 1000)} s is ended, and a line then says to refresh Explorer if it still
  shows the drive. The drive letter or folder is released when rclone.exe ends.
  A leftover rclone.exe ends with: taskkill /F /PID <pid>, or Task Manager.
  A DRIVE ANOTHER USER OR AN ADMINISTRATOR STARTED IS REFUSED, its row kept:
  unmount it from that account or terminal.
  Verify with "nexus workspace status": the row is gone.`;
