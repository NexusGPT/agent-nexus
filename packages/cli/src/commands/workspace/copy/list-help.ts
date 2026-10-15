/** `nexus workspace list` — the operator prose its `--help` prints after the options. */
export const WORKSPACE_LIST_HELP = `
Examples:
  $ nexus workspace list
  $ nexus workspace list --json
  $ nexus workspace list --folder-stats --json

Notes:
  READ THE KIND COLUMN BEFORE YOU MOUNT. "org" is your organization's own
  workspace, "shared" is an admin-shared one. Two rows can carry the SAME slug,
  one of each — the bare slug then mounts the org copy and --shared the other.
  🚨 THE TABLE'S "KIND" AND --json's "kind" ARE DIFFERENT FIELDS WITH THE SAME
  NAME. The column above shows OWNERSHIP (org / shared); the JSON key literally
  called kind shows the STORAGE TYPE (CODE / DRIVE), which is the sense
  "workspace create" documents. So a script reading .kind and testing for
  "org" or "shared" never matches, and one testing for "CODE" is answering a
  different question than the table. In --json, ownership is isShared.
  --folder-stats ADDS A COUNT, NOT THE FOLDERS. It costs a depth-1 walk
  server-side, the table shows only how many top-level folders there are, and
  the per-folder breakdown is --json only.
  Files and Size are server-side totals for the whole workspace; they say
  nothing about whether it is mounted.
  Needs workspaces:read. Unpaginated.`;
