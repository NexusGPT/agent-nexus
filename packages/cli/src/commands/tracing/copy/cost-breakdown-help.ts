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
  THE ROWS ALONE DO NOT ADD UP; THE ROWS PLUS UNATTRIBUTED DO. Only calls that
  name every grouping you asked for can be placed in a row, so the COST column
  on its own is a lower bound. The UNATTRIBUTED line under the table is the
  rest of the window — spend whose own calls carry none of those dimensions —
  and the two together are the window's total. Read it before ranking rows: on
  a measured 7-day window it was 32% of the total for customer and 95% for
  workflowExecution. Under --json it is .unattributed, with the same fields a
  row carries. COST, both TOKEN columns, GENS and UNPRICED all add up that way.
  TRACES DOES NOT when GRAIN is generation: it counts DISTINCT traces, so one
  trace spread over two rows is counted in both. At trace grain it does add up.
  GRAIN SAYS WHICH ROW THE ATTRIBUTION WAS READ OFF, per dimension. generation
  means the attribution recorded on the CALL; trace means the one recorded on
  the conversation it belonged to, inherited by every call under it. workflow
  is trace grain because a call cannot carry a workflow id; everything else is
  generation grain. ASKING FOR workflow ALONGSIDE ANOTHER DIMENSION PUTS BOTH
  AT TRACE GRAIN — one query reads one table — and GRAIN is where that shows.
  The agent is read from the agent column first and the recorded context
  second, which is the same resolution "tracing traces --agent-id" filters on.
  TRACES is DISTINCT traces touching that group, so summing the TRACES column
  double-counts any trace that used two models — and, with --bucket, any trace
  whose calls fall in two buckets.
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
