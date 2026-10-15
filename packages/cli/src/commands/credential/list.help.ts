/**
 * `nexus credential list --help`, the hand-written half.
 *
 * A module-level const rather than a template literal inside the registrar —
 * this package's pattern for a multi-kilobyte help block, so the registrar
 * reads as wiring and the prose is editable without scrolling past a command
 * tree.
 */
export const CREDENTIAL_LIST_HELP = `
Examples:
  $ nexus credential list
  $ nexus credential list --source oauth_connection --status CONNECTED
  $ nexus credential list --service Gmail --sort-by name
  $ nexus credential list --tool-id 11111111-1111-4111-8111-111111111111
  $ nexus credential list --search "production" --json

Notes:
  THE UNIFIED INVENTORY, not one table. SOURCE says which record backs a row —
  oauth_connection, api_key_connection or tool_credential — and decides what
  "credential delete" has to tear down on the way out.
  The ID printed here is the one "access-card list --credential-id" wants and
  the one "external-tool execute --credential" accepts.
  🔴 SERVICE IS A LABEL AND DOES NOT SAY A TOOL IS CONNECTED. For a tool
  credential it is the tool's public name, and nothing makes that unique — one
  organization held two rows reading SERVICE "Apify" that belonged to the
  Pipedream tool NAMED Apify, while the Apify-type tool that needed a
  credential had none. Both readings of that table are wrong in the same
  direction: "Apify is connected" was reported, and executing the other tool
  answered 400 "Credential not found or does not belong to this tool".
  TOOL ID is the column that settles it, and --tool-id is the question asked
  precisely: it returns only the credentials that tool can actually be executed
  with, so an EMPTY RESULT MEANS NOT CONNECTED rather than "no label matched".
  TOOL ID is "—" for oauth_connection and api_key_connection rows — those are
  organization-wide and belong to no single tool, so --tool-id never returns
  one. It is also the id "nexus tool credentials <id>" takes, which is the
  other half of the same answer.
  --search MATCHES MORE THAN THE NAME, AND NOT THE SERVICE. It is a
  case-insensitive substring over the connected account's email and name, an
  API-key connection's name and DESCRIPTION, and a tool credential's name — so
  a hit can come from text the table never shows, and the row looks arbitrary.
  It does NOT match the service; filter on that with --service instead.
  Paginated. Check meta.paging before concluding a credential is absent — and
  a zero-result --search is weak evidence of absence for the same reason.`;
