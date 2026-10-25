/** The `--help` prose for `nexus workspace remount`, byte for byte as the registrar carried it. */
export const WORKSPACE_REMOUNT_HELP = `
Examples:
  $ nexus workspace remount support-docs

Notes:
  WHY IT EXISTS. A direct-engine drive is a detached rclone process, and a
  logout or a reboot kills it: the folder turns into an empty directory and
  "workspace status" reads Live no. This command mounts the SAME row again —
  same mount point, same copy, same organization and profile, the same mode
  ASKED FOR — with a fresh hour of access, so nothing has to be retyped.
  THE MODE IS RE-REQUESTED, NOT REPLAYED. A drive that came back read-only
  because Nexus granted less than it asked for asks for read-write again here,
  so it is read-write once the grant is restored; --read-only and a CODE kind
  stay read-only, as recorded.
  IT UPLOADS WHAT THE DEAD MOUNT HAD NOT SENT. Saves the previous mount left
  in its cache are queued again on the same cache directory; the command
  prints how many. A remount that would come back READ-ONLY while such saves
  exist is refused, because they could never upload — the refusal names the
  cache to copy them from and how to discard them.
  IT REFUSES A LIVE MOUNT. "already mounted at <path>" means there is nothing
  to do; unmount first if you want a fresh one.
  IT RESOLVES BY ACTING ORG, like "unmount": when the active org holds no row
  for the slug, the error lists the orgs that do.
  A WEBDAV OR RCLONE ROW IS REMOUNTED THE ORDINARY WAY — webdav with a fresh
  mount token, rclone with the current key and the drive's own cache folder,
  so its unsent saves upload too. An rclone drive last mounted before drives
  had their own folder gets one now; the saves it left in rclone's default
  cache folder are not uploaded, and the command says so. A row this platform cannot run
  (webdav off macOS, rclone on macOS) is refused, naming the engine to use.
  IT NEEDS A VALID KEY AND THE NETWORK: the drive is minted again. A direct
  row is minted under the profile it RECORDED; an --api-key on this command is
  not used for it.`;
