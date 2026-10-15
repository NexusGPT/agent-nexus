/** The `--help` prose for `nexus workspace unmount`, byte for byte as the registrar carried it. */
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
  Verify with "nexus workspace status": the row is gone.`;
