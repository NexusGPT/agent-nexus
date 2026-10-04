/** Appended to `nexus workflow delete`. */
export const WORKFLOW_DELETE_HELP = `
Examples:
  $ nexus workflow delete 11111111-1111-4111-8111-111111111111
  $ nexus workflow delete 11111111-1111-4111-8111-111111111111 --yes
  $ nexus workflow delete 11111111-1111-4111-8111-111111111111 --dry-run

Notes:
  IT ARCHIVES, IT DOES NOT DESTROY. The workflow's status becomes ARCHIVED and
  EVERY TRIGGER IT DEPLOYED IS REMOVED — a live webhook or schedule stops firing
  the moment this returns. The graph itself survives and is still readable with
  "workflow list --status ARCHIVED" and "workflow get".
  ARCHIVING IS THE END OF THE ROAD. There is no hard delete here and no route
  behind one — an archived workflow is a permanent row. Running this again on an
  archived id re-archives it and reports success, which is not a second, harder
  delete. Every throwaway workflow you build is kept forever, so reuse one
  scratch workflow rather than creating a new one per experiment.
  The API answers 200 with {id, status: "ARCHIVED", archivedAt}; this command
  prints only the id, so read the archive back with "workflow get" if you need
  the timestamp.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  --dry-run only reads the workflow back and prints its name.
  It frees the name: uniqueness ignores archived workflows.
  It also releases any AI task the workflow was holding: an archived workflow no
  longer counts as a dependent, so a "task delete" that 409'd now succeeds.`;
