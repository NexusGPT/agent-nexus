/** `nexus workspace restore` — the operator prose its `--help` prints after the options. */
export const WORKSPACE_RESTORE_HELP = `
Recovers a file or folder that was deleted from a workspace, using the S3
backup (version history, retained ~30 days — past the 72h soft-delete window).
Pass the path that was deleted; everything currently deleted at/under it is
restored. Live files are never overwritten.

Examples:
  $ nexus workspace restore support-docs reports/q3.pdf
  $ nexus workspace restore support-docs reports      # restore a whole folder

  The whole round trip. The delete has no verb here — it happens on a mount:
  $ rm ~/nexus/support-docs/notes/probe.md
  $ nexus workspace search support-docs --query probe
  $ nexus workspace restore support-docs notes/probe.md

Notes:
  IT RESTORES FILES INTO A LIVE WORKSPACE. It cannot bring back a workspace
  deleted with "workspace delete" — that purges storage, so there is nothing
  left to restore from.
  "Nothing to restore" IS A SUCCESS, NOT AN ERROR, and it means one of three
  different things: the path is past the recovery window, it was never
  deleted, or it is already present. The command cannot tell them apart, and
  it exits 0. Check "nexus workspace search" or the mount before assuming the
  file is unrecoverable.
  LIVE FILES ARE NEVER OVERWRITTEN. A path that still exists is skipped, so
  this is safe to re-run and cannot be used to roll a file back to an older
  version — that is "workspace revert", which takes a version id from
  "workspace history".
  THE PATH IS THE ONE THAT WAS DELETED, workspace-relative and with no leading
  slash. Given a folder, everything currently deleted at or under it comes
  back.
  Read the restored count and the paths it prints; --json carries both.
  THIS IS THE UNDO FOR AN OPERATION THIS NAMESPACE CANNOT PERFORM. Nothing
  under "nexus workspace" deletes a FILE — "workspace delete" destroys the
  whole workspace — so whatever you are undoing happened on a mount or over
  WebDAV. "nexus workspace --help" carries both of those routes.`;
