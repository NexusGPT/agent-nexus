/** The columns shared by both the org-scoped and the cross-org ticket table. */
export const TICKET_COLUMNS = [
  { key: "identifier", label: "IDENTIFIER", width: 12 },
  { key: "title", label: "TITLE", width: 40 },
  { key: "type", label: "TYPE", width: 18 },
  { key: "priority", label: "PRIORITY", width: 10 },
  { key: "status", label: "STATUS", width: 15 }
] as const;
