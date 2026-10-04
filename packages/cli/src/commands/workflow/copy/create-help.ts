/** Appended to `nexus workflow create`. */
export const WORKFLOW_CREATE_HELP = `
Examples:
  $ nexus workflow create --name "Customer Onboarding"
  $ nexus workflow create --name "Data Pipeline" --description "ETL workflow"
  $ nexus workflow create --body '{"name":"Pipeline","description":"ETL"}'

Notes:
  --name is REQUIRED, is trimmed, and must be UNIQUE among the organization's
  non-archived workflows: a repeat is a 400, "A workflow with this name already
  exists". --description is capped at 1000 characters.
  THE NEW WORKFLOW IS NOT EMPTY AND HAS NO TRIGGER. It carries one non-deletable
  selectTrigger placeholder, which validate counts as no trigger at all. Turn it
  into a real one with "nexus workflow trigger <id> --type <triggerType>".
  THE PLACEHOLDER'S NODE ID IS NOT IN THIS RESPONSE, and every next step needs
  it. Follow every create with "nexus workflow get <id> --json" and read the
  node id out of .nodes before wiring anything — there is no way to derive it
  from the workflow id.
  Status is DRAFT. This command prints the id and the name; read the graph back
  with "workflow get".
  ARCHIVING IS THE ONLY DELETE. A workflow you create here cannot be destroyed
  later — see "nexus workflow delete --help" before you create a throwaway.
  dashboardUrl in the payload is the new workflow's canvas, added by this CLI
  rather than returned by the API — open it, or hand it to whoever asked.`;
