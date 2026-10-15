/** `nexus workspace rename` — the operator prose its `--help` prints after the options. */
export const WORKSPACE_RENAME_HELP = `
Examples:
  $ nexus workspace rename support-docs "Customer Support Docs"

Notes:
  THE SLUG IS IMMUTABLE AND THIS DOES NOT TOUCH IT. Only the display name
  changes, so mounts, grants, search and ~/nexus/<slug> all keep working — and
  the slug can end up saying nothing about the name. There is no way to change
  a slug: create a new workspace and move the files.
  Existing mounts are unaffected and need no remount.
  A slug that is not yours, or is narrowed away from you, answers 404.
  Needs workspaces:write.`;
