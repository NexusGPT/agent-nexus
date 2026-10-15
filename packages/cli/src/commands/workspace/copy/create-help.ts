/** `nexus workspace create` — the operator prose its `--help` prints after the options. */
export const WORKSPACE_CREATE_HELP = `
Examples:
  $ nexus workspace create "Support Docs"
  $ nexus workspace create "Support Docs" --json
  $ nexus workspace create -- "-launch-notes"

Notes:
  THE SLUG IS DERIVED AND THEN IMMUTABLE. "Support Docs" becomes support-docs,
  and "workspace rename" changes the NAME ONLY — the slug you get here is the
  one every mount, search and grant will use for the life of the workspace.
  Read it from the output; do not assume the slugification rule.
  A NAME WITH NO ALPHANUMERICS IS REFUSED — it would slugify to nothing.
  A NAME STARTING WITH A HYPHEN NEVER REACHES THAT REFUSAL. Commander reads it
  as a flag first, so "workspace create ---" answers "error: unknown option
  '---'" and exits before any name is sent. Put "--" ahead of the name and the
  parser stops looking, which is where the refusal above actually applies.
  SLUGS ARE UNIQUE PER ORGANIZATION, so a second "Support Docs" is a conflict,
  not a second workspace. Note that an ADMIN-SHARED workspace may already carry
  the slug you want; that does not block creation, and you then have two rows
  with one slug — see "nexus workspace list" -> KIND.
  Creates a DRIVE workspace. CODE workspaces are read-only projections of a
  git project and are not creatable here.
  Needs workspaces:write.`;
