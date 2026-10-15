/** `nexus workspace push` — the operator prose its `--help` prints after the options. */
export const WORKSPACE_PUSH_HELP = `
Examples:
  $ nexus workspace push support-docs ./reports/q3.pdf
  $ nexus workspace push support-docs:reports ./q3 ./q4        # lands as reports/q3/… and reports/q4/…
  $ nexus workspace push support-docs ./notes --no-clobber      # leave files that already exist alone
  $ nexus workspace push support-docs ./site --include-hidden   # push .well-known/ and friends too

THE MOUNT IS THE NORMAL WAY IN; THIS IS FOR THE MACHINE THAT CANNOT MOUNT.
CI, a container, a locked-down laptop. The files land in the same store the
drive shows, so a teammate on a mount sees them within seconds.

IT COPIES LIKE cp. A named file lands at <folder>/<name>; a named folder lands
at <folder>/<name>/… with its tree under it. A file that exists is REPLACED,
silently, unless --no-clobber — then it is reported as skipped, decided by the
store in the same step as the write, so two pushes racing on one path see
exactly one win. Inside a walked folder, names starting with "." are left out
unless --include-hidden; a dot-file you name on the command line is pushed.

IT IS A MAILBAG, NOT A TRANSACTION. Files go up in packs of at most 100 files
and 45 MB; each file is delivered or bounced on its own and nothing is rolled
back. Read the per-file lines: a FAILED row is a file that is not there, and
the run exits remote-error when there is one. A skipped row is neither a
success nor a failure and leaves the exit at success. A single file of 45 MB
or more is refused before anything is sent — use the mount for it.

Notes:
  --json IS THE MERGED SERVER RESPONSE: {results, successCount, failureCount,
  skippedCount}, one document, results in push order across every pack. Read
  the exit code before parsing rows.
  A PATH IS WORKSPACE-RELATIVE with no leading slash; "<slug>:" with nothing
  after the colon is the root, the same as a bare slug. A destination cannot
  end in "/" — a file is pushed onto a file's name, never a folder's. A name
  the workspace cannot hold (a backslash, a segment over 255 characters, a
  path over 1024, ".." or "." segments) refuses the run before any request,
  naming the file and the rule, as does a file this process cannot read.
  A FILE THAT BECOMES UNREADABLE between the plan and the send is its own
  FAILED row; the rest of its pack still goes up, and when every FAILED row
  is one this machine could not read the run exits local-failed, not
  remote-error — the server answered nothing wrong.
  ONE PACK HAS TEN MINUTES TO UPLOAD, not the usual thirty seconds: a pack is
  up to 45 MB and the deadline covers sending it. A global --timeout bounds
  one pack, not the whole run; on a slow uplink give it more, not less.
  DELETING IS NOT HERE. Nothing under "nexus workspace" deletes a file; that
  happens on a mount, and "workspace restore" is its undo.`;
