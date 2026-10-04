/** Appended to `nexus workflow validate`. */
export const WORKFLOW_VALIDATE_HELP = `
Examples:
  $ nexus workflow validate 11111111-1111-4111-8111-111111111111
  $ nexus workflow validate 11111111-1111-4111-8111-111111111111 --json

Notes:
  Answers isValid, readyToTest, readyToPublish, hasCriticalErrors, errors[] with a
  severity, warnings[], nodeStatuses keyed by node id, graphIssues[] and
  variableIssues[]. Read readyToPublish, not isValid.
  WARNINGS DO NOT BLOCK. isValid is just "errors is empty"; a workflow with no
  trigger and no output node collects warnings only, and still publishes.
  graphIssues names the structural faults: DISCONNECTED_NODE (no incoming edges),
  ORPHANED_NODE (inside a loop with no connections at all, so it is invisible on
  the canvas and will never run), INVALID_EDGE (an edge publish refuses) and
  MULTIPLE_TRIGGERS (the workflow holds more than one trigger, so a run starts
  from one of them and silently skips every other trigger's subtree — delete the
  surplus with "nexus workflow node delete", which is allowed while more than one
  remains). Each of these also blocks readyToTest and readyToPublish.
  variableIssues names every {{node.field}} that no upstream node exposes, AND
  THIS IS THE ONLY COMMAND IN THE CLI THAT MAKES THAT CHECK. "node create",
  "node update", "node get", "workflow overview" and "workflow publish" all pass
  a workflow carrying an unresolvable reference in a text field. So a run of
  validate is not optional politeness before publish — it is the only thing
  standing between a ghost reference and run time.
  This is a READ. It changes nothing and never publishes.
  THE EXIT CODE CARRIES isValid. A workflow with errors exits non-zero; a clean
  one, or one carrying warnings only, exits 0. Warnings never affect it, so a CI
  step can be "nexus workflow validate <id> && nexus workflow publish <id>".`;
