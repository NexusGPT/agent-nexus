/** Appended to `nexus workflow test`. */
export const WORKFLOW_TEST_HELP = `
Examples:
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --input '{"message": "hello"}'
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --body '{"message": "hello"}'
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --follow
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --sample 5 --sample-node loop-abc --follow
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --limit-array loop-abc=5 --limit-array rows=10
  $ nexus workflow test 11111111-1111-4111-8111-111111111111 --json

Notes:
  A SUCCESSFUL TEST RUN IS A REAL RUN. Every node executes against live systems —
  emails send, rows are written, plugins charge. There is no dry mode; cap the
  expensive parts with --sample / --limit-array instead.
  WHERE --input LANDS DEPENDS ON THE TRIGGER TYPE, and getting it wrong resolves
  {{TRIGGER…}} to nothing rather than erroring:
    webhookTrigger      — wrapped as {body: <your input>}: {{TRIGGER.body.name}}
    agentInputTrigger   — used as the trigger's own output, so references are the
                          parameter names directly: {{TRIGGER.customer_email}}
    scheduleTrigger /
    manualTrigger       — takes no input at all
    newsMonitorTrigger  — your input, else the stored runOutput, else a synthesized
                          {events: […]} sample
    pluginTrigger       — IGNORES --input entirely. Its sample payload is the node's
                          own exampleData, captured from a real event in the Test tab
  A WEBHOOK OR PLUGIN TRIGGER WITH NOTHING TO RUN ON IS REFUSED, not silently
  parked: 422 TRIGGER_NOT_SYNC_TESTABLE. For a webhook, pass --input, or put
  exampleData on the trigger node, or publish and fire the real event. For a
  plugin, only exampleData or publishing will do — and testing one deploys NO
  third-party subscription: the chain runs from exampleData, and the source is
  registered at "workflow publish", not here.
  --input wins over --body and is the trigger payload verbatim. A flat --body is
  treated as that payload; a --body carrying triggerData / sampleConfig is used as
  given. An EMPTY object is treated as absent, so the node's stored runOutput
  survives rather than being clobbered with {}.
  --sample needs --sample-node (the loop node's id). Caps only apply to runs that
  start immediately — they cannot reach a run an external event starts later.
  Answers {executionId, status:"RUNNING"}. Follow it with --follow, or later with
  "nexus execution diagnose <executionId>".
  WITH --follow, --json EMITS NDJSON — one JSON object per node state change, not
  a single document. Read it line by line; piping it to a jq that expects one
  document fails on the second line. Without --follow, --json is one document as
  usual.`;
