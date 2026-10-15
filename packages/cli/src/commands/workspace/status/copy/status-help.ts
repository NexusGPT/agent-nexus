/** `nexus workspace status` — the operator prose its `--help` prints after the options. */
export const WORKSPACE_STATUS_HELP = `
Examples:
  $ nexus workspace status
  $ nexus workspace status --json

Notes:
  LIVE REFLECTS THE MOUNT ONLY, NEVER THE SERVER. It is a process check for
  the rclone and direct engines (the recorded pid must still be an rclone
  mount) and a mount-table check for the native engine, so a row can read Live
  yes and still fail every read when the WebDAV gateway refuses, the key was
  revoked or the workspace was deleted. CONFIRM BY READING ONE KNOWN FILE.
  IT SHOWS EVERY ORG'S MOUNTS, not just the active one, and needs no auth — it
  reads the local registry and, for a direct mount, that mount's own files.
  "?" IS "NOT RECORDED", NOT "NONE". Org prints "?" when the mount was made
  with a raw --api-key and no NEXUS_ORGANIZATION_ID, and Mode prints "?" on a
  mount recorded before the mode was tracked — that mount may be read-write.
  Profile prints "-" in the same situation, not "?".
  Under --json the same fields are null rather than "?" / "-", so a script can
  tell "unknown" from a literal value.
  A DIRECT MOUNT GETS THREE MORE COLUMNS, FROM LOCAL READS ONLY. Expires is
  when its current hour of access ends ("in 41m", "expired 3m ago" — an expired
  drive that is still running renews itself on the next click). Refresh is
  exactly one of: "ok <ago>" · "stale: expired <ago>, refreshes on next
  access" (or ", mount is not live — remount" when Live is no) · "failed
  <ago>: <what> — <fix>" · "broken: <what> — run: <fix>". Pending is how many
  saves have not reached the workspace yet. Other
  engines print "-"; under --json the three are expiresAt, refresh
  {outcome, at, reason, transient, fix} and pendingUploads, null elsewhere.
  mountId IS PRINTED UNDER --json ONLY: the direct engine's per-mount id, the
  operand "nexus workspace credential-process" takes. Null on other engines.
  Never a bucket, a prefix or a credential value, on either channel.
  Mode is what the mount was CREATED with. It does not re-derive the scopes the
  key actually holds, so Mode rw on a key without workspaces:write is possible.
  "No workspaces mounted." means the registry is empty. It does not mean the OS
  has nothing mounted, and it exits 0 — nothing is recorded, so nothing is wrong.
  THE EXIT CODE CARRIES live AND Refresh. Any recorded mount reading no, and
  any LIVE direct mount whose last renewal failed for a reason the next click
  cannot cure or whose renewal path is broken, makes this exit non-zero and
  names the rows, so a script can gate on a drive it depends on. A dead row is
  named once, as dead: its remount rewrites what a broken renewal path needs.
  A failed renewal that is TRANSIENT (offline, a slow answer) is printed and
  exits 0.
  It is still a LOCAL check: a 0 means every recorded mount is mounted and
  renewable, never that the server still has the workspace. Under --json a
  non-zero exit REPLACES the rows with the error document.`;
