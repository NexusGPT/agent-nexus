/** Appended to `nexus workflow get`. */
export const WORKFLOW_GET_HELP = `
Examples:
  $ nexus workflow get 11111111-1111-4111-8111-111111111111
  $ nexus workflow get 11111111-1111-4111-8111-111111111111 --json

Notes:
  --json is ONE FLAT OBJECT — the workflow's own fields at the top level, no
  {data, meta} envelope and no {success} wrapper. It carries the whole graph:
  nodes, edges, publishedNodes, publishedEdges, agentInputSchema and the
  editor's data blob. The table shows seven fields.
  🚨 A NODE'S CONFIGURATION IS ONE LEVEL DOWN, UNDER THE NODE'S OWN "data" KEY.
  A node object carries id, type and data — plus parentId inside a loop, and
  deletable only when it cannot be deleted. Everything you configured is inside
  data. So the label is .nodes[].data.label, NOT .nodes[].label, and the same
  holds for instructions, code, message and every other node field. jq reading
  the shallow path finds nothing and prints null, which reads as an empty label
  rather than as a wrong path:

    $ nexus workflow get 11111111-1111-4111-8111-111111111111 --json | jq '.nodes[] | {id, type, label: .data.label}'

  "data" THEREFORE MEANS TWO DIFFERENT THINGS ON THIS ONE DOCUMENT, and the
  next paragraph is about the OTHER one. .nodes[].data is the node's
  configuration and is always there; the workflow's own top-level .data is the
  canvas blob described below.
  data IS THE DASHBOARD EDITOR'S OWN BLOB AND IS null ON A WORKFLOW BUILT HERE.
  Only the canvas writes it, so its absence says nothing about the graph — nodes
  and edges are the graph. Never test data for emptiness to decide whether a
  workflow is built.
  publishedNodes / publishedEdges are the LAST-PUBLISHED SNAPSHOT and are null —
  not [] — until the first publish. Comparing them with nodes / edges is how you
  learn whether the live version still matches the draft you are editing, and it
  is the check to run right after "workflow publish": an edit made after a
  publish leaves the snapshot behind, and nothing flags it — the comparison is
  yours to make.
  agentInputSchema IS THE LIVE CONTRACT ON A PUBLISHED WORKFLOW, NOT YOUR DRAFT.
  It is derived from the agentInputTrigger in publishedNodes — the graph a
  calling agent actually invokes — so a parameter you add after publishing does
  NOT appear here until you unpublish and publish again. Your edit is not lost:
  it is on this same document at
  .nodes[] | select(.type=="agentInputTrigger") | .data.parameters. On a DRAFT
  there is no published graph, so the field tracks the draft trigger. Read-only
  either way, and not writable through "workflow update".
  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is the canvas
  for this workflow, so nothing has to assemble a URL from a path pattern that
  can be renamed underneath it.`;
