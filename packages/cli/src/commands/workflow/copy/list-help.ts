/** Appended to `nexus workflow list`. */
export const WORKFLOW_LIST_HELP = `
Examples:
  $ nexus workflow list
  $ nexus workflow list --status PUBLISHED --limit 10
  $ nexus workflow list --search "onboarding" --json
  $ nexus workflow list --folder "Notion"

Notes:
  --page defaults to 1 and --limit to 20. A --limit above 100 is REFUSED with a
  400 rather than clamped.
  --status takes DRAFT, PUBLISHED or ARCHIVED. THE UNFILTERED LIST HIDES ARCHIVED
  — that is where "workflow delete" puts things, so a deleted workflow is still
  readable, but only with --status ARCHIVED.
  --folder accepts a folder id or its name, matched case-insensitively. A folder
  that matches nothing returns an empty list rather than ignoring the filter.
  Newest-updated first.
  --json IS {data: [...], meta: {total, page, paging}}, NOT A BARE ARRAY, and
  "nexus task list" — the other list you are most likely to read beside this
  one — answers {items, total}. Both are objects and NEITHER is a bare array, so
  jq '.[]' selects nothing on either; the rows are under .data here and .items
  there. Read meta.paging here rather than counting rows.`;
