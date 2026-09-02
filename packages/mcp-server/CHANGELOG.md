# @agent-nexus/mcp-server

## 1.1.2
### Patch Changes

- 748f32e: One rule decides which organization you are in
  
  The precedence that picks the acting organization — `NEXUS_ORGANIZATION_ID`
  first, then the profile's stored `orgId`, then nothing and the key's own
  organization decides — had four production spellings across the CLI and the MCP
  bridge. Two were hand-rolled copies of the other two. Both copies agreed with
  the rule on the day they were written, which is exactly why nothing would have
  reported the day they stopped: a duplicated SELECTION rule does not fail when it
  drifts, it picks a different tenant.
  
  ## `@agent-nexus/cli`
  
  **`nexus workspace mount` records the acting organization through the same
  resolver the API calls use.** It picked the mount's org with its own copy of the
  precedence, beside a client that asked the canonical resolver — so a mount could
  be filed under one organization while the requests filling it went to another.
  No flag, no output and no registry format changes; the resolution is now the one
  the rest of the CLI already used.
  
  ## `@agent-nexus/mcp-server`
  
  **`nexus-mcp whoami` derives the `Org:` source label from the resolution it is
  labelling**, instead of re-reading the environment to guess which selector had
  answered. The printed value could not disagree with the header being sent
  today — but a status surface whose label is computed separately from the thing
  it labels is the shape that once had `nexus auth status` reporting one
  organization while every request went to another.
  
  An empty `NEXUS_ORGANIZATION_ID` or an empty stored `orgId` now resolves to "no
  selection" rather than to an empty string, matching the CLI. An empty
  organization header is refused server-side, so this replaces a request that
  could only fail with one that lets the key's own organization decide.
  
  `resolveOrganizationId()` keeps its exact signature — it is exported from the
  package entry point and delegates to the new resolver.

## 1.1.1
### Patch Changes

- 156139c: `~/.nexus-mcp/config.json` holds your API key in plaintext, and its permissions were set once —
  when the file was first created — and never again. Every write since passed `mode: 0o600`, which
  reads as hardening and is not: `open(2)` applies that argument only when it has to CREATE the
  file, and ignores it entirely when the path already exists. The same is true of
  `mkdirSync(dir, { mode: 0o700 })` on a directory that is already there.
  
  So a config file that reached `0644` by any route stayed world-readable through every
  `nexus auth login` after it, with a live key inside. The routes are ordinary: an installer or a
  provisioning script that created the file, a restored backup, a hand-created `~/.nexus-mcp`, or a
  version of this CLI old enough to predate the `mode:` argument. Nothing in either binary ever
  checked, so nothing ever said so.
  
  Both binaries now `chmod` after the write. Every write of a credential-bearing file leaves the
  file at `0600` and `~/.nexus-mcp` at `0700`, whether either existed beforehand or not — including
  the two write paths in `nexus-mcp`, the scoped git credential file `nexus vibe clone` and
  `nexus vibe pull` hand to `git`, the workspace mount registry, and the update-check cache. The
  last two carry no secret of their own; they are here because creating `~/.nexus-mcp` is what
  decides the mode the credential file sits behind.
  
  **Reading a loose config now prints one line to stderr.** Repairing the mode does not undo the
  exposure: while the file was `0644`, every user on the machine could read the key, and a `chmod`
  cannot un-read it. So the CLI says so once per invocation, names the file and its mode, and tells
  you to rotate the key. It is a warning and never a refusal — the command runs, and the line goes
  to stderr, so `--json` output stays a single parseable document.
  
  If you see it, rotate your API key.

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
