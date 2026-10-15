/** `nexus workspace search` — the operator prose its `--help` prints after the options. */
export const WORKSPACE_SEARCH_HELP = `
Examples:
  $ nexus workspace search support-docs --query "refund policy"
  $ nexus workspace search support-docs --frontmatter status=published
  $ nexus workspace search support-docs --query onboarding --frontmatter owner=growth --json
  $ nexus workspace search support-docs --query api --path guides --limit 20

Notes:
  TEXT DOCUMENTS ONLY, BY EXTENSION. Markdown, txt, json/jsonl, yaml and their
  siblings are read; a PDF, an image, a binary or a file with NO EXTENSION is
  never opened, so its content cannot match and its absence is not reported.
  This is a document search, not a file search.
  IT STOPS AFTER 1000 FILES AND SAYS SO QUIETLY. Past that the answer is
  incomplete and truncated is true — the table prints "(truncated — narrow your
  search)" on STDERR and --json carries the flag. AN EMPTY RESULT WITH
  truncated: true IS NOT "NO MATCHES". Narrow with --path and try again.
  LARGE FILES ARE READ AS A PREFIX ONLY (first 256 KB), so a match deep inside
  a big document is missed silently.
  Every --frontmatter key=value must hold, ANDed with --query. Repeat the flag
  for several. Values are compared as the flattened string form of the
  frontmatter, so a list matches its ", "-joined rendering.
  At least one of --query / --frontmatter is required; the CLI refuses locally
  rather than scanning everything.
  MATCHED tells you WHERE it hit — content, frontmatter or path. A path-only
  hit has no snippet, which is why SNIPPET can be blank on a real match.
  🚨 A NON-TEXT FILE CANNOT BE FOUND BY ITS PATH EITHER, ONLY BY ITS CONTENT.
  Non-text files are dropped before matching runs, so the path axis never
  applies to them: searching an image's EXACT filename answers "No matches",
  which reads as "that file is not in this workspace" when it is sitting there.
  Confirm with a mount or with "nexus api GET /workspaces/<slug>/files
  --query path=<dir>" before believing an absence.
  scanned (STDERR, or --json) is how many files were actually opened, not how
  many exist.
  No mount needed, and no local files are read — this runs server-side.
  --json IS THE RAW SERVER OBJECT, NOT A {data, meta} ENVELOPE:
  {results, scanned, truncated}. Each hit is {path, size, modifiedAt, snippet,
  frontmatter, matchedIn}. snippet and frontmatter are null rather than absent
  when there is none, and matchedIn is an ARRAY — one hit can carry
  ["frontmatter","content"] at once, so a script comparing it to a single
  string misses every multi-axis hit. The MATCHED column above is that array
  joined with ", ".`;
