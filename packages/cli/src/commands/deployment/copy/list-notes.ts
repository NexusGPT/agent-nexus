/**
 * Appended to `nexus deployment list`: the pagination cap, and which filters
 * the server refuses rather than silently ignoring.
 */

export const LIST_NOTES = `
Examples:
  $ nexus deployment list
  $ nexus deployment list --type WHATSAPP --limit 10
  $ nexus deployment list --active --json
  $ nexus deployment list --agent-id 11111111-1111-4111-8111-111111111111

Notes:
  --limit above 100 is a 400, NOT a clamp. Page with meta.paging; meta.total
  counts the filtered set, so it moves when --search or --type does.
  --type takes the uppercase enum. --active selects isActive=true only —
  there is no flag for the inactive half, omit it and read the ACTIVE column.
  --agent-id narrows to one agent's deployments within your organization; an
  id from another organization matches nothing, and a non-UUID is a 400. An
  EMPTY --agent-id is refused here: the API reads it as "every agent".

  A KEY MINTED BY AN ORG MEMBER SEES ONLY THE DEPLOYMENTS THAT USER CREATED,
  and nothing says so: the list is simply shorter. Admin and org-level keys
  see all of them.`;
