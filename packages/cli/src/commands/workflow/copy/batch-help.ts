/** Appended to `nexus workflow batch`. */
export const WORKFLOW_BATCH_HELP = `
Examples:
  $ nexus workflow batch 11111111-1111-4111-8111-111111111111 --body '{"nodes":[{"ref":"summarize","type":"aiTask"}],"edges":[{"source":"@trigger","target":"@summarize"}]}'
  $ nexus workflow batch 11111111-1111-4111-8111-111111111111 --body '{"nodes":[{"ref":"rows","type":"loop"},{"ref":"score","type":"aiTask","parentId":"@rows"}],"edges":[{"source":"@rowsStart","target":"@score"}]}'
  $ nexus workflow batch 11111111-1111-4111-8111-111111111111 --body batch.json
  $ cat batch.json | nexus workflow batch 11111111-1111-4111-8111-111111111111 --body -
  $ nexus workflow batch 11111111-1111-4111-8111-111111111111 --body - --json

Notes:
  DECLARE A ref BARE, REFERENCE IT WITH @. {"ref":"summarize"} is declared, and
  every source / target / parentId / sourceHandle that means it writes "@summarize".
  A value with no @ is taken as an existing node or edge UUID, so a bare typo
  becomes "not found in workflow" rather than an unresolved ref.
  Refs must be unique within the batch, and three kinds are reserved or generated:
  @trigger is the workflow's existing trigger node; a loop or doWhile named "rows"
  also creates @rowsStart, its body's entry point; and each branch you declare
  gets its own ref. Use GET /workflows/node-types ("nexus workflow node-types")
  for the type names — "llm", "action" and "condition" are not among them.
  label is OPTIONAL. Node types carry their own default label, and data is merged
  over the type's defaults. RE-DECLARING AN EXISTING NODE MERGES RECURSIVELY over
  its stored data, so one entry of a nested map (parametersSetup, an
  agentInputTrigger's parameters) no longer replaces the whole map; send a nested
  entry as null to drop it, and send an array complete because arrays replace.
  IT IS ATOMIC. Everything is validated in memory and written once, so a refusal
  anywhere leaves the workflow exactly as it was — no orphan nodes to clean up.
  Refusals are literal: "Duplicate ref 'X'", "Unknown node type: 'X'",
  "Unresolved reference '@X' in <context>. Available refs: …" and
  "Edge(s) not found: <id>". Edges are also held to every rule
  "workflow edge create" applies (EDGE_SELF_LOOP, EDGE_SCOPE_VIOLATION, …).
  Re-firing the same batch REUSES an identical existing edge instead of failing,
  so a retry after a partial network failure is safe.
  PLUGIN NODES COME BACK UNCONFIGURED — batch creates the shell only. Set toolId,
  then selectedAction (which populates the parameters), verify with
  "workflow node get", and only then toolCredentialId. Configuring parameters
  before the action is accepted and silently produces nothing.
  Created ids arrive at created.{nodes,edges,branches}, keyed by your refs — the
  SDK already unwrapped the envelope, so jq '.data.created' selects null here.
  The default table output prints only the three counts — use --json for the ids.`;
