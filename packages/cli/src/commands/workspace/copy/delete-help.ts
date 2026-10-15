/** `nexus workspace delete` — the operator prose its `--help` prints after the options. */
export const WORKSPACE_DELETE_HELP = `
Examples:
  $ nexus workspace delete scratch
  $ nexus workspace delete scratch --yes

Notes:
  IT PURGES THE FILES, NOT JUST THE ROW. Every object is deleted from storage
  first and the workspace record second, so this is NOT the 72h soft delete
  that "workspace restore" recovers from — "workspace restore" cannot bring a
  deleted WORKSPACE back, only files deleted from a live one.
  ANYTHING MOUNTED KEEPS ITS MOUNT POINT AND STOPS WORKING. The local directory
  and the registry entry survive as a dead mount; run
  "nexus workspace unmount <slug>" yourself afterwards.
  ROLE GRANTS AND AGENT LINKS TO IT GO SILENTLY, AND YOU CANNOT LIST THEM
  FIRST. "nexus role workspace-grants" is indexed by ROLE — its signature is
  workspace-grants <role> — so answering "which Roles reach this workspace"
  means running it once per Role and filtering. There is no workspace-indexed
  read. Either do that sweep, or accept that grants are lost unrecorded.
  A CODE WORKSPACE USUALLY BACKS A VIBE APP. Rows whose storage type is CODE
  (the "kind" key in --json) are projections of a git project, and share a name
  with the app and the project. Check "nexus apps list" for a matching name
  before deleting one.
  A PARTIAL FAILURE LEAVES THE WORKSPACE PRESENT. If the storage purge fails
  the record is kept on purpose so a retry can finish; re-run the same command.
  --yes is REQUIRED when stdin is not a TTY: without it a script exits NON-ZERO
  rather than deleting. Every destructive command in this CLI refuses the
  same way. "nexus --help" carries the exit-code table.
  Needs workspaces:delete, which workspaces:write does not imply.`;
