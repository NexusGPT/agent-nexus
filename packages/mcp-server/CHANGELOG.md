# @agent-nexus/mcp-server

## 1.1.0
### Minor Changes

- 4616c7a: An operation that runs a model gets the minutes it needs
  
  `client.skills.executeTask()` aborted after 30 seconds. On a frontier model with
  structured JSON output a generation takes 60–90 s, so the SDK stopped waiting on
  every correct answer and returned only the fast or degenerate ones — while the
  server ran the generation to completion and billed it.
  
  The same wall stood in front of `nexus-mcp`, where every tool call shared one
  60 s deadline. `skills_execute_task` needs longer than that by design, so the
  tool most likely to be slow was the one the default could not accommodate.
  
  ## A deadline belongs to the operation, not to the transport
  
  `HttpClient` had ONE number and every route inherited it. Under one number the
  two classes of route cannot both be served: 30 s kills a generation, and raising
  the shared value to ten minutes would hang a script for ten minutes on an
  unreachable `GET /models`.
  
  So each long-running method now states the deadline its own route needs:
  
  |                              | Deadline | Applies to                                                                                                         |
  | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
  | `DEFAULT_REQUEST_TIMEOUT_MS` | 30 s     | Ordinary reads and writes                                                                                          |
  | `LONG_RUNNING_TIMEOUT_MS`    | 10 min   | `skills.executeTask` · `skills.testExternalTool` · `tools.execute` · `workflows.testNode` · `promptAssistant.chat` |
  
  Both constants are exported from the package root.
  
  ## An explicit `timeout` still wins, in both directions
  
  `new NexusClient({ timeout })` governs every request, long-running routes
  included — that is the contract the CLI's global `--timeout <seconds>` flag rests
  on, and it is why the client's own timeout is no longer collapsed to `30_000` in
  the constructor: "the caller asked for 30 s" and "nobody said anything" had
  become the same value, which is what made the long routes unfixable.
  
  `NEXUS_MCP_REQUEST_TIMEOUT_MS` plays the same role for the MCP bridge.
  
  ## Deliberate omissions
  
  A route only qualifies if the server holds the connection open across the model
  run itself, so several near misses stay on 30 s: `emulator.sendMessage`, because
  the SERVER bounds its own wait at 25 s and answers `status: "processing"` for a
  slow turn; `evaluations.execute`, `evaluations.judge` and `workflows.testWorkflow`,
  because they acknowledge and run in the background (`testWorkflow` returns
  `{ executionId, status: "RUNNING" }` — its sibling `testNode`, which answers with
  the node's own output, IS in the set); and
  `skills.generateDocumentTemplate`, which renders a docx/pptx rather than
  generating anything with a model. The membership is held by a test, so a new
  synchronous model-running route cannot quietly inherit 30 s again.
  
  ## For the CLI
  
  `task execute` already carried a local 600 s constant; it now derives that number
  from the SDK rather than restating it, and the sibling commands that reach a
  long-running route (`workflow test-node`, `tool execute`, `external-tool test`,
  `prompt-assistant chat`) get the same deadline without each having to remember.
  `--help` and the docs pages say so.
  
  ## Additive
  
  No signature changes. A caller who set `timeout` keeps exactly the behaviour they
  had; a caller who did not gets a deadline that fits the operation.

### Patch Changes

- fa0caec: `nexus mcp` — the outbound MCP endpoint is reachable, and the bridge stops
  losing the organization.
  
  `POST /api/public/v1/mcp` has worked for months and was invisible from the CLI:
  no `mcp` command, nothing in `nexus docs`, and the only way in was
  `nexus api POST /mcp` with a hand-written JSON-RPC envelope. Anyone who found the
  surface found it as a separate npm package and logged in a second time, into a
  second credential store, with a key the CLI was already holding.
  
  `nexus mcp tools list` and `nexus mcp tools get <tool>` read the catalog the
  calling key can see, `nexus mcp call <tool> --input '{…}'` invokes one, and
  `nexus mcp serve` is the stdio bridge running on the active CLI profile.
  `nexus mcp install --client claude-code|claude-desktop|cursor` writes the host
  config block for it — a block that launches this binary and therefore carries no
  API key at all, so a project-scoped `.mcp.json` can be committed.
  
  The parity gap was not only ergonomic. `@agent-nexus/mcp-server` sent `api-key`
  and nothing else, so a personal cross-org token — which belongs to no
  organization, and acts on whichever `organization-id` names — drove MCP against
  the server's default while every other command in the same shell acted on the one
  `nexus auth use-org` selected. Reads answered from another tenant and writes
  landed in it, silently. Both bridges now send the header, and the standalone one
  also honours `NEXUS_PROFILE` and reports the organization in `nexus-mcp whoami`.
