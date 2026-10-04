/** Appended to `nexus tracing cost-breakdown`. */
export const TRACING_COST_BREAKDOWN_HELP = `
Examples:
  $ nexus tracing cost-breakdown
  $ nexus tracing cost-breakdown --group-by agent
  $ nexus tracing cost-breakdown --group-by workflow --json

Notes:
  --group-by TAKES MORE THAN THE THREE IN THE EXAMPLES. deployment, customer and
  workflowExecution are accepted too, and a rejected value prints the full
  accepted set — read that refusal rather than trusting any list. It defaults to
  model.
  REPEATING --group-by SILENTLY KEEPS ONLY THE LAST ONE. The server groups by a
  LIST, but this flag is not repeatable, so "--group-by model --group-by agent"
  returns the agent grouping alone, with nothing saying model was discarded. Ask
  for one grouping per call.
  --json ANSWERS THE ROUTE'S OWN OBJECT: the rows are under .entries and
  .dimensions echoes what the server grouped by, in order. Read .dimensions
  before splitting a composite KEY — it names which half is which.
  LABEL IS EMPTY WHENEVER THE THING IT NAMES IS GONE, LEAVING A BARE UUID IN KEY.
  Every dimension except model resolves its label by a lookup — agent,
  workflow, deployment and customer alike — so a deleted referent, or one in
  another organization, renders KEY with nothing beside it. Resolve those with
  "nexus agent get" and its siblings. Grouping by model never blanks: there the
  key IS the name. Grouping by customer also blanks when the customer has
  neither a display name nor a primary email.
  workflowExecution LABELS THE WORKFLOW, NOT THE RUN, so two runs of one
  workflow carry the same LABEL and are told apart only by KEY.
  THE ROWS DO NOT ADD UP TO YOUR BILL. Grouped by agent or workflow, only
  generations that name one are counted — anything run outside an agent or a
  workflow is in no row at all, so the column total is a lower bound on spend,
  never the whole of it. The agent is read from the agent column first and the
  recorded context second, which is the same resolution "tracing traces
  --agent-id" filters on.
  TRACES is DISTINCT traces touching that group, so summing the TRACES column
  double-counts any trace that used two models.
  UNPRICED > 0 MEANS THAT ROW'S COST ($) IS LOW BY AN UNKNOWN AMOUNT. Those
  calls had no price to look up, so they are in the row's cost at $0 — a group
  whose whole traffic is unpriced reads as $0.0000, i.e. indistinguishable from
  a group that spent nothing. UNPRICED is a subset of GENS, never larger, and
  is a disclosure rather than a correction: COST ($) is not adjusted by it.
  Ranking by cost with a non-zero UNPRICED anywhere is ranking on an incomplete
  column — read UNPRICED before concluding which group is cheapest.
  --bucket SPLITS EACH GROUP INTO A TIME SERIES, one row per (group key x
  bucket) instead of one aggregate per group key, and adds a BUCKET column. IT
  IS REJECTED WITH A 400 FOR model, agent AND workflow — only the attribution
  dimensions (deployment, customer, workflowExecution) support it. Use "nexus
  tracing timeline" for an org-wide series instead.
  Same retention window as everything else: this is at most the last few days
  unless you narrow it further with --start-date / --end-date.`;
