/** Appended to `nexus workflow update`. */
export const WORKFLOW_UPDATE_HELP = `
Examples:
  $ nexus workflow update 11111111-1111-4111-8111-111111111111 --name "Renamed Workflow"
  $ nexus workflow update 11111111-1111-4111-8111-111111111111 --description "Updated description"
  $ nexus workflow update 11111111-1111-4111-8111-111111111111 --body '{"name":"Renamed"}'

Notes:
  ONLY name AND description ARE WRITABLE HERE, and the body is STRICT: nodes,
  edges, agentInputSchema, status or a typo is a 400 naming the key, never a
  silent strip. Change the graph with "workflow node/edge/branch" or
  "workflow batch"; agentInputSchema comes from the agentInputTrigger's
  parameters.
  A new --name is held to the same uniqueness rule as create.
  dashboardUrl in the payload is this workflow's canvas, added by this CLI
  rather than returned by the API.`;
