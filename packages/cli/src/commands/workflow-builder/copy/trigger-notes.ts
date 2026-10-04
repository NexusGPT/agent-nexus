/**
 * Appended to `nexus workflow trigger`: replacing a trigger is a REPLACE, and the
 * type is set through --body.
 */

export const TRIGGER_NOTES = `
Examples:
  $ nexus workflow trigger 11111111-1111-4111-8111-111111111111 --type webhookTrigger
  $ nexus workflow trigger 11111111-1111-4111-8111-111111111111 --type scheduleTrigger
  $ nexus workflow trigger 11111111-1111-4111-8111-111111111111 --type platformListenerTrigger

Notes:
  THIS COMMAND IS TYPE-ONLY, IN TWO STEPS. It replaces the trigger node and takes
  NOTHING else: a --body carrying data, parameters, runOutput, cron or
  platformEventType is a 400 "Unrecognized key". Set the trigger's configuration
  afterwards with
  "nexus workflow node update <wf-id> <trigger-node-id> --body '{"data":{…}}'".
  REPLACE IS HOW YOU DELETE A TRIGGER — "node delete" refuses one with a 403.
  A response still showing type "selectTrigger" means nothing was installed.
  THE NEW TRIGGER'S ID IS AT .node.id, NOT AT THE TOP LEVEL. The response is
  {node, reconnectedEdges} — node is the whole node record, and reconnectedEdges
  is every edge re-pointed at the new trigger, always present and often empty.
  Step two below needs .node.id, so take it from here rather than going back to
  "workflow get".
  FOR AN agentInputTrigger, STEP TWO IS data.parameters AND IT IS LOAD-BEARING
  THREE TIMES OVER:
    $ nexus workflow node update <wf-id> <trigger-node-id> \\
        --body '{"data":{"parameters":{"city":{"type":"string","handler":"prompt"}}}}'
  That one write is what makes "workflow test --input" resolve, what publish
  derives the workflow's agentInputSchema from, and what an "agent-tool create
  --type WORKFLOW" schema is then checked against. Skip it and the trigger
  installs cleanly, the workflow publishes, and it accepts no parameters at all.
  A platformListenerTrigger needs its platformEventType from
  "nexus workflow platform-listener-events", set in step two.
  newsMonitorTrigger is deliberately absent: it needs provider configuration only
  the dashboard performs.`;
