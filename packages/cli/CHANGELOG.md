# @agent-nexus/cli

## 0.28.0
### Minor Changes

- 56b8694: A prompt edit can now decline to publish, and it says which one it did
  
  `agent update --prompt` made the new prompt the agent's PRODUCTION version in the
  same call. Every live deployment served it the moment the command returned. There
  was no flag to decline, no confirmation, and the output was a success line and an
  id — so the write and a deploy to real customer traffic were indistinguishable.
  
  An operator staged an edit they believed was private and it answered live WhatsApp
  conversations for about two and a half hours.
  
  ## `autoPublish` on the update, and `--no-publish` on the CLI
  
  `PATCH /v1/agents/:agentId` accepts `autoPublish` beside `prompt`. It defaults to
  `true`, which is exactly what this route already did, so nothing written against
  it changes. `false` writes the draft and leaves the published version serving.
  
  ```
  nexus agent update <agent-id> --prompt ./prompt.md --no-publish
  ```
  
  **The flag was reachable-looking and unreachable before this.** `autoPublish` was
  a hardcoded `true` in the use case, and the update schema did not declare the
  field — so `--body '{"prompt":"…","autoPublish":false}'`, which is the spelling
  `version create --help` teaches, was stripped by Zod and published anyway. That
  is the shape that made this expensive: the caller did the right thing and got the
  wrong outcome with no error.
  
  ## The default is unchanged, deliberately
  
  `version create` resolves the same field differently — it publishes only while
  the agent has never published — and inheriting that rule here would turn every
  scripted `agent update --prompt` into a silent no-op deploy. That is the same
  damage pointing the other way, so this route keeps publishing by default and the
  choice is now the caller's to make.
  
  ## The verdict names the publish
  
  ```
  ✓ Agent updated. Prompt PUBLISHED — live on every deployment.
  ✓ Agent updated. Prompt written to the draft, NOT published.
  ```
  
  Under `--json` the same fact is a `promptPublished` boolean, present only when a
  prompt was sent. The line is read off the merged request body, so `--body` and
  the flag are reported the same way.
  
  ## `--no-publish` cannot protect an agent that has never published
  
  Until a version is published, the DRAFT is what the agent serves, so writing it
  changes behaviour whatever the flag says. `agent update --help` says this, and
  `nexus version list <agent-id>` is the check — an empty PROD column means the
  flag has nothing to hold back.
  
  ## Help and SDK types
  
  `version create --help` scoped its `autoPublish` paragraph to itself: the rule it
  states is that command's, not the platform's, and reading it as platform-wide is
  what sent a prompt live. `agent --help` and `agent update --help` now lead with
  the publish rather than mentioning it in passing.
  
  The SDK's `UpdateAgentBody` and `CreateAgentBody` were missing `prompt`
  altogether, and `AgentDetail.prompt` called itself read-only — three surfaces
  describing a prompt write that has existed for as long as the route has. All
  three now match the contract, and `UpdateAgentBody` carries `autoPublish`.
- 7b2f0d3: A standard WhatsApp template can now carry its per-language map
  
  `deployment template attach` and `deployment template update` both accept
  **`--template-group <json>`**. It is the STANDARD-template sibling of
  `--carousel-template-group`, which those two commands already exposed.
  
  ## The half-wire it closes
  
  Both body schemas have always declared `templateGroup`, and the route has always
  honoured it: the controller copies it onto the template object, the use case
  pushes that object into `whatsappTemplateMessages`, the repository merges it into
  `Deployment.deploymentSettings`, and the send-time resolver reads
  `templateGroup.availableLanguages` to pick a template for the requested language.
  
  Neither command declared a flag for it, and neither carries `--body`. So the
  field was **unreachable from the CLI** — with no error anywhere, because a field
  the CLI never sends produces none.
  
  The consequence was not cosmetic. `--enable-multi-language` turned the setting ON
  for a standard template while the per-language map that setting reads could not
  be supplied through the same command. The switch was expressible and the thing it
  switches on was not.
  
  ## Shape
  
  ```bash
  nexus deployment template attach dep-123 \
    --template-id HX456 --name welcome --description "Welcome message" \
    --enable-multi-language \
    --template-group '{"baseName":"welcome","availableLanguages":[{"language":"en","templateId":"HX456"},{"language":"fr","templateId":"HX789"}],"defaultLanguage":"en"}'
  ```
  
  - `baseName` and `availableLanguages` are required; `defaultLanguage` is optional.
  - Invalid JSON is refused before the request, exactly as `--carousel-template-group`
    is.
  - `--template-group` and `--carousel-template-group` are **mutually exclusive** at
    the route — naming both is a 400. One is for standard templates, the other for
    carousels.
  - On `update`, the flag REPLACES the whole group rather than merging one language
    into it, the same way `--variables` replaces the whole variable map.
  - Naming neither flag sends no `templateGroup` key at all, so an update that only
    renames a template still leaves the stored group alone.
  
  ## Why no gate caught it
  
  This is a MISSING `.option(...)` declaration, and every scanner in this package
  that reads flag declarations is structurally blind to one — there is no call to
  read. `flag-defaults-never-overwrite-body.test.ts` could not have seen it, and
  the contract-help reachability gate covers enum fields only, so an object field
  like this one was outside its population.
  
  The replacement is behavioural:
  `packages/cli/src/commands/deployment-template-group.test.ts` drives both real
  commands and asserts the REQUEST BODY as the SDK serialises it, with the
  flag present and with the flag absent. Asserting the exit code would have passed
  against the bug.
- 870bef6: A WARN ship gate reads as `warn`, and `--ship-gate` can set it
  
  An app's ship gate has three states — `OFF`, `WARN` and `ENFORCE`. The CLI knew
  two of them, in both directions.
  
  ### `vibe app get` told you a running gate was off
  
  The `Ship gate` row rendered `requireVerification`, the server's compatibility
  boolean. That boolean is `shipGateMode === "ENFORCE"`, so `WARN` projects to
  `false` — and an app whose every deploy was reading its repository and writing
  `DEPLOYMENT_VERIFICATION_WARNED` printed `Ship gate: off`. The table and the
  audit feed disagreed and nothing said which was right.
  
  The row now prints `shipGateMode` itself:
  
  ```
  Ship gate  warn — artifacts are checked and a finding does not block
  ```
  
  A backend too old to send the field prints `not reported by this server`, never
  `off`. `requireVerification` still rides `--json` and is still lossy — read
  `.shipGateMode` to decide whether a gate is running.
  
  ### `vibe app update` could not reach WARN
  
  `--require-verification` is a boolean: `true` is `ENFORCE`, `false` is `OFF`.
  There was no flag for the on-ramp state, so the only ways to set it were the
  console or a raw `PATCH`.
  
  ```bash
  nexus vibe app update <app-id> --ship-gate warn
  ```
  
  `--ship-gate` takes `off`, `warn` or `enforce` in any case, and refuses anything
  else rather than reading it as `off`. `--require-verification` keeps working on
  its own; passing both is refused, because they write the same field and only one
  of them can express `warn`.
- 7abfa0e: An archived ticket is readable again, says it is archived, and refuses writes with 409 instead of a provider error.
  
  `TicketDetail` gains `archivedAt`, and `nexus ticket get` prints it as `Archived`:
  
  ```ts
  const ticket = await client.tickets.get("NEX-3464");
  if (ticket.archivedAt) {
    // read-only from here: update / comment / attach all answer 409
  }
  ```
  
  **What used to happen.** `POST /tickets/:id/comments` answered `500 INTERNAL_ERROR` on an
  archived ticket. The provider refuses `commentCreate` and `attachmentCreate` on an archived
  issue with `Entity not found: Issue — Could not find referenced Issue.`, and nothing on this
  route caught it. Four production requests hit exactly that on 2026-08-06, every one of them
  against a ticket archived 72 minutes earlier, and every one of them addressing it by uuid —
  so the id form was never the cause.
  
  **The sentence the provider offers is the one thing this must not repeat.** "Could not find
  referenced Issue" contradicts the `200` that `GET /tickets/:id` returns for the same id one
  call earlier. The refusal now names the real reason and the date:
  
  ```
  409  Ticket NEX-3464 was archived on 2026-08-06T19:42:31.569Z and is read-only.
       It no longer accepts comments.
  ```
  
  **Your own archived tickets stopped being readable, and that is fixed here too.** Ownership
  is a join to your organization, and archiving a ticket archives that join with it — so an
  archived ticket answered `404` on every route, including the read, for the organization that
  filed it. The ownership question now includes archived rows. It widens what counts as
  _evidence_ of ownership, never what counts as a grant: no join, no access, exactly as before.
  
  **Three routes now answer 409 where they answered 500, 400 or 200.** `POST
  /tickets/:id/comments` and `POST /tickets/:id/attachments` were already failing — this makes
  the failure legible and cheap (the attachment is refused before it is uploaded). `PATCH
  /tickets/:id` is the behaviour change to check: it used to succeed against an archived
  ticket, writing an edit into a ticket nobody will look at again. A caller that edits tickets
  in bulk should read `archivedAt` and skip, or handle 409.
  
  **Nothing changes for a live ticket.** `archivedAt` is `null`, and every route behaves
  exactly as it did.
- 02db0d9: `nexus auth switch` can bind a folder or a shell, so two sessions can hold two organizations.
  
  **The switch was machine-wide and nothing said so.** It writes one value — `activeProfile`
  in `~/.nexus-mcp/config.json` — that EVERY process on the machine reads. Two sessions on
  two organizations therefore shared one selection: the later switch won for both, and the
  session that lost was told nothing, mid-task. The reported incident is not a wrong list —
  a bug ticket and a Vibe app were CREATED in the other organization while the session
  believed it was elsewhere, and `credential list` returning the other tenant's rows nearly
  filed a spurious "credentials are vanishing" bug.
  
  Two scopes now sit on the verb that changes organizations:
  
  ```bash
  nexus auth switch work --here                 # this DIRECTORY (writes .nexusrc)
  eval "$(nexus auth switch work --session)"    # this SHELL (writes nothing)
  nexus auth switch work                        # THIS MACHINE — unchanged
  ```
  
  `--here` writes the same `.nexusrc` as `auth pin`, and re-running it MOVES an existing pin.
  `--session` writes nothing anywhere: a process cannot set a variable in the shell that
  spawned it, so the binding is DELIVERED — one `export NEXUS_PROFILE="<name>"` line on
  stdout, **alone**, because a stray byte there is executed by the caller's `eval`, with the
  confirmation and any warning on stderr. Unevaluated it does nothing; the printed line is
  the whole effect. It refuses a profile name that is not a plain name rather than
  shell-quoting it, and under `--json` it is one document carrying the raw name, for shells
  that are not POSIX.
  
  Neither level is new — `NEXUS_PROFILE` and `.nexusrc` have always outranked the active
  profile. What was missing is that nothing reached them from `switch`, so the only
  discoverable way to change organization was the one that reaches every other session.
  
  **The machine-wide form now names what it repoints.** With more than one profile saved it
  says so and names the two scopes that would not have. The existing wrong-org guard (which
  warns and exits non-zero when a higher-precedence selector shadows the switch) is shared
  with `--here`, and its remedies now name the new forms: `--here` moves a pin, `--session`
  rebinds a shell.
  
  **`auth status` was reporting an organization the commands were not using.** Every command
  sends `NEXUS_ORGANIZATION_ID` when it is set, falling back to the profile's `orgId`;
  `status` printed the profile's value unconditionally. The one command asked "which
  organization am I in" was the only one that answered with the organization you were not
  in — in exactly the per-shell setup this release is about. The precedence now has a single
  definition read by both, `--json` gains `orgSource` (`env` | `profile` | `token`), and
  under the env selection the stored organization NAME is withheld rather than printed: it
  describes the profile's organization, and beside another id it names the wrong customer.
  
  **The documented precedence was wrong, in two places.** The README and the authentication
  page both ranked `--api-key`/`NEXUS_API_KEY` together at the top, while an explicit
  `--profile` has outranked an exported `NEXUS_API_KEY` since it was fixed — which is what
  makes `--profile` the reliable per-command escape hatch. The real order, now stated in
  `--help` and both pages: `--api-key` > `--profile` > `NEXUS_API_KEY` > `NEXUS_PROFILE`
  (`--session`) > `.nexusrc` (`--here`) > active profile (plain `switch`) > `default`.
  
  Still shared, and left for a follow-up: `auth use-org` writes the acting organization onto
  the profile, so two sessions holding ONE cross-org token collide there the same way.
  `NEXUS_ORGANIZATION_ID` is the per-shell way out today.
- a12ca27: `collection list` pages with `--offset`, and `customer list` filters by `--tag`
  
  Two list commands accepted fewer parameters than their routes did. Same
  mechanism both times, and it is the one no scanner catches: a **missing
  `.option()` call**. A flag that is declared and mis-parsed leaves a trace; a flag
  that was never declared leaves none — `--help` shows what the command has, the
  contract block under it shows what the ROUTE takes, and nothing compares the two.
  
  ## `nexus collection list --offset <n>`
  
  The route has always paginated by offset — `offset` is in its query schema with a
  floor of 0, and the service applies it as `skip`. The CLI declared `--search` and
  `--limit` only, so **there was no way to see past the first page**, and `--limit`
  is capped at 100.
  
  ```bash
  nexus collection list --limit 20 --offset 20    # page two
  ```
  
  **The total now prints under the table**, because `--offset` without it is half a
  feature — an operator paging with no total has no way to know when to stop:
  
  ```
  57 total · more available
  ```
  
  ⚠️ **`--json` is unchanged and still a BARE ARRAY**, with no total in it. That
  shape is documented and scripts already read it, so adding a field would have
  been a breaking change. A script that pages has to count what it has received
  against a total read some other way.
  
  The help said *"There is no `--page` on this command, so `--limit` is the only
  control."* That presented a CLI gap as a property of the route. It is replaced
  rather than deleted — it now says how to page, that `--offset` counts from 0, and
  that the total under the table is the signal to stop.
  
  ## `nexus customer list --tag <tag>`
  
  `customer update --body '{"tags":["vip"]}'` is the documented way to SET a tag,
  and the list route has always accepted a `tag` filter — so **a tag could be
  written and never filtered by**.
  
  ```bash
  nexus customer list --tag vip --limit 50
  ```
  
  **One tag, matched exactly.** No multi-tag form, no OR, no partial match: the
  filter asks whether the customer's tag array CONTAINS this exact string, so
  `vip` matches neither `VIP` nor `vip-eu`. Unlike `--sort-by`, `--sort-order` and
  `--channel`, it is not validated locally — any string is accepted, and a tag
  nobody carries is an empty list rather than an error.
  
  ## `@agent-nexus/sdk`
  
  `ListCustomersParams` gains **`tag?: string`**. The route has always accepted it
  and this hand-written interface did not declare it, so the filter was unreachable
  through the SDK and through the CLI built on it. Additive, and a compile error
  for nothing.
  
  🚨 **`filters`, `sorts` and `groupBy` are deliberately still absent** from both
  the SDK type and the CLI, even though the route's query schema declares all
  three. The public v1 handler destructures them away and never passes them on, so
  a flag for any of them would be accepted by the client and silently discarded by
  the server — an advertised, *reachable*, silently-ignored parameter, which is
  worse than the gap this release closes. A test pins their absence.
- d2dc04a: Two places where the data existed and the command could not reach it.
  
  ## `collection search` gains `--include-metadata`
  
  The route has accepted `includeMetadata` since NEX-3228 — the body schema
  declares it, the controller destructures it, and the search returns the
  document's `searchMetadata` column when it is true. The CLI declared no flag and
  sent no field, so `metadata` came back a literal `null` on every hit, at 200,
  with nothing to indicate a flag had been missed.
  
  The `--help` said the null was the route's doing:
  
  > METADATA COMES BACK null and no flag on this command changes that.
  
  It now names what the flag fills, and says it is a DIFFERENT source from the
  identically-named flag on `collection query`. This one returns the DOCUMENT's own
  attribute bag — the same one `nexus document get` prints. That one returns the
  retrieval provider's SNIPPET payload. So a `null` with the flag on means "this
  document carries no attributes", on either command, and never "you forgot the
  flag".
  
  `collection search-multiple` still has no such flag, and its warning is unchanged
  because it is still true there: the multi-collection schema declares no
  `includeMetadata` field and the server hardcodes `metadata: null`. Reaching
  metadata across several collections means one `collection search` or
  `collection query` per collection.
  
  ## `tracing cost-breakdown` keeps the label of a deleted agent or deployment
  
  Spend attributed to anything deleted rendered as a bare UUID with a blank
  AGENT or DEPLOYMENT column, so a row you could not name looked identical to a row
  nothing could be attributed to.
  
  The data was never lost. `LLMTrace`'s attribution columns deliberately carry no
  foreign key — an attribution has to stay valid after its referent is gone — and
  the schema states what an id resolves against: the live table UNION its
  tombstone. A hard delete writes `DeletedAgent` / `DeletedDeployment` in the same
  transaction that drops the row, precisely to keep the name. Only the live half
  was ever read.
  
  Agent was blank in a second way as well: the label lookup filtered `deletedAt:
  null`, so an agent merely SOFT-deleted — whose row is still there and still
  restorable — lost its label too. The deployment lookup beside it had never done
  that, and the asymmetry was the defect.
  
  **No number moves.** Which rows exist, what each is charged, the trace and
  generation counts and the unpriced disclosure are all computed from the trace
  aggregate and are untouched. This restores a NAME on a row that already existed.
  
  - `--group-by agent` and `--group-by deployment` both gain the labels, on the
    single-dimension and the multi-dimension (`--group-by a,b`) paths alike.
  - An id that resolves in neither table still reads null. `customer`,
    `workflowExecution` and `workflow` have no tombstone table at all, so a
    hard-deleted referent on those three is unrecoverable as a label and correctly
    stays null.
  - Every label read stays scoped to the caller's organization, tombstones
    included.
- 42e251c: `nexus role` organises a Role's Overview lanes
  
  A Role's boards are how its systems are organised, and everything a Role holds
  lands in `Ungrouped` until something places it. Six new verbs, so a Role built
  from the terminal can be finished from the terminal instead of arriving as one
  undifferentiated pile that only a browser could tidy.
  
  ```bash
  nexus role boards "Support agent"
  nexus role add-board "Support agent" --name "Automation" --accent teal
  nexus role move-card "Support agent" agent 7c2e9a10-4b6d-4f81-8a35-1d9e0c7b2f44 --board-id <lane>
  ```
  
  | verb | |
  |---|---|
  | `role boards <role>` | every lane, and where each card sits |
  | `role add-board <role> --name [--accent]` | append a lane |
  | `role reorder-boards <role> --board-ids` | set the order of every lane |
  | `role update-board <role> <board-id>` | rename, recolour, or both |
  | `role remove-board <role> <board-id>` | delete a lane; its cards fall to Ungrouped |
  | `role move-card <role> <card-type> <card-id>` | move one card, or unplace it |
  
  Needs `role_boards:read` to look and `role_boards:write` to change, plus the
  Role's own `board.view` / `board.manage` capability — the scope alone is not
  enough.
  
  ## Four things the help says, and this repeats because they cost a call each
  
  ⚠️ **`<card-type>` IS LOWERCASE** — `agent`, `workflow`, `deployment`, `ai_task`,
  `document_template`, `collection`, `workspace`, `external_tool` — unlike the
  SCREAMING_CASE resource types everywhere else on this API. It is validated
  locally against the contract, so a wrong value is refused with the valid list
  rather than becoming a 400 that names nothing.
  
  ⚠️ **`move-card` needs exactly one of `--board-id` or `--unplace`.** Ungrouped is
  a real destination rather than a missing value, so there is no "send nothing to
  unplace it" — that would make a forgotten flag look like a deliberate move.
  
  ⚠️ **`reorder-boards --board-ids` asserts the WHOLE list.** Send every board id,
  not the ones you moved. A set that is not exactly the Role's current boards is a
  409 — refetch with `role boards` and retry. That refusal is the point: silently
  renumbering a stale list would leave a board somebody else just created at a
  position nobody chose, and report success. A repeated id is a 400 instead,
  because no refetch fixes it.
  
  ⚠️ **`remove-board` deletes the LANE, never the cards.** They move to Ungrouped
  and nothing the Role holds is removed or stopped; `cardsUnplaced` counts how many
  moved. The PLACEMENTS are gone though — recreating the board does not put the
  cards back.
  
  **A board carries no permission and no execution meaning.** Moving a card changes
  where it is drawn on the Overview screen and changes nothing about what the Role
  can reach or what runs. Use `role attach` / `role detach` for holdings and the
  permission-set verbs for authority.
  
  Under `--json`, an unplaced card's `boardId` is `null` rather than the word
  "Ungrouped" — the terminal shows the sentence, scripts read the null.
- 76eaf12: `deployment template update` can turn a setting OFF instead of accepting the flag and doing nothing
  
  `nexus deployment template update` declares four flags for two settings:
  
  - `--enable-multi-language` / `--no-multi-language`
  - `--enable-dynamic-size` / `--no-dynamic-size`
  
  The two negative flags parsed, were accepted, contributed **nothing** to the
  request body, and the command printed `Deployment template updated.` over an
  unchanged setting. Turning multi-language off was not expressible through this
  command at all — the only signal an operator got was a success verdict.
  
  ## Why it happened, because the cause is a naming rule and not a branch
  
  Commander derives an option key from that option's **own** long name. So
  `--enable-multi-language` writes `opts.enableMultiLanguage` and
  `--no-multi-language` writes `opts.multiLanguage`: one setting, two flags, two
  keys that never meet. The action read only the `enable*` keys, so the value the
  operator typed was written to a key nothing read.
  
  The endpoint was never the problem. `UpdateDeploymentTemplateBodySchema`
  declares `enableMultiLanguage: z.boolean().optional()` and the use case merges
  the parsed body over the stored template, so `false` has always been accepted
  and applied. Only the CLI never sent it.
  
  ## What changes
  
  - **`--no-multi-language` sends `enableMultiLanguage: false`**, and
    `--no-dynamic-size` sends `enableDynamicSize: false`.
  - **Naming neither flag still sends no key at all**, so a `--name`-only update
    leaves both settings exactly as stored. This is load-bearing rather than
    incidental: a `--no-x` flag declared with no positive twin on its own key
    carries commander's implicit default `true`, so forwarding the value
    unconditionally would have written `enableMultiLanguage: true` into every body
    that never mentioned it — the same silent write, in the opposite direction.
  - **Naming BOTH spellings of one setting is now refused** with exit 1 and the
    usual `{"error":{"message","hint","code"}}` body, before any request is sent.
    The two flags sit on separate commander keys, so no ordering between them is
    recorded and there is no last-one-wins to read; picking a winner would guess
    at what the operator meant. `--help` states this.
  
  ⚠️ **A caller that passes both spellings today is refused instead of silently
  getting the ENABLE behaviour.** That combination has no defensible meaning and
  the refusal names both flags; send one of the two.
  
  ## Why the existing gate did not catch this, and what pins it now
  
  `flag-defaults-never-overwrite-body.test.ts` is the gate for exactly this defect
  class and it is structurally blind to the whole `--no-*` family: it reads the
  literal default argument of an `.option(...)` call, and a `--no-x` flag declares
  none — commander implies its `true`. It stayed green through the entire life of
  this bug and nothing about it changed here.
  
  The fix is pinned instead by a behavioural test asserting the **request body**
  for every case — flag absent, `--enable-*`, `--no-*`, both — because every one of
  those spellings exited 0 before the fix and exits 0 after it. A test asserting
  that the command succeeded passes against the bug.
- 3735ca0: The prompt assistant can be WAITED ON — the prompt arrives without polling for it
  
  `prompt-assistant chat` already polled. It stopped at the wrong line: the moment
  the thread left `in_progress`.
  
  `generating` is not "done". It means the assistant has stopped talking and a
  SECOND background job is writing the prompt, which is where the minutes go. So
  the command returned `status: generating`, no `promptResult`, and exit 0 — and
  the only way to learn the prompt existed was to poll `get-thread` by hand. Two
  production threads took 13.0 and 25.7 minutes end to end, and both were reported
  idle by their caller while still generating.
  
  ## SDK — `waitForThread`
  
  ```ts
  const before = await client.promptAssistant.getThread(threadId);
  await client.promptAssistant.chat({ message, mode: "agent", threadId });
  
  const { thread, outcome } = await client.promptAssistant.waitForThread(threadId, {
    afterMessageCount: before.messages.length
  });
  
  if (outcome === "terminal" && thread.status === "completed") {
    console.log(thread.promptResult?.prompt);
  }
  ```
  
  It waits THROUGH `generating`, and it ends on a follow-up question rather than
  blocking on a thread that is waiting for the user — the assistant usually asks
  something before it can generate, and `in_progress` is not a state waiting ever
  leaves.
  
  **A TIMEOUT IS AN OUTCOME, NOT AN EXCEPTION.** The work continues server-side, so
  it comes back as `outcome: "timed-out"` carrying the last observed thread, and
  the caller resumes by calling again with the same id. Throwing would force the
  one payload the caller needs into an error's properties.
  
  Transient failures are absorbed — a 500 or a dropped connection mid-wait is
  retried until the deadline, since a half-hour poll that dies on one bad response
  is the thing this removes. 400/401/403/404 are rethrown at once. Polling backs
  off 2s → 15s, because a thread response carries every message and a fixed 2s poll
  over 26 minutes is ~780 full-transcript downloads.
  
  ## CLI — `--wait` on both verbs
  
  ```bash
  nexus prompt-assistant chat --message "Create a support agent" --mode agent --wait
  nexus prompt-assistant get-thread <thread-id> --wait --wait-timeout 3600
  ```
  
  `--wait-timeout <seconds>` defaults to 1800 — above the 25.7 minutes observed,
  because a default under the observed maximum times out on the exact case the flag
  exists for.
  
  **BOTH EXIT NON-ZERO ON A TIMEOUT OR A FAILED/CANCELLED THREAD.** Exiting 0 with
  a `generating` status is the original defect one layer down: the caller reads
  "the command returned" as "the prompt is ready".
  
  Without the flag, the shorter pre-existing poll is unchanged, so nothing that
  already scripts `chat` inherits a thirty-minute block.
  
  ## `status` now spells `cancelled`
  
  `PromptAssistantThreadResponse["status"]` was a four-value union against a
  five-member database enum. A caller deriving "which statuses are final" from that
  type — as a wait loop must — got a terminal set missing one of its three members,
  and waited out its whole deadline on a thread that had already stopped.
  
  ## A terminal status can belong to the PREVIOUS turn
  
  The server never resets `status` when a new user message arrives, so a second
  turn on a `completed` thread starts life reading `completed` and carrying turn
  one's `promptResult`. `afterMessageCount` is what makes the wait survive it: a
  terminal status counts as this turn's verdict only once the wait has seen the
  thread pass through `generating`, or seen the status move at all.

### Patch Changes

- 8b30ed4: `access-card list --credential-id` no longer answers "Credential not found" for an id that
  names a credential you hold — under its other name — and `credential delete --help` now says
  what an answer from the check it mandates is worth.
  
  `credential delete --help` tells you to run `nexus access-card list --credential-id <id>`
  FIRST, because deleting a credential deletes every access card on it and repoints nothing.
  That check already stopped answering an empty list for an id naming no credential; it now
  refuses. So the remaining way to be reassured wrongly is the id you actually hold and paste:
  `nexus tool credentials <tool-id>` prints `ToolCredentials.id` under a column headed `ID`,
  `nexus credential list` prints `Credential.id` under a column headed `ID`, both are UUIDs,
  and they name the same connected account. Neither namespace accepts the other's.
  
  Pasting the tool-scoped one therefore passed validation and came back 404 `Credential not
  found` — which, immediately before an irreversible delete, reads as *this credential is
  already gone*. That is the original defect's conclusion reached one step later.
  
  The refusal now resolves the other id space and names the unified id when it can, under the
  code `CREDENTIAL_ID_IS_TOOL_SCOPED` with both ids in `details`. The CLI's 404 branch reads
  the next-step table it previously only consulted for a 409, so a terminal reader is told
  which command prints which id instead of being sent to re-list what they already listed. An
  id that names nothing in either space is refused exactly as before, and the second lookup
  runs only on the refusal path.
  
  `--help` gains the facts behind it:
  
  - `access-card list` states that `--credential-id` is the unified id from `credential list`,
    that the `tool credentials` id is a different space, and that an unknown id is refused
    rather than answered with an empty list — so a refusal is not evidence the credential is
    gone.
  - `credential delete` states that the pre-delete check is only evidence if it ANSWERED, and
    that a refusal means "wrong id", never "nothing to lose" and never "already deleted".
  - `tool credentials` gains a `Notes:` block at all: its `ID` column is tool-scoped, only
    `tool delete-credential` takes it, and a tool holds many rows rather than one.
- af4a0f8: `nexus admin vibe-build-job` and `nexus admin vibe-deployment` now say what each
  verb does to the row it touches.
  
  These commands drive two state machines by hand, one verb per transition, and
  most of them shipped with no `--help` body at all — so the operator reaching for
  one during a wedged build had the verb name and nothing else. Each now states the
  transition it performs, which flags are validated before any request is sent, and
  which of its inputs are shown to the customer rather than kept internal.
  
  Nothing here is new behaviour. Every sentence is read off the route the command
  calls, and the verbs whose behaviour was not legible from that route were left
  alone.
- 8d97fed: `collection attach-documents` names the ids it could not resolve, and stops refusing a repeat
  
  `nexus collection attach-documents <id> --document-ids "doc-1, doc-2"` came back
  as a **404 naming a document id the operator could not find in what they typed**.
  The flag split on the comma and sent every entry verbatim, so the space after it
  travelled as part of the id. `nexus collection search-multiple`, one command
  away in the same namespace, trimmed — so the two disagreed about the same
  comma-separated form.
  
  A REPEAT produced the same opaque 404. The route resolves the ids with one
  `findMany` and compares its row count against the length of the list it was
  handed, so `doc-1,doc-1` read as one-of-two-missing and refused a request that
  is semantically fine — and that the write itself already treats as idempotent.
  
  ## `--document-ids` and every `--…-ids` flag now parse the same way
  
  One parser serves `collection attach-documents`, `collection search-multiple`,
  `agent-collection attach|detach` and `cloud-import`:
  
  - **whitespace around a comma is trimmed**, so `"doc-1, doc-2,"` sends two ids;
  - **empty entries are dropped**, so a trailing comma is not an empty id;
  - **a list that is empty once trimmed is refused locally, by flag name**
    (`--document-ids needs at least one ID`), with no request sent — instead of a
    400 that names the field but not which of the command's flags produced it.
  
  De-duplication is deliberately NOT done here. It belongs to the route, which is
  the layer every client reaches.
  
  ## The refusal names its cause
  
  A document id that does not resolve is still a 404 and the call is still
  all-or-nothing — nothing is attached. What changed is that the refusal says
  WHICH ids:
  
  ```
  Documents not found or not accessible: " doc-2", "doc-9"
  ```
  
  Each id is quoted, so a leading or trailing space is visible rather than
  invisible. `--json` carries the same list under
  `error.details.missingDocumentIds`, and the error code is `DOCUMENTS_NOT_FOUND`
  — distinct from `Collection <id> not found`, which is the collection itself
  being absent, deleted, or another tenant's. The two causes can no longer absorb
  each other.
  
  This reveals nothing new: every id in the list came from the caller, and sending
  one on its own already answered the same question.
  
  ## A repeated id is one attachment, not a 404
  
  The route de-duplicates before it resolves, so `doc-1,doc-1` links `doc-1` once
  and succeeds. The response's `N document(s) attached` counts the distinct ids.
  
  ⚠️ That count is still what was REQUESTED, not what was LINKED. Folder ids are
  dropped server-side and are not counted out, so a call naming only folders still
  reports a number and attaches nothing. `nexus collection documents <id>` remains
  the only proof.
- d3550d8: `collection --help` no longer tells you to delete a document you meant to unlink
  
  `collection remove-document` used to clear the link in the database and leave the
  cached membership alone, so retrieval kept answering from a document somebody had
  deliberately unlinked. The help said so, in three places, and the last sentence of
  the note drew the conclusion: *"Removing a document from an agent's reach
  IMMEDIATELY means deleting the document, not unlinking it."*
  
  That route now clears the cached membership too, and that cache is what retrieval
  is filtered by — so the document is out of reach on the NEXT query. Following the
  old advice deletes a document when unlinking was enough.
  
  Three notes change:
  
  - **`collection remove-document`** — the retrieval-lag warning is replaced by
    `RETRIEVAL STOPS AT THE NEXT QUERY`.
  - **`collection list`** — the `DOCS` note is NARROWED, not removed. Attaching and
    removing both rewrite the stored counter now; DELETING a document still does
    not, so the column reads high after `nexus document delete` until the next
    attach or remove. The note now names that verb instead of `remove-document`.
  - **the `collection` namespace root** — said attaching and removing both lag
    retrieval, with one reason for both. Only attaching lags, and for its own
    reason: the document still has to finish indexing.
  
  `nexus collection --help` and the three subcommands are the only user-visible
  change; no flag, argument, output shape or exit code moves.
- 796d865: `customer get-by-external-id` now returns the customer's recent sessions
  
  `recentSessions[]` came back EMPTY on this lookup for every customer, whatever
  their history. The route serialized the customer detail shape but its query
  loaded the channel identities alone, so the array was structurally `[]` and
  nothing anywhere reported an error. A script reading it concluded the customer
  had never had a session.
  
  The array now carries the 20 most recent sessions, newest first — the same
  content, and the same bound, that `nexus customer get <id>` returns.
  
  ⚠️ This is a behaviour change on a response you may already be parsing. Nothing
  is removed and no field changes type; a field that was always empty now holds
  data. If you branched on `recentSessions.length === 0` to mean "we have no
  history for this person", that branch was reading a defect and will now take the
  other path.
  
  The `--help` note stating the field is not populated on this route is deleted.
- de60b82: `customer list` stops advertising three parameters the API discards
  
  `nexus customer list --print-contract` and `--help` listed `filters`, `sorts` and
  `groupBy` as parameters of `GET /public/v1/customers`. All three were inert:
  
  - **`filters` and `sorts`** are destructured out and dropped by the public
    handler, so a filtered request returned an UNFILTERED list at HTTP 200 with a
    full, correct-looking `total`. There was no error, no empty result and no wrong
    count — an integrator reading the descriptor had no signal at all that the
    parameter was ignored.
  - **`groupBy`** was never implemented on any route, public or internal. It has
    been deleted rather than hidden: no route had anything to hide.
  
  The v1 contract now narrows its `Params` with `.omit()`, so the generated
  descriptor no longer names them. Nothing else about the command changes — `tag`,
  `search`, `channel`, `sortBy`, `sortOrder`, `page` and `limit` all work exactly as
  before, and `--tag` in particular is honoured end to end.
  
  ⚠️ **The route still ACCEPTS `filters` and `sorts` and still discards them.** This
  release fixes what the CLI ADVERTISES, not what the API does with a hand-rolled
  request. Whether the public route should implement structured filtering is a
  product decision about committing those field and operator sets to the v1
  contract; the parser it would adopt now exists and refuses malformed input.
  
  The same narrowing removes the three parameters from the `customers_list` **MCP
  tool** schema, which is generated from the same contract slot.
- 965f2c3: Four commands declared a flag as optional and then refused to run without it.
  The flag is now declared required, so the refusal comes from the parser instead
  of from inside the command.
  
  - `nexus external-tool test-auth` — `--operation-id`
  - `nexus tool resolve-options` — `--body`
  - `nexus task-eval dataset add` — `--body`
  - `nexus template generate` — `--body`
  
  ⚠️ **The message changes; nothing else does.** Omitting one of these used to
  print `--body is required.` It now prints
  `error: required option '--body <json>' not specified`, and the call is rejected
  before any request is built. Measured on the real CLI: the exit code is still 1
  and the structured error code is still `CLI_INVALID_ARGUMENTS`, so a script
  reading either is unaffected — only one matching the message text needs updating.
  
  `--help` now shows these flags in the required position, which is the point: the
  declaration and the behaviour agreed with each other only by accident before, and
  `--help` sided with the declaration.
- dc1d5ed: `agent-skill`, `agent-tool`, `access-card` and `version` now show example ids
  their routes accept.
  
  Their examples spelled ids as `agt-123`, `abc-123`, `skl-456`, `tool-456`,
  `ver-456`, `xyz-456` and `<agent-id>` while the routes behind them require a
  UUID, so an example copied out of `--help` came back as a validation error
  against an id the help itself supplied.
  
  These four looked clean until now only because the checker could not read them:
  it followed a command to its SDK call by matching the final path segment, and a
  nested resource or a query string defeated the match. With that fixed, every
  example they ship became checkable — and 39 of them were wrong.
- db94197: Nine `--help` namespaces now show example ids the routes actually accept:
  `analytics`, `channel`, `cloud-import`, `conversation`, `document`, `execution`,
  `permissions`, `role` and `template`.
  
  Copying an example straight out of `--help` used to fail. The ids in them were
  written as `doc-123`, `exec-123`, `tmpl-123`, `conn-1`, `<id>` and `1111...`,
  while the routes behind those commands require a UUID — so
  `nexus document get doc-123` came back as a validation error against an id the
  help itself had supplied, and nothing distinguished that from a typo. Every
  example now carries a real UUID, and where an example names two different ids it
  carries two different UUIDs.
  
  `collection attach-documents` also states, for the first time, that a document id
  is a UUID even though this one route does not check the format: the sibling
  `collection remove-document` refuses a malformed id at the edge, while attach
  passes it through to the database, where it lands in an all-or-nothing 404 that
  names no id.
- a9fb4b9: `--help` caveats that were already written now sit under a `Notes:` heading,
  where a reader of any other command looks for them.
  
  Several commands carried real warnings — what a delete takes with it, which of
  two ids a column shows, what a flag does not do — as loose paragraphs above the
  examples, with no heading. The text was there and in the one place nobody scans.
  Nothing in this change invents a caveat: each block is the command's own existing
  prose relocated verbatim, plus, in a few places, a field the response schema
  genuinely carries that the prose had omitted.
  
  Commands with no such prose and no schema fact to state are left alone rather
  than given filler.
- ba64df9: Seven more `--help` namespaces now show ids the routes accept and state what
  their listings hide: `access-card`, `asset`, `custom-model`, `folder`,
  `html-template`, `ticket` and `user-group`.
  
  The ids in their examples were written as `abc-123`, `tpl-123`, `cm-123`,
  `asset-123`, `fld-456` and `1111...` while the routes behind them require a
  UUID — so an example copied out of `--help` came back as a validation error
  against an id the help itself had supplied. Every example now carries a real one,
  and where an example names two different ids it carries two different UUIDs.
  
  Two examples could not be run at all because they named a file that does not
  exist; they now show the inline form and say where the file form applies.
- 050fae4: Six `--help` namespaces stop spelling a slug where the route demands a UUID:
  `agent`, `agent-collection`, `collection`, `credential`, `phone-number`, `task`.
  
  Every one of the 26 defects was the same shape. `abc-123`, `agt-123`, `col-123`,
  `task-123` and `doc-456` sat in a path slot whose `PathVars` is
  `z.string().uuid()` — `AgentIdParamSchema`, `CollectionIdParamSchema`,
  `TaskIdParamSchema`, `CollectionIdDocumentIdParamSchema` and their siblings — so
  every example that named an id was a 400 a reader could not tell from a typo.
  They now use `11111111-1111-4111-8111-111111111111`, with
  `22222222-2222-4222-8222-222222222222` where a second, different id is needed.
  
  `agent-collection attach` and `detach` share one help template and do NOT share a
  schema: attach types `collectionIds` as `z.array(z.string().uuid())` while detach
  types it as `z.array(z.string())`. The template's `id-one,id-two` was therefore
  wrong for attach and right for detach, and the gate abstains on exactly that
  disagreement because it requires every resolved route to refuse before it reports.
  Both examples now carry real UUIDs, which are valid for both verbs.
  
  `collection attach-documents` gains the asymmetry it never stated.
  `AttachCollectionDocumentsBodySchema` types `documentIds` as a plain string array
  while `collection remove-document` types the same id as a UUID and refuses
  anything else with a 400. So a malformed document id is named at the edge on one
  route and reaches the database on the other, where it lands in the
  all-or-nothing 404 that names no id. Its example carries real UUIDs now, and the
  note says why the schema will not tell you.
- 9a90ee2: The last five `--help` namespaces now show ids their routes accept and state what
  their listings leave out: `deployment`, `emulator`, `external-tool`, `task-eval`
  and `tool`.
  
  Their examples spelled ids as `dep-123`, `scn-123`, `task-123`, `tool-123`,
  `ext-123` and `<toolId>` while the routes behind them require a UUID, so an
  example copied out of `--help` came back as a validation error against an id the
  help itself supplied. That includes the ids inside `--body` payloads, which reach
  the API exactly as written.
  
  Every example now carries a real UUID, and an example naming several different
  ids carries a different UUID for each, so the ones meant to differ still do.
- 8e6298a: `tracing traces --agent-id` now returns the AI-task traces that
  `tracing cost-breakdown --group-by agent` already charges to that agent.
  
  **Expect a LARGER result set for the same command.** Any agent that runs AI tasks
  was being charged for traces this filter did not list, so a spend figure and an
  inspection of the traces behind it disagreed — and the list was the half that was
  wrong. `tracing generations --agent-id` and `tracing export-bulk --agent-id` were
  short in the same way and return the same widened set now.
  
  The `AGENT` column stops reading `-` on those rows, and the `agentId` column of a
  CSV export stops being blank for them.
  
  A trace whose agent was recorded one way and later re-attributed to a different
  agent belongs to the agent it is currently attributed to, and to that one only —
  it is not returned for both.
  
  `--workflow-id` is unchanged and still matches only the workflow recorded on the
  trace, so it can still be short against `cost-breakdown --group-by workflow`.
- 3d87a8e: `nexus vibe …` caveats now sit under a `Notes:` heading.
  
  Almost every `vibe` command already carried the warning a reader needs — what a
  delete takes with it, which id a column shows, when a route answers 404 — as a
  loose paragraph with no heading. The text was there and in the one place a reader
  of any other command does not look for it.
  
  Nothing is reworded. Each block gets a heading and keeps its wording exactly,
  which is also why every existing help probe still matches.
- 86be876: Every `nexus workflow …` example now carries an id the route accepts, and the
  three leaves that hid their caveats above their examples put them under `Notes:`.
  
  `Workflow.id` is a `@db.Uuid` and `WorkflowIdParamSchema` is `z.string().uuid()`,
  so the `wf-123` that all 29 id-taking `workflow` examples spelled was a 400 the
  reader could not tell from a typo. The examples now use a real UUID.
  
  The placeholder that replaced it is not the one this repository has been reaching
  for. `11111111-1111-1111-1111-111111111111` is REFUSED by `z.string().uuid()` —
  the variant nibble has to be one of `8/9/a/b` and that string carries a `1` — so
  the literal used as "obviously a placeholder UUID" is not a UUID at all. The
  route said so on `nexus permissions access`, which shipped it and was recorded as
  a violation. Both `permissions access` and `role get` now spell it
  `11111111-1111-4111-8111-111111111111`: the same string at a glance, version 4,
  variant 8, and accepted.
  
  `workflow node test`, `workflow node test-payload` and
  `workflow platform-listener-events` each carried real prose ABOVE their examples
  with no `Notes:` heading — the content existed, in the one place a reader of any
  other command does not look. It now sits under `Notes:` like every sibling.
  
  `workflow platform-listener-events` also gains what it never said: the table
  prints 3 of the 6 fields a row carries, and `description`, `filterFields` and
  `samplePayload` — the three needed to author a subscription — are `--json` only.
  `filterFields` enumerates the valid keys and operators for the trigger's
  `filters.conditions[]`. Events marked `comingSoon` are dropped server-side and
  never appear here.
  
  `workflow node create` drops its `--body payload.json` example and states the
  rule instead: `--body` takes inline JSON, a `.json` path, or `-` for stdin, and
  THIS command resolves the file before the action runs, because `--type` is also
  required and the pre-action check has to know which fields `--body` supplies.
  That is why a missing file fails at parse time here and in the action on a
  command whose only required flag is `--body`.

## 0.27.0
### Minor Changes

- e549e24: A CODE workspace is mounted read-only instead of read-write-then-refused
  
  `nexus workspace mount` on a CODE workspace succeeded, `nexus workspace status`
  printed `Mode rw`, and the first save came back as a bare **"Permission
  denied"** naming no workspace and no reason.
  
  Under the rclone engine that was worse than a refusal. `--vfs-cache-mode writes`
  buffers the write locally and only fails on flush, so the editor reported a
  **successful save** and the bytes were dropped.
  
  ## Why it happened, because the cause is a type and not a branch
  
  A CODE workspace is a read-only projection of a git project. The server has
  always known: it classifies the kind and refuses every mutating verb against
  one, on the REST API and on the WebDAV mount alike. And `kind` has always been
  on the wire — the v1 contract declares it and the handler sends it.
  
  **Two hand-written type declarations dropped it**, so no compiler between the
  server and the user could see that the mount was deciding writability without
  ever asking:
  
  - `@agent-nexus/sdk`'s `Workspace` interface omitted `kind` **and**
    `vibeGitProjectId`;
  - the CLI's mount-target resolver annotated the list rows
    `{ id, slug, isShared }[]`.
  
  The mount mode was therefore the `--read-only` flag alone, and `workspace
  status` replayed that flag back out of the local mount registry — which is why
  it reported `Mode rw` over a drive that refused every write.
  
  ## `@agent-nexus/sdk`
  
  `Workspace` now carries the two fields the API has been sending:
  
  - **`kind: WorkspaceKind`** — `"DRIVE" | "CODE"`. `CODE` is read-only.
  - **`vibeGitProjectId: string | null`** — non-null exactly when `kind` is
    `"CODE"`.
  
  `WorkspaceKind` is exported.
  
  ⚠️ **This is additive on the wire and a compile error for one shape of
  consumer.** Anything that only READS a `Workspace` is unaffected — the fields
  were already arriving at runtime and were merely unnameable. Anything that
  CONSTRUCTS a `Workspace` or `WorkspaceSummary` object literal (a test fixture, a
  mock, a hand-rolled double) now fails to compile until it supplies both. That is
  the good direction: the break is at build time, and the alternative was a type
  that lied about a live response.
  
  `WorkspaceSummary` is now pinned against the v1 contract schema by
  `types-match-the-v1-contract.test.ts`, so this pair cannot separate again. The
  pin is the durable half of this change — a hand-written client type that
  silently drops a field the wire carries is invisible to typecheck, to lint and
  to every suite.
  
  ## `@agent-nexus/cli`
  
  - **`workspace mount` reads the storage kind and mounts a CODE workspace
    read-only.** `--read-only` can only ADD read-only, never waive it: asking for
    read-write on a projection asks for something the server has already decided
    to refuse. The command says so on the mount, names the kind, and points at the
    git project as the way to change the files.
  - **`workspace status` prints `Mode ro` for it.** The registry now records the
    EFFECTIVE mode rather than the flag that was passed.
  - **`workspace mount --json` gains two keys.** `storageKind` is `"DRIVE"` /
    `"CODE"` / `null`, and `readOnlyReason` is `"kind"` / `"requested"` / `null`.
    🚨 Note that this command's long-standing `kind` key is OWNERSHIP
    (`org-owned` / `admin-shared`) and keeps that meaning — the storage kind is
    deliberately a differently-named key rather than a redefinition of an
    existing one.
  - On a slug that names both an org-owned and an admin-shared workspace, the kind
    read is the CHOSEN copy's, not the first match's.
  
  ⚠️ **A mount made before this release keeps whatever mode it was created with.**
  The registry row is what `status` reports, and nothing rewrites an existing row.
  Re-mount a CODE workspace to pick up the read-only mode.
  
  ⚠️ **When the workspace list cannot be fetched, the kind is UNKNOWN and the
  mount falls back to read-write.** Unknown is not writable — the server still
  refuses every write; what is lost is the warning, not the protection.
  
  ## Also
  
  The WebDAV gateway's refusal now names the workspace, the kind, the verb and the
  way out, instead of answering a bare `Forbidden` that a mounted drive can only
  render as "Permission denied". That body is safe because of where the check sits
  — role-grant narrowing runs first and answers `404`, byte-identical to a slug
  that does not exist, so a caller reaching the read-only check has already been
  proven to hold the workspace.
- 4037c65: Twenty-eight destructive commands gated their confirmation on `process.stdout.isTTY` and then
  read the answer from `process.stdin`. One mistake, two failures in opposite directions.
  
  **Piped, they destroyed without asking.** `nexus customer delete <id> | tee log` — stdout is not
  a terminal, so the question was skipped and the row went. Anything under `--json` was in that
  state as a matter of course, which is every scripted and every agent-driven call. The customer
  delete unlinks every deployment session, cascades the identities and the `SessionParticipant`
  rows, and takes the `metadata` column — notes, tags, `customFields` — with it. There is no dry
  run, no export and no undo.
  
  **With stdin closed and stdout a terminal, they hung.** `nexus customer delete <id> < /dev/null`,
  or the same command under a supervisor: the gate said "ask", so the question was issued against a
  stream that had already ended and nothing could settle the promise. The prompt printed and the
  process sat there.
  
  Both close on one word. Whether a person can answer is a property of the stream the answer
  arrives on, so every one of these now asks through `confirmDestructive`, which reads **stdin**.
  
  **BREAKING FOR SCRIPTS THAT RELIED ON THE SILENCE.** With no terminal and no `--yes`, these
  commands now REFUSE: nothing is destroyed, an error document goes to stdout under `--json`, and
  the exit code is non-zero. A script that deleted without passing `--yes` was being carried by the
  defect and stops working — add `--yes`, which is what the flag has always been for. Refusing
  costs one retry; proceeding cost the data, and the environment with no terminal is precisely the
  one where nobody is watching.
  
  The commands: `agent delete`, `agent-skill delete`, `agent-tool delete`, `asset delete`,
  `channel whatsapp-template delete`, `collection delete`, `credential delete`, `customer delete`,
  `deployment delete`, `deployment folder delete`, `deployment template detach`, `document delete`,
  `emulator scenario delete`, `emulator session delete`, `folder delete`, `html-template delete`,
  `skill-folder delete`, `task delete`, `task-eval session delete`, `template folder delete`,
  `tool delete-credential`, `user-group delete`, `version delete`, `version restore`,
  `workflow delete`, `workflow branch delete`, `workflow edge delete`, `workflow node delete`.
  
  Two of them — `channel whatsapp-template delete` and `deployment template detach` — already read
  stdin and so never hung; they proceeded silently, which is the same data loss by the other route.
  
  The same confusion ran the safe way in `vibe`, where a confirmation tested stdout and therefore
  REFUSED `nexus vibe app delete <id> > log` typed at an operator's own keyboard. Those read stdin
  now too.
  
  Each command's `--help` said the old behaviour out loud and now states the new one, in one
  wording: `--yes` is required in a script, and with no terminal to answer on the command refuses
  rather than acting.
  
  **A prompt now goes to stderr, not stdout.** That is the other half of reading stdin. Deciding on
  stdin makes `nexus <destructive> > log` from a real keyboard ask — correctly, the operator is
  there — and writing the question on stdout then sent it into the log file, leaving the terminal
  blank while the process waited for a keystroke. Measured on the built binary, that is what
  happened. The whole conversation moves with it: a confirmation's preamble and its `Aborted.`
  acknowledgement follow the question, so a spend gate can no longer ask you to accept a cost on
  one stream and print the figures on another. A RESULT still goes to stdout, because a caller
  parses it. stdout is used for a prompt only where stderr is not a terminal and stdout is.
  
  A script capturing `Aborted.` from stdout must read stderr instead. It is an acknowledgement of an
  answer a person gave, not a result — and a script that reached it either passed `--yes` (in which
  case nothing is printed) or was refused before the question.
- 9fabcce: `agent-eval`'s six destructive verbs declared `--yes` and had **no prompt behind it**. The flag's
  own help said so — "accepted for symmetry, there is no prompt to skip" — which made it the honest
  spelling of a dishonest shape: a reader who sees `--yes` on a delete reads a confirmation being
  bypassed, and there was none to bypass. The delete happened the moment you pressed enter, at an
  operator's own keyboard exactly as in CI, piped or not.
  
  They were the last commands in the CLI with no confirmation in any environment. The commands:
  `agent-eval run delete`, `agent-eval schedule delete`, `agent-eval template delete`,
  `agent-eval template detach`, `agent-eval trigger delete`, `agent-eval webhook delete`.
  
  All six now ask through the same `confirmDestructive` path as every other destructive verb: with a
  terminal they ASK, and with no terminal and no `--yes` they REFUSE.
  
  **BREAKING, IN BOTH DIRECTIONS.**
  
  - **Interactive.** A command that deleted silently now stops and asks `[y/N]`. A bare Enter
    aborts. Anyone who typed one of these six from muscle memory gets a question where they used to
    get a result.
  - **Scripts.** With no terminal and no `--yes`, these now refuse: nothing is deleted, an error
    document goes to stdout under `--json`, and the exit code is non-zero. A script that deleted
    without `--yes` was being carried by the missing prompt and stops working. Add `--yes`, which is
    what the flag was always documented to be for. Refusing costs one retry; proceeding cost the
    data, and an environment with no terminal is precisely the one where nobody is watching.
  
  Each verb's `--help` now states what the delete takes with it, which none of them said before: a
  run carries its transcript, every judge verdict and its summary; a schedule carries the whole
  `runConfig` recipe; a template carries its rubric and prompts and is removed from every agent
  sharing the row; a detach stops that agent being evaluated; a trigger stops automatic evaluation
  silently, with conversations still arriving unscored; a webhook carries its signing secret, which
  is redacted everywhere and cannot be read back.
- f55ef2b: `ModelConfig.thinkingLevel` accepts all eight Anthropic thinking levels, and `ModelConfig` gains
  `thinkingDisplay`. Both were already what the platform stores and what the server puts on the wire;
  only the published contract disagreed.
  
  `thinkingLevel` offered the three LEGACY values (`fast`, `detailed`, `extended`) and refused the five
  ADAPTIVE ones Claude 4.7+ uses (`low`, `medium`, `high`, `xhigh`, `max`). So `agents.create` and
  `agents.update` answered 400 on a level the dashboard writes — and `AgentDetail.modelConfig` could not
  describe an agent already set to one. Measured on production: 14 agents store an adaptive level today,
  and none of them could be read or written back through v1.
  
  `thinkingDisplay` (`summarized` | `omitted`) was undeclared while the handler emitted it. On the
  request side the key was not refused, it was silently DROPPED — the body schema strips an unknown key —
  and the agent update replaces the stored config with the parsed body, so a caller that read an agent
  and wrote it back ERASED the field it had just been handed. 15 agents carry a value.
  
  Both changes are additive on the wire: every request that was accepted is still accepted, and no
  response field was removed or renamed. The published TYPES move, which is why this is a minor rather
  than a patch — a consumer narrowing `thinkingLevel` exhaustively will now see the five extra members
  at compile time. That consumer was already being handed those values at runtime.
  
  `nexus agent create --body` and `nexus agent update --body` take `modelConfig.thinkingDisplay`
  alongside the existing tuning fields, and both commands' `--help` list it.
- 9840138: Renaming an OAuth or tool credential works instead of returning 400
  
  `nexus credential update --name` answered `400 CREDENTIAL_FIELD_NOT_WRITABLE` on
  an `oauth_connection` credential, and refused `--description` on a
  `tool_credential`. That refusal was the honest answer: those tables had no column
  to write. They do now, so the write lands and the help says so.
  
  ### What changed for a caller
  
  - `--name` and `--description` are accepted on **all three** credential sources.
    The refusal machinery is still there and still refuses a field a source cannot
    store — it is simply the case that no source refuses either field today.
  - **On an OAuth credential, `--name` sets YOUR label and does not touch the
    account name.** Those are two different values and the distinction is the point:
    the account name comes from the provider and is refreshed on every reconnect, so
    it is what still identifies WHICH account this is after you rename the
    credential. `credential get` keeps showing it as the account identifier.
  - **`name` cannot be cleared; `description` can.** On the wire `name` is a
    non-empty string, so `'"name": null'` and `'"name": ""'` are both refused — a
    label can be replaced but not removed. `'"description": null'` does clear the
    description. A credential you never named reports the provider's account name
    as its name.
  - Search reaches the new columns, so a credential you just renamed is findable by
    the name you chose.
  
  Nothing regresses for an existing credential: every OAuth connection that
  predates the columns has a null label, so it reports exactly what it reported
  before.
- fe32f04: Public v1 can now ATTACH a custom model, not only create and list one
  
  v1 already had `custom-model create`, and `model list` reported the row back. The
  verb that puts a custom model to work was the half that was missing, so a model
  an organization owned could be created through the public API and then only
  attached from the dashboard.
  
  `customModelId` is now accepted on the agent and AI task model configuration, on
  create and on update, and is read back on task detail and in the agent's
  `modelConfig`.
  
  ## The id is the selector — the provider enum is unchanged
  
  A custom model is selected by ITS ID and by nothing else. `modelProvider` still
  admits the four platform values only. `model list` reports `CUSTOM_<PROTOCOL>` on
  a custom row to say where that row came from; it is not a value to send back, and
  this change deliberately does not widen the enum to make it look like one.
  
  `modelName` and `modelProvider` stay REQUIRED beside `customModelId` and are not
  redundant — they are the platform fallback, and a stored configuration missing
  either is discarded whole at inference, taking the custom model with it.
  
  Sending `modelName` or `modelProvider` WITHOUT `customModelId` detaches the id
  already stored. That is how an agent or a task is put back on a platform model.
  
  ## Two refusals, both at the write
  
  - **An id belonging to another organization is a 404**, never a 403. Ownership is
    asserted before anything is stored, so a probe cannot distinguish "not yours"
    from "does not exist".
  - **A custom model whose protocol is not `openai` is a 400 when attached to an AI
    task**, naming the protocol, and it never reaches storage. AI tasks run through
    the OpenAI-protocol path only.
  
  The AI task executor KEEPS its own refusal, and that is not redundant with the
  one above. `PATCH /custom-models/:id` can change a protocol long after a task is
  attached, and tasks reach the executor from places v1 never sees — so the write
  fails fast and the executor is the backstop. Both call ONE predicate and emit ONE
  message, so they cannot drift apart, and the predicate is total over the protocol
  set: a fourth protocol fails to compile until someone decides what it means here.
  
  ## CLI
  
  `agent create`, `agent update`, `task create` and `task update` gain
  `--custom-model-id <id>`, taking the id printed by `nexus custom-model list`.
  
  On the agent commands the flag must travel with `--model-name` and
  `--model-provider`, because it lives INSIDE `modelConfig` and has no top-level
  mirror; sending it alone is refused with the `--body` spelling that would work.
  `agent create --help` now states that an id is how a custom model is reached, so
  the path is discoverable without reading the schema.

### Patch Changes

- 22d7e1c: Answer eight `--help` questions on `custom-model` and `task-eval`, each verified
  against the route rather than against the audit's prose.
  
  `custom-model list` gains a Notes block: it is the only listing that shows a
  DISABLED endpoint (`nexus model list` filters on `enabled`), it returns the whole
  organization newest-first with no filter and no pagination, its table shows 5 of
  the 8 fields a row carries, and its `ID` column is what makes a model selectable
  through `--custom-model-id`. That last paragraph replaces the audit's premise,
  which was a false negative: a custom model IS merged into `nexus model list`, and
  grepping that table for `modelName` finds nothing because the table has no
  `modelName` column.
  
  `custom-model get` now states that the `apiKey` is write-only — encrypted on
  write, selected by no read — so the way to recover from a wrong key is to rotate
  it, never to check it.
  
  `task-eval judge` states that `--body` is optional and that a bodiless judge
  still scores (`gpt-4o`, else the first registered judge; the ACCURACY template),
  how `judgeModel` resolves (exact model name or display name, case-insensitive,
  plus an unambiguous prefix; anything else is `INVALID_JUDGE_MODEL`), and that
  resolution happens before the session moves.
  
  `task-eval results` states that the table shows 5 of 11 fields and hides the one
  that explains a blank score: `status` is execution, `judgeStatus` is scoring, and
  they move independently.
  
  `task-eval session get` states that `session list` returns a strictly smaller
  shape — `averageScore`, `judgedRows`, `judgeFailedRows`, `judgeModel` and
  `judgePrompt` are absent from a list row rather than null — and that
  `judgeFailedRows` must be read before `averageScore`, which averages only the
  rows the judge completed.
  
  `task-eval dataset add` gains the row shape: `input` is the only required field,
  and `input` and `expectedOutput` each accept a string or an object.
- f93853c: `nexus upgrade` verifies the install instead of claiming it worked.
  
  **This adds a third exit code.** `2` means the install SUCCEEDED and your shell still
  resolves a different copy. `1` keeps its documented meaning — nothing changed, retrying is
  reasonable — and `0` now means the upgrade was read back, not assumed. A caller doing
  `nexus upgrade || handle` is unaffected; one branching on `== 1` was previously told
  "nothing changed" about a machine that had changed.
  
  The whole body after the version check was three statements:
  
  ```ts
  const installCmd = getGlobalInstallCommand(PACKAGE_NAME);
  execSync(installCmd, { stdio: "inherit" });
  printSuccess(`Successfully upgraded to ${latest}.`, { from: currentVersion, to: latest });
  ```
  
  **Success was claimed whenever the install command exited 0.** Nothing re-resolved the
  binary and nothing re-read a version. So an install that genuinely succeeded INTO A PREFIX
  THE SHELL DOES NOT SEARCH FIRST reported a clean upgrade, and the next run was still the
  old build — every time, with no error anywhere. A user sat in that loop for days, on 0.22,
  upgrading repeatedly and being congratulated each time.
  
  The command's own `--help` already described this exact case ("this installs a SEPARATE
  global copy rather than replacing the one you invoked"). That is what made it a
  certification bug rather than a missing feature: the behaviour was documented and then
  contradicted by the success message, and nobody reads help text when the tool says it
  worked.
  
  After the install it now resolves `nexus` the way a shell does — every `$PATH` entry, left
  to right, first executable wins — and asks that binary its version. Only a match prints
  `Upgraded`. The three ways it can disagree each get their own message and exit 2:
  
  - **the resolved binary is OLDER** — something on PATH shadows the install;
  - **it will not start** — a shim left pointing into a directory the package manager has
    since collected, which is `MODULE_NOT_FOUND` on every invocation;
  - **nothing named `nexus` is on PATH at all** — npx, a vendored copy, a project
    dependency. Previously reported as a successful upgrade.
  
  **Every failure prints the FULL resolution list, not the winner.** `which nexus` shows the
  first hit, which is the entry that is not the problem; the shadowing entry and the new
  install are rows two and three, and the diagnosis is invisible without them. The list is
  printed in search order with the entry the shell runs marked, and the message names
  `which -a nexus` so the reader can reproduce it.
  
  Under `--json` this stays ONE document. The resolution list rides in the existing
  `hint` field of the three-key error envelope every other failure in this CLI shares,
  under a new code `CLI_UPGRADE_NOT_RESOLVED` — deliberately not `CLI_LOCAL_FAILED`, because
  nothing failed and the remedy is a PATH edit rather than a retry.
  
  **`detectPackageManager` was also inferring yarn wrong, and it fails the same silent way.**
  It tested `realpathSync(argv[1])` alone, and `realpath` destroys the segment that
  identifies yarn. Measured on yarn 1.22.22: `yarn global bin` is `~/.yarn/bin` and
  `yarn global dir` is `~/.config/yarn/global`, so resolving the shim yields a path with no
  `/.yarn/` in it. Every yarn-global install therefore fell through to `npm install -g`,
  wrote into npm's prefix, and left the yarn shim resolving the old CLI — an install that
  succeeds and changes nothing the user runs. Both the invoked path and the resolved path
  are now read, so the shim identifies the manager even when its target does not.
  
  All nineteen entry points are covered — `upgrade` plus its eighteen hidden aliases — and
  each one is driven through the command in the test suite rather than asserted structurally.

## 0.26.0
### Minor Changes

- fc25f8b: `analytics feedback --score` no longer truncates a fractional score to zero, and
  the `analytics` namespace carries the instruction its five commands were missing.
  
  `--score` was bound to bare `parseInt` while the route filters on
  `z.coerce.number().min(0).max(1)`. Those two agree on `0` and `1` and on nothing
  else, and the disagreement was silent in the direction that returns rows:
  `--score 0.5` and `--score 0.7` both reached the server as `0`, so the caller
  asked for one score and got the rows of another with no error anywhere. The flag
  now parses a real number and refuses anything outside `[0, 1]` at parse time,
  naming the value it rejected — the shipped example asked for `--score 5`, which
  the route has always answered with a 400.
  
  `--help` gains blocks on all five leaves and on the namespace itself:
  
  - `analytics` says which of the three read surfaces takes a question you wrote,
    and that `metrics` checks a column against the view's catalog where raw SQL
    answers with a database error.
  - `analytics metrics` says how to discover a view's columns at all — nothing
    lists them — and that `--show-sql` writes to STDERR, so `--show-sql --json >
    out.json` leaves the file clean rather than mixing SQL into it.
  - `analytics query` and `analytics metrics` now cross-reference: the same eight
    views, `traces` on one and `analytics_traces` on the other, each refusing the
    other's spelling.
  - `analytics overview` names its eight scalars and five nested fields, states
    that every `*Change` is a percentage against the preceding window, and that
    `label` repeats `entityId` on `byChannel` and `byModel`.
  - `analytics feedback` states that `meta` carries five fields here and three
    everywhere else in this CLI, and that `total` is probed rather than counted —
    on every page but the last it means "one more than you have seen".
  - `analytics export` describes the CSV as the three stacked sections it is,
    rather than a row per conversation, and says the per-model and per-source cost
    breakdowns are computed and never written to the file.
  
  The interpolated view lists are folded to the width of the prose around them.
  `addHelpText` output is emitted verbatim, so the physical view names had been
  rendering a 220-column line inside a block wrapped at 78.
- c85c7b4: `nexus tracing traces --help` claimed "any other value is refused" and refused nothing. It does
  now, along with the last four descriptors that had a contract enum no flag could reach.
  
  Six flags in this release already existed and validated nothing — they printed a hand-typed list
  in their description while accepting anything. That is worse than an absent flag, because the
  list reads as a contract:
  
  ```
  $ nexus tracing traces --sort-by __TOTAL_JUNK__
  Error: No profiles configured.          # parsed clean, reached the network
  
  $ nexus tracing traces --sort-by __TOTAL_JUNK__     # now
  error: option '--sort-by <field>' argument '__TOTAL_JUNK__' is invalid.
    Allowed choices are startedAt, totalCostUsd, totalDurationMs.
  ```
  
  **The breaking part is that a value the server would have rejected now fails one step earlier,
  with a different exit path** — the same shape as the previous release. A script feeding an
  invalid enum already failed; it now fails without a network call and with the allowed list on
  stderr. `customer list --sort-by` is the exception worth reading twice: the adapter behind that
  route keeps its own allowlist and falls back to `lastSeenAt` on a miss, so a bad value did not
  even 400. It returned a differently-ordered page and said nothing. A script relying on that
  silence now gets an error instead of quietly wrong output.
  
  Five flags are new, and each one unblocked a descriptor whose other enums were already ready —
  the binding is all-or-nothing per endpoint, so one missing flag held back every enum beside it:
  
  - `tracing traces --source` — filter by the surface that produced the trace, which also let
    `--status`, `--sort-by` and `--order` bind.
  - `tracing cost-breakdown --bucket` — split each group into a time series. Rejected by the
    server for `model`, `agent` and `workflow` groupings; only the attribution dimensions support
    it, and `--help` says so.
  - `customer list --sort-by`, `--sort-order`, `--channel`.
  - `execution list --sort-by`, `--order` — which let `--status` bind on both of its routes.
  
  Every parameter was traced from the controller to the query before a flag was written for it.
  
  **`DeploymentType` in the SDK was wrong in both directions and is corrected.** It declared `SMS`,
  which is not a member of the database enum and is refused by the server, and it omitted
  `INSTAGRAM`, which is a real member. One hand-maintained copy of an enum, offering a value
  nothing accepts while hiding a value that works. Code annotated with `"SMS"` stops typechecking;
  it was already failing at runtime. `INSTAGRAM` becomes reachable for the first time.
  
  `ListTracesParams` gains `source`, `ListCustomersParams` gains `channel` and narrows `sortBy`
  from `string` to the five fields the endpoint accepts.
  
  With these bound, every descriptor the CLI calls either validates its enums or is blocked for a
  structural reason — three project no fields at all, two are alternate routes of a command bound
  through its twin. No endpoint is left that a flag could reach and does not.
- 7499165: Two v1 response fields were published and could never be filled — they are removed
  
  `ExecutionNodeResult.logs` and `ExecutionOutput.outputType` were declared in the
  public v1 contract and answered `null` on every request, from the day each
  shipped. Not sometimes. Not on unfinished runs. On every request, for every
  organization, for the whole life of both fields.
  
  Neither had a source anywhere in the platform. `logs` and `outputType` are field
  names on **zero** of the 224 models in `schema.prisma`, and no writer exists for
  either. The backend filled both with a literal `null`.
  
  ## 🔴 BREAKING — this is a removal from the public v1 surface
  
  Stated plainly, because a removal is a removal even when the value was always
  `null`:
  
  - **The JSON responses lose a key.** `GET /public/v1/workflows/executions/:executionId/nodes/:nodeId`
    no longer carries `logs`. `GET /public/v1/workflows/executions/:executionId/output`
    no longer carries `outputType`. A JavaScript consumer reading `result.logs` now
    gets `undefined` where it previously got `null`. Those are different values:
    `result.logs === null` was `true` and is now `false`, and `"logs" in result` was
    `true` and is now `false`.
  - **TypeScript consumers get a compile error**, which is the good direction — the
    break is at build time rather than in production. `ExecutionNodeResult.logs` and
    `ExecutionOutput.outputType` are gone from `@agent-nexus/sdk`.
  - **The CLI's `--json` output loses the same two keys.** `nexus execution
  node-result` and `nexus execution output` print the response verbatim, so a
    script doing `jq .logs` now gets `null` from `jq` rather than the JSON `null`
    the API sent. A script that BRANCHED on the value is unaffected — every branch
    it could have taken, it already took.
  - **`workflow_executions_get_output` is an MCP tool**, so its result shape changes
    for an agent using it too.
  
  **No caller can be relying on a value, because there has never been one.** That is
  the whole argument for removing rather than keeping, and it is worth stating in
  those terms: the risk here is entirely in the SHAPE of the response, never in the
  data, because there was no data.
  
  ## What to read instead
  
  - **Node logs → `output`.** A node that captures console output (Browserbase, the
    sandbox nodes) folds those lines into its own result payload, which the same
    endpoint already serves as `output`. That is where node logs have always been.
  - **`outputType` → nothing, and the name is the trap.** The outputNode's
    `data.outputType` (`previous` | `custom` | `text`) is a real, writable node
    setting read through `nexus workflow node get`. It is a property of the graph,
    not of a run's output, and the two sharing a name is why the CLI help conflated
    them. A workflow's output is an untyped `Json` column; nothing records the shape
    it was meant to be.
  
  ## Why removal rather than a note
  
  Three sibling fields on the same endpoint — `duration`, `startedAt`,
  `completedAt` — were the same defect and were REPAIRED by reading the columns
  that do exist. These two had no column to read.
  
  That leaves exactly two honest endings, and the third one is what both fields
  wore for months: declared, permanently `null`, with a comment underneath
  explaining that the value would never arrive. A published field teaches every
  consumer to handle a value, write a branch for it, and wait for it. The comment
  is read by whoever maintains the contract; the field is read by everyone else.
  
  ## The gate
  
  `Pick<PrismaModel, …>` on a mapper parameter already made a read of a column that
  does not exist a compile error in both directions — and it is the right
  instrument, and it did not catch these two, because **a literal reads nothing.**
  `logs: null` sat underneath that green gate for months.
  
  `apps/backend/src/__governance__/v1-unfillable-response-fields.spec.ts` closes the
  escape. It reports a response key that is a bare `null` on **every path** of the
  method that builds it, which is the discriminator that keeps it usable: a `null`
  in one arm of a function that produces a real value in another is ordinary and
  correct, and both surviving sites in this tree are exactly that shape.

### Patch Changes

- 0144613: `role coverage` enumerates its THIRD reason vocabulary, `role set-variables` stops calling
  two nullable fields "required strings", and `nexus api` says which surface it cannot reach.
  
  Three help defects, each of the same shape: a screen that is accurate as far as it goes and
  sends a reader somewhere wrong at the point it stops.
  
  - **`role coverage` named two of three closed reason vocabularies.** `coverage.reason` and
    `money.reason` were enumerated; `savingsProjection.reason` was not, and it is the arm a
    caller meets LAST. Only one of its seven values (`NO_WORKLOAD_HOURS`) implies the
    percentage is also absent — the ratio is hours over hours and reads neither a cost nor a
    currency, and `RoleWorkload.costFormula` is nullable where `formula` is not. So a Role
    with an authored workload and no cost model answers a real percentage beside an
    unavailable projection, and neither of the two documented reasons says why. The list is
    read off `CoverageSavingsProjectionUnavailableReason` through a `Record<…, true>`, so an
    arm added to the SDK is a compile error rather than a value no surface names.
  
  - **`role set-variables` said `label`, `description` and `unit` were "required strings".**
    `RoleVariableInput` types two of the three `string | null`. Required is a property of the
    KEY; `null` is a legal VALUE for three of the five, and it is how a caller says "none".
    A reader who believed the sentence invented a description for every variable that has
    none. The five fields are now an aligned block gated by `Record<keyof RoleVariableInput,
    string>`, beside a copyable body that states a `null`.
  
  - **`nexus api` never said it reaches `/api/public/v1` and nothing else.** `HttpClient`
    prepends that prefix to every path and no flag removes it, so the routes the dashboard
    calls cannot be addressed by this command at any spelling. The scope footer on every
    `--help` screen offered exactly this command as the way to disprove an absence — naming
    routes it cannot reach and then sending the reader to a probe that answers nothing. Both
    surfaces now say so: a silent probe means "not on public/v1", never "not on the
    platform".
- 121cd8d: Fix a required field supplied in `--body`/`--data` as a number or a boolean being dropped from the request. `nexus access-card create --data '{"credentialId":12345,"name":"N"}'` sent `POST /credentials/undefined/cards` instead of `POST /credentials/12345/cards`, and answered 0 because the CLI exits 0 on any 2xx — so it read as success.
  
  A required flag can be satisfied from the JSON body, and the value is then backfilled so the command reads it exactly as if it had been typed as a flag. That backfill tested `typeof value === "string"`, so a body spelling an id as a number — what a JSON author writes for something that looks numeric — satisfied the requirement and backfilled nothing, leaving the value `undefined` wherever the command interpolates it into the URL. Strings, numbers and booleans now all backfill. Arrays and objects deliberately do not: they have no flag spelling, and coercing one would put an array where a command expects a comma-separated string.
- 6fdd61a: `agent-tool delete` now names BOTH ids in its confirmation prompt.
  
  It asked `Remove tool <tool-id> from agent?` — the tool, and the word "agent"
  with no id after it. The route is `agents/<agent-id>/tools/<tool-id>` and the
  agent is what decides which tool the server may touch, so a prompt echoing only
  the tool could not show a wrong pairing back to the operator. It now reads
  `Remove tool <tool-id> from agent <agent-id>?`.
  
  This is the surface half of NEX-3855, where the server was discarding the
  `agentId` it made every caller supply, and the prompt was the last place a
  mismatch was catchable by a human before the write.
- 4721b36: `assets.delete()` returns whether the public URL actually stopped serving, and `nexus asset
  delete` says so.
  
  An asset is stored `public-read` and its `url` is the direct, unsigned object URL, so **the
  stored object is what serves that URL** — nothing in a browser's request path consults the
  row. Deleting one is therefore two operations: soft-delete the record, then reclaim the
  object. The second is allowed to fail without failing the request, and the server has always
  reported it as `objectRemoved`.
  
  Nothing could read it. This route was typed as the shared `DeleteResponse`, which declares
  `{ id, deleted }` and nothing else, so `objectRemoved` was unreachable from typed code — and
  the CLI discarded the whole response under a `--help` note promising in capitals that the URL
  stops serving.
  
  **`assets.delete()` now returns `AssetDeleteResult`, not `DeleteResponse`.** A caller reading
  `.id` or `.deleted` is unaffected; the new fields are `objectRemoved` and `url`.
  
  ```ts
  const result = await client.assets.delete(assetId);
  if (!result.objectRemoved) {
    // the record is gone; the bytes are not
    console.warn(`still public: ${result.url}`);
  }
  ```
  
  `objectRemoved: false` means a real storage failure — refused credentials, an outage,
  throttling — because deleting an absent key counts as success at the storage layer. It never
  means "the key had already gone".
  
  **A retry is not available, and the obvious one lies.** The record is already soft-deleted, so
  a second `delete()` answers 404 `Asset not found` — which reads like confirmation the asset is
  gone. `url` is returned for exactly this reason: it is read from the record the delete just
  stamped, every later read filters it out, and on the failure branch it is the only thing left
  that names what is still reachable.
  
  `nexus asset delete` prints both fields, so `--json` carries them, and writes a warning to
  STDERR naming the URL when the object survived. The exit code stays 0: the request succeeded
  and the record really is deleted, and `nexus --help` binds exit 1 to a failure carrying an
  error document, which this is not.
  
  Also in the SDK: the contract-mirror gate now covers `Asset`, `AssetDeleteResult` and the
  `GET /models` response. A resource method's declared return type is checked against nothing —
  `request<T>` takes `T` from the call site — which is the mechanism that let this ship at all.
  Those three pairs are now a compile error when they drift.
- 8efa158: `permissions access` answers for a resource nobody has been granted anything on, and its
  empty list now says who reaches the resource anyway.
  
  **Two observable changes, and the second is additive.**
  
  `nexus permissions access <type> <id>` used to answer `403 Access denied: 'viewer'
  relation required` for any resource in your own organization that carried no grant row —
  which, under the default OPEN visibility, is most of them. A CLI or SDK caller is always
  on that branch: an API key resolves as its own subject with `isOrgAdmin: false`
  unconditionally, so being an organization admin never helped. The same call now returns
  the access list. Three states that used to render as one refusal are now distinct:
  
  - the resource is not in your organization → `404` (the same 404 as an id that exists
    nowhere, so it discloses nothing about another tenant)
  - the resource is closed to you → `403`, unchanged
  - anything else → `200`
  
  **`ListResourceAccessResponse` gains a required `unlistedReach` field.** A grant row names
  a resource, and two things reach a resource without naming it: an open resource type,
  which reaches it through no row at all, and a wildcard grant, whose row names the resource
  TYPE. Both leave `permissions` empty, so an empty array on its own is not an answer to
  "who can reach this?" — and that question is the whole reason the endpoint exists.
  
  ```ts
  const { permissions, unlistedReach } = await client.permissions.listResourceAccess("agent", id);
  // "organization"    — no grant names it and the type is open: EVERY member reaches it
  // "type_wide_grant" — a grant on this type's wildcard reaches it; that row is not listed
  // "nobody"          — only the listed grants reach it
  ```
  
  It is required rather than optional because an absent key reads as "nothing else reaches
  it", which is the exact wrong answer the field exists to prevent. A consumer that ignores
  it behaves as before; one that reads `permissions.length === 0` as "unshared" was already
  wrong and can now stop being.
  
  The CLI prints the reach as a `Reach:` line under the table, and under `--json` emits the
  whole response as ONE document rather than the rows alone.
- df48912: `channel setup --json` carries the ready verdict, in its one document.
  
  **This changes the shape of that command's `--json` output.** It was a bare ARRAY of
  steps. It is now an object — `{ type, ready, steps }` — so a caller reading the top level
  as a list reads the steps from `.steps` instead. The recipe published in
  `channel setup --help` changes with it, from a filter over the steps to `jq -e '.ready'`.
  
  The action printed the steps through one printer and then the verdict through another:
  
  ```ts
  printTable(data.steps, …);                                   // a bare array
  if (data.ready) printSuccess("All prerequisites met. …");     // a second document
  ```
  
  Two printers is two JSON documents, and the `--help` note published a `jq` filter over
  that stdout which indexes `.[]`. On the second document `.[]` yields a boolean,
  `select(.label != …)` indexes it, and jq aborts with `Cannot index boolean with "label"`
  and exit 5. **The documented automation gate failed exactly when the answer was "yes,
  proceed"**, and a caller reading a jq error on the success path reads it as "not ready" —
  the one reading that is backwards.
  
  `emitDocument`'s first-wins rule already closed the parse half: the steps keep stdout and
  the verdict is diverted to stderr, so the stream parses again. That is the right fix for
  the pair and the wrong outcome for this command. Nothing errors, nothing is unparseable,
  and the single fact this command exists to answer now lands on the channel a script does
  not read — a `--json` caller still cannot tell ready from not ready.
  
  `ready` was on the response all along; only the printer dropped it. So JSON mode emits the
  response — the steps and the verdict together, one document — and the human rendering
  keeps the table plus the sentence that says the same thing.
  
  The help note said "there is no `ready` key to gate automation on". That was true of the
  CLI's output and never of the API. It now names the shape it actually prints, and keeps
  the warning that matters: for a `--type` with no real prerequisite checks, `ready` reads
  true because nothing was checked.
- 4832103: `nexus customer`, `nexus tracing` and `nexus collection --help` now answer
  fourteen things a caller previously had to discover by running the command, and
  one shipped note that was false is replaced.
  
  `customer` had `--help` on ONE of its seven leaves. The other six now carry an
  example and a Notes block:
  
  - `customer create` says that `--email` and `--phone` each create a CHANNEL
    IDENTITY — GMAIL and WHATSAPP respectively, both `isPrimary`, both
    `verifiedAt` null — that the identity is unique per organization AND service,
    and that a collision fails the whole create with 409 leaving no partial row.
    It also says `customer update` never revisits those identities, so an address
    changed later leaves the identity pointing at the old one.
  - `customer update` says `tags` and `customFields` are REPLACED WHOLE, so
    sending one custom field deletes the rest, and that notes are never at risk
    from this command.
  - `customer note` says a note is write-only through this API: nothing reads it
    back, there is no notes-list verb, and the CLI discards the note the write
    returns — so the note id never reaches the caller on either channel.
  - `customer delete` says the conversations survive and the CRM row, its
    identities and its group-participant rows do not, and that the confirmation
    is gated on stdout being a TTY, so a pipe deletes with no question asked.
  - `customer get` names the two arrays no list carries, `identities[]` and
    `recentSessions[]`.
  - `customer get-by-external-id` says a miss is a 200 on the wire and an exit 1
    here, with an error document on stderr and stdout left empty.
  - `nexus customer --help` prints the FOUR different `--json` envelopes this one
    namespace answers with, so a caller stops assuming one jq expression reads all
    of them.
  
  `tracing` gains the shapes and bounds its list and export commands never stated:
  
  - `export-bulk` under `--format json` is a BARE ARRAY with no `data`/`meta`
    envelope, and `--json` changes nothing on that path.
  - `export` is a bare OBJECT, so the single and the bulk export need different
    parsers. Its generations are uncapped, where `tracing trace <id>` stops at
    100, and this route is NOT under the five-calls-a-minute throttle that
    `export-bulk` documents — the previous sentence implied it was.
  - `generations` shows 6 columns and answers 26 keys under `--json`; the twenty
    that are invisible in the table are now listed.
  - `traces` and `generations` state the page contract: `--limit` is 1-100 with a
    default of 20 and over 100 is a 400 rather than a clamp, which is NOT
    `export-bulk`'s 1-500 default 100.
  - `timeline` says the DATE column is cut: the bucket key is a 24-character ISO
    instant rendered into a column 22 wide, so a chart must key off `--json`.
  
  Two corrections in the same pass, both measured against the code rather than
  against the help:
  
  - **`tracing cost-breakdown`'s LABEL note was wrong.** It said grouping by agent
    leaves LABEL empty while workflow and deployment fill it. Agent resolves its
    label by exactly the same lookup as those two. What is true is that every
    dimension except `model` blanks when its referent is deleted or belongs to
    another organization — and that `workflowExecution` labels the WORKFLOW, so
    two runs of one workflow are told apart only by KEY.
  - **`collection list --limit` does not default to 50.** The v1 route parses with
    a schema whose default is 20 and whose maximum is 100; the 50 lives in a
    service the public route never reaches with an unset limit. Over 100 is a 400.
  
  `collection` also gains: the `k` bounds (integer >= 1, no maximum, forwarded to
  the retrieval provider verbatim), the fact that `reranker` is `--body`-only on
  create while `update` has a flag for it, that the create response echoes none of
  the settings it stored, that a `query` result carries no document name while
  `search` does, and that the three read commands in this namespace answer with
  three different JSON shapes.
  
  Every example that named a path id in `tracing` used `abc-123` or `gen-123`,
  which the route's own `z.string().uuid()` refuses — so each was a guaranteed 400
  rather than a working command. They now carry real UUIDs, which retires six
  entries from the help-truth ledger.
  
  A patch: help text, ledger bookkeeping and one pinned-phrase spec. No executable
  change.
- 1020300: Answer the seven remaining authored `--help` suggestions on the `deployment` namespace, including the wrapper key that made a correct `--body` read as an empty one.
  
  `deployment create` listed the five EMBED settings objects by name without ever showing that they nest under a top-level `settings` key. The create body declares `settings` and nothing else for them, and a Zod object strips what it does not declare — so a body spelled `{"embedSettings":{…},"securitySettings":{…}}` parses clean, loses every one of those keys, and reaches the route as a create carrying no settings, which answers the same 400 an empty body gets. The help now shows the wrapper and the full shape. A second note points at `deployment embed-config-update --print-contract` for the enum-valued leaves, since `settings` is opaque on the create route and the contract stops at the wrapper there, and states `securitySettings.visibility` outright — required, `public|private` — because no command prints it.
  
  `deployment update` now says the 50-key / 50KB cap applies to it as well and measures the PATCH rather than the result: the merge runs after validation and never re-measures, so thirty keys patched onto forty stored keys is seventy keys and a 200. `deployment delete` says `--dry-run` ignores `--json` and writes prose, so a piped `jq` gets a parse error — and names `agent-skill sync` and `claude-code`, which do branch on `--json`, so the habit is known not to transfer. `deployment stats` documents the `sessions` array the two counters are computed from, which makes the 500-session cut checkable instead of taken on trust. `deployment get` says `null` on `connectionStatus` or `inboundWebhook` means the channel binds none rather than signalling a fault, and separates that from `NOT_CONFIGURED`.
  
  `deployment folder list`, `channel connection list`, `channel whatsapp-template list` and `phone-number search` each say their `--json` is a bare array rather than `{data,meta}`. A `jq '.data[]'` carried over from the sibling list command selects nothing and does not error, so the miss reads as an empty result.
- 52bf22d: A generated docs page no longer names the CLI version, so the projection stops depending on a field the release writes.
  
  The live `nexus <cmd> --help` is unchanged and still names the client that is talking —
  `THIS IS ONE CLIENT (@agent-nexus/cli 0.21.9), NOT THE PLATFORM` — because knowing which
  version is speaking is the whole reason that footer exists. Only a DERIVED capture drops
  the number, and the published pages under `content/docs/cli/commands/` are derived.
  
  `packages/cli/package.json`'s `version` is written by the changesets release, which lands
  on `main` and never on `staging`. A staging-to-main promotion is tested as the MERGE, so
  that tree holds main's version beside staging's committed pages. `cli-docs-are-generated`
  compares each page byte-for-byte against a fresh projection, so all 45 generated pages
  reported stale on a tree where nobody had touched a CLI file. Measured on the promotion
  with main at 0.25.0 and staging at 0.21.9, and reproduced on staging by editing that one
  field and nothing else: 0 stale at 0.21.9, 45 stale at 0.25.0. After this change the same
  experiment is 0 stale at both.
  
  A concrete version in a committed page was also false for its whole life. The page can
  only ever name the version it was generated from, and npm had shipped four minor versions
  past the number the pages carried.
  
  `captureHelp` is the single funnel every derived capture goes through — the docs model,
  the pages, and the gate that compares them — so the two facts that are true of the running
  process rather than of the tree are now removed in one place: the staleness notice read
  from `~/.nexus-mcp/version-check.json`, and the version. Two gates hold it: one pins the
  mechanism, with the live render at two versions as its control, and one pins the result
  over the whole tree, with the footer's continued presence on 44+ pages as its anti-vacuity.
- d5aa06e: Record a known-defective `--help` placement instead of counting it as clean.
  
  `channel setup`'s `--json` note ships a `jq` recipe that aborts, because the
  command prints a second JSON document once every prerequisite is met. The row is
  now `placed` — the note IS in the tree — and carries a `defect` pointer to the
  ticket, counted beside the placement total rather than folded into it.
- d2ea87d: Six `--help` notes, and a ledger that proves they are still there.
  
  `ticket create` now names `ticket get` as the read-back that shows what the
  server kept; `ticket attachments` names the row shape and that `contentType`
  and `size` are nullable because an attachment need not be a file this CLI sent.
  `agent create` states its exact `--json` envelope and that the model chosen
  there decides whether `nexus agent-skill` works at all; `agent list` names its
  five columns and says a truncated cell is marked.
  
  `help-suggestions.ledger.ts` carries all 237 suggestions from the `--help`
  truth audit. A row marked `placed` names its leaf and a probe, and the spec
  re-reads that probe out of the real `--help` on every run — so a note that gets
  reworded away fails by id instead of leaving a progress figure unchanged.
- 563fa5e: `--json` now prints ONE JSON document, and the printer makes the largest half of that
  impossible rather than merely correct.
  
  `nexus --help` has promised "`--json` prints ONE JSON document on STDOUT and nothing else"
  since the output contract landed. Nothing enforced it. `printRecord(sender)` followed by
  `printSuccess("Sender created.")` is the whole defect: each call writes one complete
  document, the caller receives them concatenated, and `JSON.parse` refuses the pair — or a
  hand-rolled reader takes the first and never learns there was a second. Every printer was
  individually right and nothing was collectively right.
  
  **The printer now holds the invariant.** All four printers and the error document go
  through one funnel that keeps a per-run flag: the FIRST document is the payload and goes
  to stdout, anything after it goes to stderr, where the profile banner and every warning
  already live. First rather than last is a decision — in every observed pair the first
  document is the resource and the second is a sentence about it, and a script wants the
  resource. A call site written tomorrow cannot reintroduce the defect. It reaches only the
  printers: a command that builds its own document with a bare `console.log` is outside it,
  and a gate covers that half instead.
  
  **A `--dry-run` verdict is a document.** `agent delete`, `deployment delete` and `workflow
  delete` printed a yellow sentence and returned — unparseable, at exit 0, on the one flag
  whose purpose is to let a script check before it destroys something. The envelope carries
  `dryRun: true` and deliberately no `success`, because nothing succeeded.
  
  **`auth status` answers a record.** It printed seven lines of prose, and it is the first
  command an agent runs: the caller could tell neither which profile was loaded nor that
  anything was wrong. It now reports profile, source, token type, org, user, base URL, the
  masked key, and whether the identity was ever cached — `auth status` makes no network call,
  so an absent org means "never resolved", not "no organization".
  
  Also: `auth list` and `auth orgs` answer `[]` on an empty account instead of a hint
  sentence; `auth pin`, `auth orgs`, `auth use-org`, `channel connect-waba` and `deployment
  template settings` no longer put prose beside their document; and `external-tool test-auth`
  emits its payload before its verdict.
  
  **Three `--wait` commands changed ORDER, not just guards.** `channel whatsapp-template
  create --submit`, `... submit-approval --wait` and `... test-send --wait` each produce
  several terminal results and printed all of them. The human channel keeps its running
  commentary; a script now gets one document assembled after the poll, carrying the status
  `--wait` exists to obtain rather than the pre-poll one.
  
  **A failure is a document too, and that clause had no funnel at all.** The same
  `--help` promises "under `--json` an error is a JSON document on STDOUT". Driving
  every command showed 93 failures of 152 answering with a sentence on stderr and an
  empty stdout — a non-zero exit with nothing to parse. Two classes: 41 were commander
  refusing the invocation from inside the parser, where nothing in the CLI ever saw the
  failure; 52 were commands refusing their own input with `console.error` and an exit
  code. The first is closed by walking the finished command tree once and routing every
  refusal through the standard error handler, with `CLI_INVALID_ARGUMENTS` on the wire
  and a hint naming the exact `--help` to run. The second is closed by a `refuse` verb
  at 53 call sites — two of which are shared sinks covering 29 commands between them:
  one function behind nine admin commands, and one action behind `upgrade` and its
  eighteen hidden aliases.
  
  `--help` and `--version` are untouched: they reach the same exit path with code 0, and
  turning those into errors would make `nexus --help` print an error document and exit 1.
  
  **A partial failure is a terminal result, and its document says so.** Assembling one
  document at the end is right for a command that succeeds and wrong for one that
  creates something and then fails: `channel whatsapp-template create --submit` lost the
  created template's id entirely if the submit threw. The acquired resource is now
  emitted with `incomplete: true`, the stage that failed and the reason, before the error
  goes out — so the caller can always name what exists.
  
  **The document's `code` says what actually happened, and the wrong one is now
  unrepresentable.** A document exists so a machine can branch on it, so a `code` reading
  "the invocation was rejected before anything was sent" on a connectivity failure is worse
  than the prose it replaced — a caller stops retrying something retryable. The refusal
  helper no longer takes a code at all; everything that failed after the invocation was
  accepted goes through a second verb whose cause is a required closed union. Thirty of the
  73 refusal sites were reclassified against what actually failed: a registry that could not
  be reached, a validation request that answered 500, an install that failed, a config write
  that threw. Three codes join the CLI family — `CLI_NOT_AUTHENTICATED`, `CLI_REMOTE_ERROR`
  and `CLI_LOCAL_FAILED` — each answering a different "what do I do next": re-authenticate,
  do not retry, retry, fix the machine.
  
  **Nine failures the gate structurally could not reach are closed too.** Driving every command
  under a stub is the worst case for the one-document clause and the BEST case for the failure
  clause: the branches that leave stdout empty are exactly the ones a stub never enters — an
  equality on a payload field (`external-tool test-auth`'s failed arm), a confirmation that
  refuses without a terminal (`workspace delete`, and the shared helper behind every other
  destructive verb), a removed-flag refusal (`cloud-import google-drive list-files
  --access-token`), and a `catch` the stub resolves instead of throwing (`docs search`). Vibe
  carries its own confirmation that names `--json` explicitly and still wrote only to stderr, so
  `vibe app delete`, `vibe app rotate-edge-token` and `vibe git-project delete` refused into an empty
  pipe as well.
  Each now emits the error document its exit code has always implied, with the cause it actually
  had: `external-tool test-auth` reports `CLI_REMOTE_ERROR`, because the platform answered and
  the answer is a failure — the caller's next move is the credentials, not the command line.
  
  Three of the nine were named by no census and by no report. `external-tool delete`, `update`
  and `update-spec` each hand a rich refusal to a HELPER that writes the whole binding list with
  `console.error`, and set the exit code at the call site — so the prose and the exit sit in
  different functions and neither reads as a defect on its own. They were found by a static walk
  over the source, which is now a gate: it reads the pairing (prose to stderr, then a non-zero
  exit, no document between) in a branch nobody can drive exactly as in one everybody drives.
  Both refusals now carry their list INSIDE the error document, so a script learns which
  references block the delete and which actions the new spec would break.
  
  **The gate drives every command.** Its population is derived from the command tree, so a
  new command joins it by being registered, and it drives a `--dry-run` arm separately. It
  reports five outcomes rather than two: a run it could not drive is counted as UNCHECKED,
  never as clean, and that count is ratcheted alongside the violation ledger. Two shapes are
  exempt, written out and bounded: streaming commands (`vibe app logs`, `execution follow`)
  legitimately emit many values, and `analytics export` / `tracing export` /
  `tracing export-bulk` print the server's payload in the format the caller asked for —
  `tracing export --help` says outright that `--json` does not apply there.
- f0ffed8: `nexus role --help` now answers the six things a caller previously had to
  discover by running the command, and the namespace page indexes its own verbs.
  
  - `role automation-settings` says that the whole object can be ABSENT — exit 0,
    a literal `null` under `--json`, no error — and that this one absence is why
    `coverage.reason` answers `NO_WORKING_TIME_MODEL` for every Role in the
    organization at once.
  - `role create` names where a user id comes from. There is no user-listing verb
    in this CLI, and `nexus auth whoami` prints the EMAIL and never the id, so the
    obvious move produces a 404 that reads as the user not existing. The help now
    gives `nexus api GET /me | jq -r .data.userId`.
  - `role attach` and `role detach` separate `--type` from the `--resource-type`
    of `permissions grant`. The two lists share exactly three spellings, a value
    from one is refused by the other, and they are different acts: attaching is
    exclusive ownership, a grant is a relation many principals may hold.
  - `role delete` says it does not prompt and has no `--yes`, unlike the three
    sibling deletes that do.
  - `role coverage` already carried its three-rows note; it is now recorded as
    such rather than being rewritten.
  - `nexus role --help` prints a grouped index of every verb, in five areas. The
    grouping is checked against the live command tree by
    `role-namespace-index.test.ts`, in both directions, so a new verb reds a spec
    instead of quietly going missing from the index.
  
  Two stale sentences are corrected in the same pass. `external_tool` stopped
  being a Role resource type when it moved to its own grant table, and the CLI
  still advertised "tools" in `role systems`' description and in `role delete`'s
  orphan warning — both now name the five kinds a Role actually holds.
  
  A patch: help text and one new spec, no executable change.
- 432b8b4: `skill-folder assign` says which of its two writes it performed, and gains help text.
  
  **This changes observable output.** `--folder-id null` printed `Skill assigned.` — the
  opposite of what it did. It now prints `Skill unassigned.`, and a script reading stdout
  for the old string on that branch will stop matching.
  
  `--folder-id null` is not "assign to no folder". It takes a different branch on the
  server: the assignment row is deleted and the response carries `"assigned": false`. The
  command sent that request, received that answer, threw it away, and printed one fixed
  sentence for both branches. So the one field that distinguishes the two writes never
  reached the operator by any channel.
  
  `--json` now emits the untouched response — `{skillId, folderId, assigned}` — instead of
  the flags the caller already knew. That matters beyond tidiness: `--body` can carry a
  `folderId` the flags never saw, so the argument is not a reliable stand-in for what was
  sent, and the response is the only place the outcome is stated. `printSuccess`
  short-circuits under `--json` to its own document, so the early return is what carries
  the extra field; `skill-folder list` already had the same shape.
  
  The command had no `addHelpText` at all. It now documents the `null` branch, and the one
  thing a script hits immediately: the two commands that list assignable skills answer in
  different shapes — `workflow list --json` is `{"data":[...],"meta":{...}}` and
  `task list --json` is a bare array — so a single jq path over both silently yields an
  empty id list rather than an error.
  
  The help also records that the id is now checked server-side: a well-formed uuid naming
  no workflow and no AI task in the caller's organization answers 404, where it previously
  succeeded and filed an assignment row pointing at nothing.
- 9f9ba4d: Correct two help surfaces that asserted behaviour the code does not have, and make
  `custom-model create --enabled` real.
  
  `template upload --help` said the step reads a template's variables out of the
  placeholders in the uploaded file. It does not: the upload stores the file and
  links `fileUrl`, and it never runs the placeholder parser. `inputFormat` is
  unwritable through the Public API v1 at all — create takes name, description and
  type, and there is no update route — so it reads null for every template built
  this way, and the variable names have to come from the file itself. Generation is
  unaffected, because it never consults the stored list. `template get`,
  `template list`, `template create` and the namespace overview asserted the same
  thing in different words and are corrected with the mechanism stated, along with
  three facts none of them carried: generating before an upload fails with a server
  error, a generated document is not a `nexus document` and no database row is
  written for it, and re-uploading deletes the previous file.
  
  `custom-model create` gains `--enabled <bool>`, using the same parser the update
  command already uses, so a model can be created disabled without hand-writing a
  body. The field it mirrors was advertised by the body schema, by the SDK type and
  by this command's own `--print-contract` block, and the write discarded it — a
  create asking for a disabled model returned 201 with an enabled one. Its help now
  also states that a 201 means stored and never that the endpoint works: nothing
  contacts the provider at create time, so an unreachable URL and a dead key both
  create cleanly and fail later at inference.
- 6b91ca0: `getTestSendStatus` takes the message SID alone. The template id left both the method and
  the route, because nothing could ever check it.
  
  **This is a breaking change to the public v1 surface and to the SDK signature.**
  
  - Route: `GET /channels/whatsapp-templates/:templateId/test-send/:messageSid/status`
    becomes `GET /channels/whatsapp-templates/test-send/:messageSid/status`. Drop one path
    segment; the `connectionId` query parameter and the message SID are unchanged, and so is
    the response.
  - SDK: `getTestSendStatus(templateId, messageSid, params)` becomes
    `getTestSendStatus(messageSid, params)`. Drop the first argument. The old three-argument
    call is a type error rather than a silent misroute — `messageSid` would have landed in
    the `messageSid` slot's place only by accident, so this had to be a compile break.
  
  A test-send status is addressed by `(Twilio account, message SID)` and by nothing else. The
  Twilio account comes from `connectionId`, which also carries the organization tie. The
  template id was a third coordinate the server never used: the handler resolved the status
  from the connection and the message SID, and dropped the segment.
  
  It could not have done otherwise. Twilio's `Message` resource exposes no content SID — in
  twilio 5.7.0 `contentSid` is a parameter of message CREATION and appears on no fetched
  instance — and Nexus stores no row linking a template to the message it produced. So no
  code path, present or future without new persistence, could verify the template↔message
  pairing the URL asserted. Two different template ids over one message SID answered
  identically, with no status code ever revealing the difference.
  
  Validating that the template merely EXISTS was rejected rather than overlooked. It would
  have left the pairing exactly as unchecked while adding one Twilio Content API fetch per
  organization connection on every poll, and the CLI's `--wait` polls twenty-four times. A
  check that cannot answer the question the URL asks is the same defect with a cost attached.
  
  `nexus channel whatsapp-template test-send --wait` is unaffected: it already holds the
  message SID it polls, and `--template-id` is still required for the send itself, which does
  use it.
- dca186f: Capture the docs help fence from the real root program.
  
  `deriveCommandModules()` runs each registrar against its own throwaway
  `Command`, and `buildNode()` captured the node's help from that program. The
  root installs `applyKnownIssuesHelpLine` and `registerHelpScopeFooter` on the
  FINISHED tree, so a throwaway carries neither — and the real root sorts its
  subcommands while a throwaway does not. Every generated page therefore differed
  from `nexus <cmd> --help`, on all 565 documented paths.
  
  `CommandNode.help` now resolves against the real root by path, and
  `CommandNode.helpSource` makes a path the root does not contain VISIBLE instead
  of silently falling back to a locally captured string.
  
  `captureHelp` also suppresses the update notice, which the scope footer reads
  from `~/.nexus-mcp/version-check.json` while rendering. Without it a docs page
  would freeze one machine's cached version number into 45 committed pages.
- 8f912ac: Correct `--help` on three commands whose notes described a response the server no longer serves, or never did.
  
  - `credential update` said "ONLY name AND description ARE WRITABLE", which is true of `api_key_connection` alone. It now names what each source can store, states the new `400 CREDENTIAL_FIELD_NOT_WRITABLE` refusal, and says that re-sending a value already set is still accepted.
  - `credential get` now explains the `source` field it prints. It was documented only under `credential list --help`.
  - `execution node-result` said `logs`, `duration`, `startedAt` and `completedAt` all come back null on a healthy completed node. Three of the four are now derived from the node's own timestamps; the note names `logs` as the one that is structurally null and says why.
  - `execution output` said `outputType` "defaults to previous". That is the outputNode's SETTING; the field in this response has always been null and is now documented as such, with a pointer to `workflow node get` for the setting.
- 284b1e6: Answer eight authored `--help` suggestions on the `vibe` namespace, and correct two things the existing help got wrong.
  
  `vibe app get` shipped with no Notes and no Examples; it now documents the two joins only that read resolves, and states that `gitProject` is a nested object with no `gitProjectId` scalar. `vibe app update` and `vibe app get` both name the gap between the two-state `--require-verification` flag and the three-state `shipGateMode`, where `WARN` renders as `off`. `vibe env set` REPLACES a sentence that told the reader the scope precedence was unknowable — it is defined: ALL union PROD, PROD wins on a name collision, and STAGING reaches no deployment. `vibe app create` says its collision warning goes to stderr, `vibe env list` explains the Card and Scope columns, `vibe git-credentials` says "Org" is the git host's path segment rather than the Nexus organization, `vibe deploy-state` pairs each of its five outcomes with its own fix, and `vibe audit list` names the cost-safety and verification event families.
  
  The namespace flow no longer tells a reader to run `vibe git-project commit` or `vibe git-project push`; neither verb exists.

## 0.25.0
### Minor Changes

- 1173a01: `template generate` returns a SIGNED url that expires in about an hour. It used to return a
  world-readable link that never expired.
  
  **This changes what a stored link does, not what a call returns.** The response shape is
  unchanged — still `{ url }` — so nothing stops compiling. What stops working is a link you kept:
  a url written into a script, a ticket, a chat message or a fixture is dead after roughly an hour,
  where before it worked forever. Fetch it in the same session, or generate again; there is no
  re-sign call, and generating produces a new document.
  
  That is the whole point of the change. The object behind the url was uploaded world-readable, so
  possession of the string was permanent, unauthenticated access to a document generated from a
  client template. Verified against production before the fix: a url of that shape, recovered from a
  persisted message, answered an unauthenticated HEAD with 200 and 16 KB of docx, while the same key
  with a nonsense suffix answered 403 on the identical prefix.
  
  The object is now uploaded private and the url is presigned at the moment it is returned, scoped
  to the caller's own organization, with the same one-hour life as `document download` and
  `document preview`. `nexus template generate --help` and the SDK's `generateDocumentTemplate`
  docstring both said the opposite of the truth and now state this.
  
  **Documents already generated are unaffected and remain world-readable.** This decides the
  protection of documents generated from now on; remediating what is already stored is a separate
  piece of work.
- 9098073: Say which `--help` notes nobody could check for free.
  
  An audit of 674 shipped `--help` claims settled 581 by running the command:
  398 TRUE, 75 FALSE, 108 with behaviour the help never states. It left 93
  UNTESTED — not passing, UNMEASURED — because probing them buys a phone number,
  spends a provider's tokens, provisions a cluster, or delivers a message to a
  real customer. Those claims shipped in the same typeface as the verified ones,
  so a reader could not tell them apart.
  
  `nexus <command> --help` now ends with a `Probe barrier` block on the 109 leaves
  whose claims cannot be settled inside one organisation at zero external cost. It
  names the barrier (MONEY, THIRD-PARTY or SETUP), says what the act spends or
  touches, and — where one exists — a free check that settles part of the same
  ground: `phone-number search` instead of `phone-number buy`, `cloud-import
  providers` instead of a connected Drive.
  
  The barrier is a ceiling on confidence, never a verdict on a sentence. A
  barrier'd command may still have been probed in part; what the block says is
  that the reader cannot repeat that check for free.

### Patch Changes

- 6812350: `nexus role` no longer sends a reader to an organization value that does not exist.
  
  **This corrects six statements that were false, on two commands.** A Role's working
  year (`calendarWeeks`, `paidLeaveWeeks`, `publicHolidayDays`, `sicknessDays`) has no
  organization-level counterpart — `OrganizationAutomationSettings` holds
  `hoursPerDay`, `daysPerWeek`, `workingWeeksPerYear` and `currency`, and the two sets
  are disjoint. `nexus role working-year` and `nexus role set-working-year` nonetheless
  told the reader that a blank term "falls back to the organization's value", and
  printed `(org default)` for every unstated one.
  
  **What changes for you.** An unstated term now renders `(not stated)` instead of
  `(org default)`. `--json` is untouched: it emitted a literal `null` before and after,
  which is the channel that never lost the distinction between "nobody stated this" and
  "a measured zero".
  
  `nexus role system-policy` carried the same shape — "read the organization's defaults"
  over a row that exists once per Role and nowhere else — and now says an unauthored
  policy is an absence rather than a set of inherited values.
- 674d509: `nexus role coverage` prints its money figures rounded, instead of showing floating-point
  residue as if the model were broken.
  
  `Projected saving` read `16250.000000000002 EUR (at 35.32608695652174/h)` for a Role
  costed at €260,000 over 7,360 worked person-hours. Both numbers are CORRECT and neither is
  a defect in the coverage engine: `savingsProjection.ratePerHour` is
  `workloadCost ÷ workloadPersonHours` and `savingsProjection.amount` multiplies it back by
  those same hours, so the headline is a division multiplied by its own divisor — which
  IEEE-754 does not round-trip. `(260000 / 7360) * 7360` is `16250.000000000002`.
  
  What was wrong is printing twelve digits of residue in a HUMAN table, on the one figure a
  reader is most likely to be looking at, with no way to tell it from a model that had gone
  wrong. Every other field in that record was already formatted for a human — the coverage
  ratio two rows above it is `(ratio * 100).toFixed(2)` — and the money fields were the ones
  that were not.
  
  `--json` is UNCHANGED and keeps every digit. `printRecord`'s `format` is the human channel
  only and leaves the JSON document untouched, so a caller reconciling `amount` against
  `ratePerHour × impactPersonHours` still gets the number the server used. This is the same
  split the dashboard already makes: it renders €16,250 and a €35.33/h rate from that exact
  payload.
  
  Two decimals rather than whole units, because the same line carries a blended hourly rate:
  `35.33/h` rounded to whole units is `35`, a 1% error printed directly beside the total it
  produced. `money.totals` (revenue, cost, workload cost) take the same formatter, so one
  record does not mix two rules.
- 1c75afa: `--help` now names every command that spells the body flag `--data`. It named one of three
  namespaces and called that set complete.
  
  The root epilogue said: _"nexus ticket create" and "nexus ticket update" take `--data`, not
  `--body`. This is the only namespace that does._ Five commands across three namespaces do —
  `ticket create`, `ticket update`, `credential update`, `access-card create` and
  `access-card update`.
  
  The missing word is "only". An incomplete list invites you to check; a list that says it is
  exhaustive stops you looking. So a caller reaching for `--body` on `access-card create` gets
  `unknown option '--body'` from a page that told them the flag was universal outside `ticket`.
  The epilogue now also says which of the two happens — commander refuses a flag it does not
  know, so a wrong spelling costs a retry rather than being silently dropped, and those call for
  opposite next moves.
  
  A sixth command declares `--data` and it is **not** a request body: `html-template render`
  takes the data object a template renders against, on a namespace whose `create` and `update`
  take `--body`. It is named separately rather than folded into the list.
  
  No behaviour changes. `findJsonBodyOption()` already matched both spellings generically; what
  was wrong was the three hand-maintained sentences describing it — the epilogue, a source
  comment, and the docs site. A new spec derives the set from the real command tree and asserts
  the epilogue names each member and no ex-member, so the sentence cannot drift from the CLI
  again.
- aecc0ef: `unpricedGenerationCount` reached one analytics endpoint of four. A per-group total
  could still absorb an unpriced call in silence — which is the failure the field was
  added to end, and the breakdown is where it costs most.
  
  An LLM call whose model has no catalog price is stored with a placeholder cost of `0`.
  SQL `SUM` ignores `NULL`, so no in-band value can separate that from a genuinely free
  call: `SUM({100, NULL})` and `SUM({100, 0})` are both `100`. The scalar summary already
  disclosed the gap out of band. `cost-breakdown`, `timeline` and the attribution `export`
  did not, so a group, a bucket or a trace whose whole traffic was unpriced reported
  `totalCostUsd: 0` and read as one that spent nothing.
  
  All three now carry `unpricedGenerationCount`:
  
  - **`GET /tracing/analytics/cost-breakdown`** — per entry, on every dimension
    (`model`, `agent`, `workflow`, `deployment`, `customer`, `workflowExecution`),
    single- and multi-dimension, bucketed and not.
  - **`GET /tracing/analytics/timeline`** — per point.
  - **`GET /tracing/analytics/export`** — per row, i.e. per trace. `totalCostUsd` on an
    export row is the trace's stored total, so this is also the first per-trace
    disclosure. The column is LAST in the CSV, after `completedAt`, so every existing
    column keeps the index it has always had.
  
  `nexus tracing cost-breakdown` and `nexus tracing timeline` print an `UNPRICED` column,
  and all three commands explain in `--help` what a non-zero value means for the cost
  beside it.
  
  Nothing existing changes name, type or meaning. `totalCostUsd` is a disclosure target,
  never a correction target: the missing amount is unknown, not merely unreported.
  
  On the breakdown and the timeline the count is computed as a filtered aggregate in the
  SAME query, WHERE and GROUP BY as `generationCount`, so `unpricedGenerationCount <=
  generationCount` holds by construction on every row rather than by assertion. (No such
  relation holds on the summary, where the count is over generations and `totalCostUsd`
  is over traces — that grain split is unchanged and still documented at the query.)
  
  The predicate is `pricingResolved = false`, never `IS NOT TRUE`. `NULL` means the
  pricing question was never asked — a running, failed or aborted call, and every row
  written before the column existed — and none of those is an unpriced call.

## 0.24.1
### Patch Changes

- b0653e4: `nexus role attach` and `nexus role review-deletion-request` name the Role their warning is about.
  
  Both printed a bare UUID on the line that reports damage — the system another team just lost, and the Role that was just deleted. `role attach --help` promised a warning "naming the Role the system came from", so the help and the output disagreed. They now print `Name (uuid)`: the name is what a reader recognises, and the UUID stays because a name matching two Roles is refused as an argument, so the remedy the same warning prescribes needs the unambiguous handle.
  
  `--json` is untouched. Those warnings go to stderr and never enter the JSON document; `movedFrom` in the `role attach` payload is still the raw UUID, so seizure detection is unaffected.
  
  Resolving the name costs one `GET /roles` and needs the `roles:read` scope. It is best-effort — a key that cannot list Roles still gets the warning, with the UUID alone.
- d9db1c9: `tracing analytics summary` now reports how many model calls in the window could not be priced, so a spend total that is LOW says so instead of looking complete.
  
  **The problem.** A model with no pricing row was recorded at a cost of `0`, exactly like a call that genuinely cost nothing. Every cost surface sums that column, so an uncatalogued model made organization spend under-report silently and by an unknown amount — in the surface a customer would use to check their spend. The only thing separating the two cases was a server WARN line no query reads.
  
  **Why the total could not carry it.** SQL `SUM` ignores NULL, so `SUM({100, NULL})` and `SUM({100, 0})` are both `100`. Whether an unpriced call is stored as `0` or stored as nothing, every total absorbs it identically. The gap has to be reported out of band or not at all.
  
  **SDK type change, and it is the reason this is a `minor`.** `TracingSummary` gains a required field:
  
  ```ts
  unpricedGenerationCount: number;
  ```
  
  Reading a summary is unaffected. Code that CONSTRUCTS a `TracingSummary` — a test fixture, a mock, a hand-built stub — no longer compiles until it supplies the field. That is deliberate: a fixture that omits it would assert a complete total it never measured.
  
  `totalCostUsd` keeps its name, its type and its meaning. It does **not** move, and it is **not** corrected by the new field. A non-zero count means the total is low by an amount nobody can compute, because the price was never known — so the count is a disclosure, never a term to add back.
  
  `0` is the normal answer and means every call in the window had a price.
  
  **Grain.** The count is over generations by their own start time; `totalCostUsd` sums traces by theirs. At a window edge the populations differ slightly, so the count answers "how many unpriced calls happened in this window", not "how many calls are missing from the number beside it".
  
  **CLI.** `nexus tracing analytics summary` prints an `Unpriced Calls` row. At `0` it prints `0`; above `0` it says the total is low by an unknown amount, because a bare number there reads as a statistic rather than as a caveat on the line above it.
  
  Not covered: `cost-breakdown`, `timeline` and `export` return per-group rows and carry no unpriced count, so a breakdown can still absorb an unpriced call silently.

## 0.24.0

### Minor Changes

- 5852eee: An enum flag now refuses a bad value locally, naming what it accepts, instead of sending it
  and returning a 400 that names nothing.

  `nexus analytics metrics --granularity dayly` used to leave the machine, cross the network
  and come back a validation error with no list of what would have worked. There was not one
  `.choices()` call in the package. 28 flags across eight namespaces now validate before the
  request is built:

  ```
  error: option '--granularity <granularity>' argument 'dayly' is invalid.
    Allowed choices are hour, day, week, month.
  ```

  **The breaking part is that a value the server would have rejected now fails one step
  earlier, with a different exit path.** A script feeding an invalid enum already failed; it
  now fails without a network call and with the allowed list on stderr. A script feeding a
  valid one is unaffected.

  The accepted values are generated from the Public API v1 Zod contract into
  `src/commands/<namespace>.contract.generated.ts`, so a flag cannot drift from the endpoint
  behind it. Where the CLI deliberately differs — `analytics --time-period` accepts `7d` and
  normalises it — the divergence is declared at the flag with a reason, and `--help` prints the
  reason. Where the two disagree by accident, the generator refuses to write, prints both lists
  and picks no winner: the contract has already been the wrong side of that argument.

  Converted: `analytics`, `custom-model`, `deployment`, `agent-eval`, `credential`,
  `prompt-assistant`, `task`, `workflow`. Every bound command also gains `--print-contract`,
  which prints every field of the API contract behind it.

  Two flags changed spelling rather than meaning. `workflow trigger --type` was validated
  against a hand-written tuple that duplicated the contract; it now derives from it, with the
  same values. `task create --model-provider` is still required.

- 4583de7: Every v1 contract enum the CLI can already reach is now declared — either validated by a
  flag, or stated as body-only with a reason.

  Four descriptors were carrying the reason `reachable-not-yet-bound`, the one word in that
  taxonomy meaning "this is bindable today and nobody has done it". All four are bound:
  `channel whatsapp-template create`, `deployment template attach`, `workflow batch` and
  `workflow edge create`. Descriptors with generated help go 54 to 58; the blocked list goes
  14 to 10; that bucket is empty.

  **The behaviour change is one flag.** `deployment template attach --type` printed
  `Template type: template, card, or carousel` in its description and called plain
  `.option()`, so commander accepted any string and the refusal came back from the server as
  a 400. It now validates locally:

  ```
  error: option '--type <type>' argument '__junk__' is invalid.
    Allowed choices are template, card, carousel.
  ```

  A script feeding an invalid type already failed; it now fails one step earlier, without a
  network call, with the allowed list on stderr. A script feeding `template`, `card` or
  `carousel` is unaffected. The description no longer repeats the list — commander prints it
  from the contract, so the two cannot drift.

  The other three enums are genuinely body-only and say so rather than gaining a flag.
  `workflow batch` is a pure `--body` command. `workflow edge create` documents
  `--body '{"type":"rewind"}'` in its own Examples. `channel whatsapp-template create` carries
  both of its enums one array element deep inside the Twilio Types object, where a carousel
  has one action type per action per card — no single flag could set them, and `--body-file`
  supplies the object whole.

  All four commands also gain `--print-contract`, and their `--help` now names every enum the
  endpoint accepts. `workflow batch`'s six trigger types and `channel whatsapp-template
create`'s two action-type lists were written down nowhere before this.

  The generator that emits those values had a latent defect this work exposed: it built a
  const name by rewriting `[]`, dots and camel humps, and assumed a contract key was otherwise
  a legal identifier. `twilio/call-to-action` is not, and the slash reached the generated
  module verbatim, where the run died inside esbuild naming a line and column rather than a
  field. Stray characters now flatten to `_`, and because that flattening could silently make
  two distinct fields share one const, the generator refuses on a collision and names both
  contract paths.

  `nexus known-issues` also gains its contract block and `--print-contract`. It had been in
  no rollout list at all — neither converted nor recorded as unconvertible — because the audit
  behind those lists is total over descriptors that declare an ENUM, and this one declares
  none. Namespace coverage is now derived and gated rather than counted by hand: 40 of 47.

- 303205a: `nexus known-issues <route-id>` prints the platform issues a human has published against one CLI
  command, and every command's `--help` now names the exact invocation for itself:

  ```
  $ nexus workflow node test --help
    ...
    Known issues on this route: run `nexus known-issues workflow.node.test`
  ```

  **`--help` still touches no network.** That line is static text — it is what a stuck user types, so
  it has to answer offline, in CI, behind a proxy and inside a pipe. The live data is fetched only by
  the command it names.

  The route id is derived from commander's parent chain rather than registered, so a command added
  later has an id with no list to maintain, and it is alias-stable: `skills install`, `skills sync`
  and `skills update` all derive `skills.update`, so an alias cannot split one command's issues
  across two lists.

  🔴 **Read `polled` before you read an empty list as good news.** `polled: false` means the server
  has not read the ticket provider yet — it is NOT "this route is clean". The command prints
  `Not checked yet` there and says so in as many words; `--json` returns one document carrying the
  field. `polled: true` with no issues is the real "nothing published", and even that is not proof
  the command works: an issue appears only because somebody deliberately marked it publishable.

  The argument is sent exactly as typed. The server constrains a route id to dot-separated lowercase
  names and answers 400 on anything else, so the CLI deliberately does not lower-case it — doing so
  would accept a spelling the server refuses, query a different route, and let the empty answer read
  as "nothing is broken".

  SDK: `client.knownIssues.forRoute(routeId)` reaches `GET /public/v1/known-issues`. Needs the
  `tickets:read` scope. Timestamps are ISO-8601 strings, like every other timestamp this package
  publishes.

### Patch Changes

- 5852eee: A 401 carries the error code the server actually sent, instead of always `UNAUTHORIZED`.

  **This changes an observable value.** A consumer branching on
  `err.code === "UNAUTHORIZED"` to catch every 401 will stop matching the provider cases
  below. Branch on `err instanceof NexusAuthenticationError`, or on `err.status === 401`,
  if what you meant was "any 401".

  `toApiError` computed the code and then discarded it on both 401 branches by calling
  `new NexusAuthenticationError(message)`, whose constructor hardcoded
  `super("UNAUTHORIZED", …)`. So the one field that distinguishes 401s was overwritten with
  a constant at the last step, in the layer every consumer shares.

  That is not cosmetic, because a 401 is two unrelated failures. `AUTH_EXPIRED`,
  `AUTH_INVALID` and `REAUTH_REQUIRED` describe a **connected integration** — a Google
  Drive, SharePoint or Notion token that expired or was revoked — and the caller's own API
  key is fine. Flattened to one code, a consumer can only give one answer, and the obvious
  answer is the wrong one for every provider case.

  The CLI was giving exactly that wrong answer: every 401 printed
  `Run "nexus auth login" to re-authenticate`, which sends someone to replace the one
  credential that was never broken, and leaves the real cause unnamed when it does not
  help. Those three codes now get the hint that matches — reconnect the integration in the
  dashboard, your API key is fine. No CLI verb reconnects one, so none is named:
  `nexus cloud-import providers` already documents that connections "come from the app".
  A genuine bad-key 401 still gets the `nexus auth login` hint.

  `UNAUTHORIZED` remains the fallback when the server sends no code, so a 401 that was
  reported that way is reported that way still. The non-401 fallback is unchanged and
  deliberately different (`HTTP_<status>`): a 401 without a code has a better name than its
  status, and a 500 does not. The computed code is therefore carried as
  `string | undefined` rather than pre-flattened — collapsing the two paths into one
  placeholder is what discarded the real code to begin with.

  `new NexusAuthenticationError(message)` is unchanged for existing callers; the code is a
  second optional argument defaulting to `UNAUTHORIZED`.

- 5852eee: `--body` now satisfies a required flag, so the body-only form every `--help` example promises
  actually runs.

  38 commands documented `--body '{"…"}'` as an alternative to their individual flags, and all 38
  refused it. Commander checks `requiredOption` inside its own parse, above the hook chain and
  above the action, so the command exited on `error: required option '--x' not specified` having
  read zero bytes of `--body`. The examples were not aspirational — they were printed by the
  running binary, next to a code path that could not reach them.

  Requirements are now re-imposed after the body is merged, so `--body` and flags are
  interchangeable in either direction and a flag still wins when both supply the same field. The
  seam is derived from the command tree, so a new command participates without being added to a
  list.

  Two details a caller can see:
  - **A refusal names the API field, not the flag.** Where a flag's name differs from the field it
    fills — which the global-option renames force — a message naming the flag's camelCase would
    send you to a key the server discards.
  - **Two `-` stdin flags in one invocation are refused, by name.** Reading stdin twice cannot
    work: the second read attaches to a stream that has already ended, so its promise never
    settles, the event loop drains, and node exits **0** having printed nothing and sent no
    request. A script reading `$?` was told that worked. `agent create --body - --prompt -` is
    the shape; it now fails loudly instead.

- 69e1648: The Roles types follow the server: an external tool is held by GRANT, not by assignment.

  `RoleResourceType` is the set of systems a Role owns EXCLUSIVELY —
  `RoleResource @@unique([organizationId, resourceType, resourceId])` means at most one
  Role per resource per organisation. Several Roles legitimately hold the same catalogue
  tool, which that key cannot express, so `external_tool` moved to its own M:N table,
  `RoleExternalToolGrant`, and left the union. `collection` was retired the same way
  earlier; the docblock now records both, and the warning that a stored value can be
  outside the union is unchanged and still applies.

  Three published types follow the contract they mirror:
  - `RoleResourceType` no longer carries `"external_tool"`. The server drops what it
    cannot recognise before it reaches a response, so no route can return that value in
    a `RoleResource` read any more. Measured at zero rows on production and on staging
    before the union narrowed, so no stored row is stranded by this.
  - `RoleCapability` gains `"external_tool_grant.view"` and `"external_tool_grant.manage"`.
    Its own pair rather than a reuse of `resource.attach` / `resource.detach`: those two
    govern `RoleResource`, where attachment is exclusive and detaching ORPHANS a system,
    while revoking a tool grant leaves every other Role holding it untouched. The claim
    being authorised is a different one.
  - `GrantedRoleSystems` gains `externalTools`, beside `collections` and `workspaces`.
    `RoleCoverage.grantedSystems` is how a caller states what its own total excludes, and
    a total that adds the first two alone is now short by the count customers are most
    likely to notice — external tools carry more production model spend than the other
    two grant kinds combined.

  `nexus role attach|detach|access-request create` no longer offer `external_tool` as a
  `<type>`, and their help lists it no longer. Those verbs write `RoleResource`, which is
  the table a tool left, so offering it sent an operator down a path the server refuses.
  The CLI's own `Record<RoleResourceType, true>` is what caught this — its docblock says a
  kind added to the SDK is a compile error there until it is listed, and that guard fires
  in the removal direction too.

  Caught by `types-match-the-v1-contract.test.ts`, which is compiled rather than run: six
  `Expect<Equals<…>>` pairs went `TS2344` the moment the schemas moved. That is the gate
  doing its job — the alternative was this package compiling perfectly while shipping a
  lie about a surface that carries salary figures.

- e3ab8c0: `role set-tasks` documents the assignment shape the API accepts, and a refused assignment
  now names the arms it would have taken.

  `role tasks --help` told callers to key an assignment `"person:<userId>"` or
  `"<resourceType>:<resourceId>"`. **The API has never accepted either.** It takes
  `{ "kind": "person", "userId": … }` and
  `{ "kind": "resource", "resourceType": …, "resourceId": … }`, and neither `kind` nor
  either value appeared in any help text. `set-tasks --help` described `--body` as
  `{ tasks: [...] }` and named no field of a task at all.

  The sentence was not stale — it was a TRUE statement about the database's uniqueness
  keys (`@@unique([taskId, userId])`, `@@unique([taskId, resourceType, resourceId])`)
  promoted into an instruction about the wire. A claim that is right about one layer and
  addressed to another reads as checked. `git log -S'person:'` over the schema returns zero
  commits and the schema's creating commit already carried both `kind` arms.

  Sending the documented string was refused with `tasks.0.assignments.0: Invalid input` and
  nothing else, while the `basis` and `group` enums one field away enumerated their values.

  **What changed:**
  - The help on both commands prints the two arm objects, every key of a task, and the
    member kinds a resource arm accepts. The arms and the kinds are interpolated from the
    SDK's own unions through `Record<…, true>` gates, so an arm added or removed there is a
    compile error here rather than a help text that drifts.
  - The refusal enumerates. `RoleTaskAssignmentInput` is a discriminated union whose error
    is read back off its own arms:
    `tasks.0.assignments.0.kind: Invalid option: expected one of "person"|"resource"`.
  - `resourceType` on the INPUT type narrows from `string` to `RoleResourceType`. The
    contract had been carrying a hand-written list that still held `external_tool` after
    that kind moved to `RoleExternalToolGrant` — so the schema accepted it and the server
    then refused it as "not this organization's", a wrong sentence about the caller's own
    data. A retired kind is now refused naming the live ones. The READ type stays a loose
    `string`, because a stored row may carry a retired kind and tightening a response would
    fail a whole listing over one legacy row.

- 5852eee: A `<bool>` flag now refuses any value that is not `true` or `false`, instead of reading it as
  `false` and reporting success.

  `deployment update --active TRUE` **deactivated a live channel.** `custom-model update --enabled
maybe` **disabled a production model.** Both returned a success envelope. The flags were parsed
  with `raw === "true"`, so every other spelling — a different case, a typo, `yes`, `1` — collapsed
  to `false`, which is a real value the API accepts. There was nothing to notice: the command did
  something, and what it did was the opposite of what was typed.

  The refusal happens at parse time, before any request is sent, and names the two accepted values.
  Case is accepted (`TRUE`, `True`) because case is a typing artifact and the intent is not in
  doubt. `yes`, `on` and `1` are refused rather than coerced — a wider list of guesses rebuilds the
  same defect one rung up, where the guess that is missing becomes the new silent `false`.

  **Scripts passing exactly `true` or `false` are unaffected.** A script passing anything else was
  already doing the wrong thing and now finds out.

- 5852eee: `--help` is now checked against the API contract on every commit, so an example it prints is one
  the CLI will accept.

  `--help` is this CLI's contract — for the operator reading it and for the agent it gets pasted
  into — and every sentence in it could be wrong. An audit of 674 shipped claims found 75
  contradicted by observed behaviour. The expensive kind is an example: it is copied, it is
  refused, and the help written to make a command work first time is what broke the attempt.

  A gate now walks the real root program, every leaf, and refuses a command whose help promises
  something the contract does not support — an unknown flag in an example, a path id that no route
  takes, a body field that is not in the schema, an example the CLI itself rejects when parsed. The
  population comes from the same derivation the command sweep uses, and a disagreement between the
  two is a failure rather than silence, so neither can quietly stop covering a namespace.

  **The boundary, stated plainly because it decides what this is worth:** the help is checkable
  against the contract. It is not checkable against the server. Whether a documented 2xx actually
  records anything, whether a poll terminates, whether a delete cascades — none of that is
  reachable by a static reader, and the majority of the original audit's rows are of that kind.
  Those are covered, where they are covered at all, by tests measured against a running backend,
  which is a different instrument and remains a separate one.

  Alongside the gate, this release corrects the help it was written to measure: examples that named
  flags that do not exist, required flags absent from every example, and namespaces whose help
  omitted the outcome a caller most needed before running the command.

- 5852eee: `custom-model create` and `custom-model update` take `--endpoint-url` and `--endpoint-key`.
  The old `--base-url` and `--api-key` spellings are gone, and neither ever worked.

  **Rename your flags.** `--base-url` and `--api-key` are GLOBAL options naming the Nexus API
  itself. The root program parses its own options across the whole of argv — it does not stop at
  the subcommand — so a subcommand option sharing a long name never receives a value. On
  `custom-model create` both were `requiredOption`, so the command was refused outright with
  `error: required option '--base-url' not specified` while the user was plainly passing it. There
  is no invocation of the old flags that did what its `--help` said it did.

  **On `custom-model update` the same collision was silent and sent your provider key to your
  provider's host.** Those two flags are declared with `.option`, not `requiredOption`, so nothing
  was refused: the values were absent from the request body AND applied to the CLI's own
  transport. `custom-model update --base-url <provider host> --api-key <provider key>` therefore
  issued `PATCH /api/public/v1/custom-models/:id` **against the provider's host, carrying the
  provider's key in the `api-key` header** — a credential handed to a third party by a command
  that reported nothing wrong. Verified against a local sink. If you have run that form, treat the
  key you passed as exposed to whatever host you named.

  The new names differ from the API fields they fill (`endpointUrl` → `baseUrl`,
  `endpointKey` → `apiKey`) and that is forced rather than careless: the names that match the
  fields are the ones the globals already own. `--body` still works and is unchanged — it takes
  the API's own field names, and a refusal now names `baseUrl`, not the flag's camelCase, so it
  cannot send you to a key the server discards.

  A gate refuses the next collision instead of waiting for it to ship. It walks the real program
  and fails the build on any subcommand option shadowing a global that is not on an explicit
  exception list, so merging a global's meaning and renaming away from it are both deliberate acts
  with a name on them. `auth login` had carried a per-command workaround with a comment explaining
  this exact mechanism; a workaround on one command did not stop the next collision, which is why
  the fix is a gate rather than a third patch.

- 5852eee: `getEmbedConfig` returns the widget's real appearance — all 61 published keys — instead of
  eight keys read from the wrong level of the stored settings.

  **This is a breaking type change.** `EmbedConfig` no longer declares `theme`,
  `primaryColor`, `position`, `initialMessage`, `logoUrl`, `avatarUrl` or `headerTitle`, and
  `UpdateEmbedConfigBody` drops the same seven. A consumer reading one now gets a compile
  error. The nearest replacements are `uiAppearance`, `uiPrimaryColor`, `bubblePosition`,
  `welcomeMessages`, `headerMessage` and the `landingScreen*` group — but read the config
  first rather than mapping by name, because the shapes differ.

  The old eight were read off the top of `deploymentSettings`, and the widget stores its
  appearance under `deploymentSettings.embedSettings`. Only one of the eight —
  `suggestedMessages` — was even a member of `EmbedSettingsSchema`, and it was read at the
  wrong level too, so it was `null` as well. Both types now derive from that schema, so the
  read returns what the dashboard editor writes and the rendered widget loads.

  Three consequences a caller can see.

  **A read is a valid update body.** `UpdateEmbedConfigBody` is `EmbedConfig.partial()`, so the
  two key sets are identical by construction. Previously the read was `string | null` and the
  body `string | undefined`, and PATCHing a read straight back was a 400 — the round trip the
  docs described could not run.

  **An undeclared key is dropped silently, not refused.** The write parses against a non-strict
  schema, so a misspelling is stripped before the column and answers 200 with the old value in
  place. Nothing reports it. Previously that was every call: seven of the eight keys the API
  advertised were undeclared, so they accumulated in the column and reached nothing. Check the
  response for the key you sent.

  **A non-EMBED deployment is now a 400 `NOT_AN_EMBED_DEPLOYMENT` on both verbs.** They
  previously accepted any deployment id and never checked the type. Some non-embed channels —
  Telegram, Twilio Voice, Teams — hold a top-level `initialMessage` that the old read returned,
  so a caller that passed a non-embed deployment id and used that value now gets a 400 instead.
  In production 25 deployments carry one — 10 on Telegram, 12 on Twilio Voice and 3 on Microsoft
  Teams — and 21 of those hold a non-empty value rather than an empty string.
  Read those channels' settings with `deployment get`.

  `identityVerificationSecret` is the one key of the 62 the API never returns. It is the
  server-side HMAC key that signs a visitor's `externalUserId`, so publishing it would let any
  `deployments:read` holder forge a visitor identity. The omission lives in the contract
  schema rather than in a hand-kept field list beside it, and the update merges from the full
  stored settings, so the secret survives a patch it can never send back.

  CLI `--help` for `deployment embed-config` and `embed-config-update` is rewritten against the
  same facts. Its previous warnings described the defect above accurately and are now all
  false.

- 5f6ec41: Every `--help` screen now names the client that is talking, and says so on the surface where absences are read.

  An audit of the Roles product recorded capabilities as absent from the PLATFORM on the
  evidence that no verb for them existed in this CLI. Eleven rows carried the note
  "none — `nexus role tasks` is read-only", which is a near-quote of what
  `nexus role tasks --help` printed in 0.22.1: `READ-ONLY TODAY. There is no "set-tasks"`.
  Every word of that was TRUE for that build — 0.22.1's published bundle carries no
  `command("set-tasks")` and no `replaceTasks` call. 0.23.0, published hours earlier, has
  both. The reader was not careless and the help text was not wrong; the screen was missing
  the two facts that make an absence readable.

  The first is which version is speaking. This CLI already checks npm daily and caches the
  answer, but the notice is written after `parseAsync` resolves, and commander's help action
  exits the process before that — so the ONE surface consulted to decide whether a verb
  exists was the one surface that never said the verb table was stale. Measured with a
  positive control: `role tasks --help`, `role --help` and `--help` printed the notice zero
  times, while a real command printed it once and printed it even when the command failed.
  The footer reads the cache synchronously and fetches nothing, so help stays instant.

  The second is that a client's verb table is smaller than the platform's route table at
  every version — five Roles board routes plus `system-map` are served and have no verb here
  at any version. The footer names `nexus api <METHOD> <path>` as the way to ask the route
  itself.

  One registration on the root program covers all 580 commands at every depth: commander
  fires `afterAll` on the helped command and every ancestor. Position is load-bearing — the
  footer sits BELOW the command's own `Notes:` block, where an absence claim lives, because a
  caveat above the claim it qualifies is read first and overridden by what follows it.

  The shipped command tree is reachable from a test as `buildRootProgram()`, exported from
  `index.ts` and re-exported from `root-program.ts`. `index.ts` parsed `process.argv` at
  module scope, so importing it ran the CLI, which left every cross-cutting property of the
  real program assertable only against a program a test rebuilt by hand — and a rebuilt
  program agrees with itself. Only that side effect moved, behind an entry-point guard: the
  declarations stay in `index.ts`, because five test files derive facts by reading
  `src/index.ts` as text and moving them out reds every one.

- d670823: `--json` no longer carries less diagnostic information than the human output.

  `printSuccess(message, data)` printed its message to a human and dropped it from the JSON
  document. That is cosmetic while the message restates the data, and it is not cosmetic
  where the message is chosen on the RESULT. An AST sweep of all 193 `printSuccess` call
  sites found 8 that branch:

      printSuccess(result.removed ? "Workspace revoked." : "No such grant.",
                   { removed: result.removed })

  There the branch IS the diagnosis. A caller reading the human form was told
  `No such grant.`; the same call under `--json` got a bare `removed: false`, which reads as
  "the operation failed" rather than "you named a thing that does not exist". Somebody who
  passed a workspace id to `role revoke-workspace`, which wants the GRANT row's id, had the
  explanation available and the flag they used threw it away. Every layer named the id
  correctly already — the route, the SDK docblock, the CLI's `<grant-id>` argument
  description — so there was no copy left to clarify. What was missing was the no-match
  saying it did not match, on the surface being read.

  `message` is now a key on the JSON document. The same sweep found 0 call sites passing a
  `message` key of their own, so nothing collides, and the key is added rather than
  substituted — every consumer reading `success` or a data field is unaffected.

  `role revoke-collection` and `role revoke-workspace` also say more on a no-match: which id
  class the argument wants, and the read verb that prints it.

  The gate derives its population from the source rather than a list, so a ninth branching
  call site is covered without editing it, and it fails rather than passes if the walk finds
  nothing.

- e351c63: `nexus role`'s `--body` help names every field the route requires, and stops describing damage that does not happen

  `role create-job-type --help` said "every field is required" and named six of
  eleven. A caller following it verbatim is refused for `category`,
  `quantityUnit`, `parts[].unit`, `hoursExpression` and `revenueExpression`, and
  the only escape the Notes offered — "read an existing one with `nexus role
job-types --json`" — does not exist in an organization with an empty library,
  which is every new organization. Both `create-job-type` and `update-job-type`
  now print the whole body field by field, plus a worked example that is verified
  to parse against the schema the v1 controller validates with.

  `role delete-job-type --help` described silent damage the product does not do:
  "ANY SCOPE LINE NAMING IT LOSES ITS PRICE MODEL, AND NOTHING SAYS WHICH". The
  server refuses with a 409 naming how many scope lines still quantify it, and
  nothing is modified — `RoleScopeLine`'s key into the library is `NO ACTION`, so
  the database refuses the delete regardless. Help that is scarier than the
  product costs caution rather than data, and it is still a false claim about a
  route. The genuinely useful half — the count is org-wide and names no Role — is
  kept.

  Also:
  - `set-scope-lines` prints the line shape. `scope` is required and was
    documented nowhere, and there is no `note` on a line — the strict schema
    refuses one by name, so the obvious guess is now named as a refusal.
  - `update` says an unknown key is DROPPED rather than refused. The body schema
    is not strict, so a typo answers success with the field unchanged; a body of
    only unknown keys answers "An update must change at least one field", which is
    the one signal a field name was wrong.
  - `set-variables` says a `dimension` key is refused and the dimensional check is
    unreachable from what this command stores — without implying expressions are
    validated somewhere else on this API. They are not: a job type's expressions
    are infix strings stored verbatim.
  - `coverage` enumerates its `reason` vocabulary. Every sibling enum on this
    server already enumerates itself; this one answered a bare
    `NO_WORKING_TIME_MODEL` with no way to learn what else could come.
  - `role --help` names the five capabilities that have no verb at any version —
    boards and cards, the system map, a Role's workload, a system's impact model,
    task graduation — and says they are served to the dashboard rather than
    missing from the platform. An enumeration of verbs is read as an enumeration
    of the platform, and that reading produced a wrong audit.

  Every list above is a `Record` over an SDK type, so a field added to a body is a
  compile error here and a field removed is a `TS2353`. Nothing previously read
  both a schema and its help, which is why the wrong count survived review.

  Fixes `--print-contract`, which was dead on exactly the commands that needed it:
  it was read in a `preAction` hook, and commander enforces `.requiredOption()`
  first, so on `create-job-type` it answered `error: required option '--body
<json>' not specified` while the block above it said "Use --print-contract for
  the full list". It is now read during option parsing, and it is the only way to
  see `parts[].unit`.

- 170b3dc: `nexus role` help follows the Role contract again.

  `src/commands/role.contract.generated.ts` is a committed generated tree, emitted by
  `scripts/generate-contract-help.ts` off the v1 descriptors in `@nexus/types`. Its inputs moved when
  `external_tool` left `RoleResourceType` for `RoleExternalToolGrant` and two capabilities joined
  `RoleCapability`, and nothing re-ran the generator, so the shipped artifact disagreed with the server
  in both directions at once:
  - `role attach`, `role detach` and `role access-request create` still offered `external_tool` as a
    resource type. The server refuses that value, so the CLI advertised a path that cannot succeed.
  - `role create-permission-set` and `role update-permission-set` omitted `external_tool_grant.view`
    and `external_tool_grant.manage`, so two capabilities the server accepts could not be named.

  Regenerated with `pnpm --filter @agent-nexus/cli run gen:contract-help`. No hand edit: the first run
  rewrites this one file and reports the other 38 already current, and a second run reports all 39
  already current.

  This is help and enum copy only — no command, flag, argument or request shape changes.

- 5852eee: The root epilogue's cross-cutting guarantees now hold for every command, enforced in the
  printer rather than command by command.

  `nexus --help` promises three things that were not true everywhere. Each was fixed at the
  one place every command already goes through, so the next command inherits the fix
  instead of repeating the bug.

  **`--json` prints one JSON document, and a failure exits 1.**
  `customer get-by-external-id` printed `No customer found.` — English prose — on stdout
  and returned, so a miss was indistinguishable from a hit by output shape AND by exit
  code, the one combination nothing downstream can work around. A miss here is a 200 with
  an empty body, not a 404, so the error handler never saw it. Commands with that shape now
  use a verb that emits the standard error document and exits 1.

  **The error document is one shape: `{message, hint, code}`, all three always present.**
  `code` used to be dropped entirely — every documented API error code, workflow codes
  included, died at the last step and reached no channel. `hint` used to be omitted from
  the JSON whenever it was absent, so the document was really two shapes while claiming
  one; it is now `null`. A consumer needs no presence check on any field. The code is also
  printed on the human channel, so terminal output pasted into a bug report carries the
  machine-readable cause.

  **A truncated table cell says so, and distinct values never collapse.**
  Cells were cut with a bare `slice` and no marker. `workspace status` renders mounts under
  a 56-character shared prefix, so past the 50-character auto-cap four different paths
  printed as the same path — an operator picking one from that list picks blind. Cuts now
  carry an ellipsis, and the printer checks its own work: if cutting the tail would make
  two rows read identically it cuts the middle instead, and widens the column if that still
  collapses them. A wide row is cosmetic; a table asserting two different things are the
  same thing is a wrong answer.

  **`[object Object]` can no longer reach a terminal.** Every printer routed values through
  `String()`, which is correct for a string and unreadable for an object. `analytics
overview` rendered five of its fields that way — `tokenUsage`, `timeSeries`, `byChannel`,
  `byDeployment`, `byModel` — and `access-card get` rendered `policies`, the field whose
  help says to read its key set. Objects and arrays now render as JSON. `--json` still
  serializes the untouched response.

  Two commands also stopped lying about what they return:
  - **`skill-folder list` prints the assignments**, which the endpoint always returned and
    the command discarded — from the table and from `--json` alike — so it could not do the
    thing its own one-line description promises.
  - **`docs --full` / `--index` read the API host, and honour `--timeout`.** They fetched a
    hardcoded `gpt.nexus/docs/…`, which is the dashboard: a static SPA that rewrites every
    path to its shell, so the fetch answered 200 with a web page and the command printed
    HTML as documentation. No status code could reveal that, so the content type is now the
    check. The hardcoded host also bypassed `--base-url` / `--profile` / `NEXUS_BASE_URL` /
    `NEXUS_ENV` entirely, and a hardcoded 60s deadline ignored the global `--timeout` on a
    2.5 MB feed. 60s is still the default. Both feeds remain unauthenticated.

- eddc904: `nexus tool execute --help` said naming an `accessCardId` was refused with a 403. The route
  honours one now, so the help described a refusal that no longer exists — and it did so in the
  direction that costs something: a reader who wanted a scoped call was told not to try.

  The note now separates the two cases the route really has:
  - **Omit `accessCardId`** and the call resolves the credential's MASTER card, which permits every
    action the credential can perform and filters no parameter. That is still unscoped, and it is
    what every example on that help page does.
  - **Name one in `--body`** and it is honoured: the card must belong to the credential being spent,
    and its policy decides which action and which parameters survive. A refusal is a 403 naming what
    it refused.

  The old text collapsed both into "unscoped", which was true of the first and wrong about the
  second. `nexus access-card list` is named as the way to find an id, because a caller who reads
  this line needs one and the command already exists.

  No flag, no argument and no output shape changes — this is `--help` text.

- a5b4389: `nexus tracing generations --provider` offered three providers where the server accepts
  four, and refused nothing.

  The flag was a plain `.option()` whose description carried a hand-typed
  `(OPEN_AI, ANTHROPIC, GOOGLE_AI)`. The endpoint validates against the `ModelProvider`
  enum, which has had a fourth member — `KIMI` — since the provider shipped, with an
  AI-task adapter and a chat-streaming service that both record generations under it. So a
  caller wanting KIMI generations was told the option did not exist and did not try. That
  is the expensive direction for a wrong list: an omitted value is invisible, where an
  extra one at least produces an error somebody reads.

  `--provider` and `--status` now bind to the contract through `enumOption`, so `--help`
  prints the list the server validates against and a junk value is refused before any
  request leaves the machine. Nothing regenerates a hand-typed description, which is why
  the old one could sit three-of-four for as long as it did.

  Binding needed `TracingListGenerations` off `BLOCKED_DESCRIPTORS`, and it was blocked on
  `Params.sortBy` and `Params.order` having no flag to reach them. Both now exist:

  ```
  nexus tracing generations --sort-by costUsd --order desc
  ```

  `--sort-by` takes `startedAt`, `costUsd` or `durationMs` and defaults to `startedAt`;
  `--order` takes `asc` or `desc` and defaults to `desc`, so the ordering of an existing
  invocation does not change.

  ⚠️ `--sort-by costUsd --order desc` leads with the UNPRICED generations, not the
  expensive ones. A null cost is not zero, and Postgres orders nulls first when descending
  — measured against staging, the first page came back `[null, null, null, 0.5351,
0.5261]`. `--min-cost 0` drops them and gives the page the name implies. Both facts are
  now in the command's `Notes:`.

- 92e9dc1: `tracing generations --sort-by costUsd --order desc` stops leading with the unpriced calls, and the provider filter is typed instead of being a bare `string`.

  **The ordering.** Postgres sorts NULLs FIRST on `DESC`, so "show me the most
  expensive generations" answered with the ones that have no cost recorded at all —
  measured against staging, `[null, null, null, 0.5351, 0.5261]`. The defect
  appeared in one direction only, because `ASC` already put them last, which is why
  it survived: nobody sorts ascending to find the expensive end. A NULL cost now
  sorts LAST whichever way you asked, on `costUsd` and on `duration-ms`, and on
  `tracing traces --sort-by total-cost-usd / total-duration-ms` too.

  A NULL cost is **not** zero and is not "this model has no price". A model missing
  from the pricing catalog is recorded at 0. NULL means the cost column was never
  written — the generation is still RUNNING, or it FAILED before any usage was
  recorded. The `--help` notes for both commands said otherwise and have been
  corrected.

  Pages are also stable now: both sort columns are heavily tied, and an offset page
  over a non-unique key could repeat a row on two pages or skip it entirely.

  **SDK type change, and it is the reason this is a `minor`.** Two fields narrow
  from `string` to the existing `ModelProvider` union:
  - `ListGenerationsParams.provider` — a request param, so passing a value typed
    `string` no longer compiles. Narrow the variable, or use the `ModelProvider`
    type this package already exports from `types/common`.
  - `GenerationSummary.provider` — a response field. Reading it is unaffected;
    comparing it against a string literal outside the union is now a compile error,
    which is the point.

  Nothing changes at runtime: the server always rejected a provider outside the
  enum. What changed is that the published type now says so. The contract schema
  had been widening its own inference to `string` through a leftover zod-3 cast,
  so every consumer downstream carried `string` while the parse was strict.

## 0.23.0

### Minor Changes

- 67920d3: A Role's task list and its duty ticks are writable over the Public API v1.

  Three routes ship with SDK methods and CLI commands: `replaceTasks`
  (`nexus role set-tasks`), `listTaskDuties` (`nexus role task-duties`) and
  `replaceTaskDuties` (`nexus role set-task-duties`).

  Send each task's `id` back on a replace. A named task is updated in place and
  keeps its id; one without an id is created; one the body omits is deleted. The id
  is what keeps that task's ticked duties attached, and dropping it still answers
  success.

### Patch Changes

- d5f2a6d: The CLI no longer installs over itself unless you pass `--auto-update`.

  A self-update broke working installs mid-session. `pnpm add -g` writes a NEW hash directory
  under `<pnpm home>/global/v11/` and relinks the global bin shim; the CLI ran that install from
  inside the directory being replaced, through `execSync` with a 60-second SIGTERM ceiling. An
  install cut off at that ceiling leaves the shim resolving to a directory that no longer exists,
  and every later invocation dies with `Cannot find module '.../@agent-nexus/cli/dist/index.js'`
  until the user reinstalls by hand. Reported four or more times in a single session, with the
  version advancing on its own across reinstalls.

  **Nothing in this package can repair that state, and that is why the default moved rather than
  a recovery path being added.** The failure is in Node's module resolution, so it happens before
  the first line of this code runs — `--no-auto-update` cannot help either, which was the
  reporter's own complaint. The CLI also cannot make the swap atomic: it does not own the shim and
  does not control the order in which the package manager replaces the directory it is executing
  from.

  So the risk is simply not taken unasked. Without a flag you get one line naming the newer
  version and the command that installs it — the same notice the CLI already printed under
  `--no-auto-update`, `NEXUS_NO_AUTO_UPDATE` or in CI. `--auto-update` opts back in;
  `--no-auto-update` keeps working, so a script that passes it is unaffected.

  This is a judgement about a shipped default, and it is stated so it can be reversed
  deliberately: the updater delivers a version bump nobody asked for, and it has now produced two
  tickets — one for adding 18 to 120 seconds to every invocation, one for bricking the tool
  mid-session. The notice delivers the same information and cannot break an install.

  The mechanism is one commander subtlety and it regresses silently: a lone `--no-x` carries an
  implicit default of `true`, and declaring the positive `--x` beside it is what removes that
  default. Deleting the `--auto-update` line reads like tidying a redundant flag and would turn
  the updater back on for everyone, so a test derives both flag declarations from `index.ts` and
  asserts the resolved value rather than the presence of a line.

- 11dd25f: `prompt-assistant chat` reaches the server again, and the global `--timeout` governs its wait.

  Every invocation of `nexus prompt-assistant chat` aborted before its request left the machine,
  in both `--mode agent` and `--mode ai-task`, on every published version that carried the
  command. The output named a wait it never performed:

  ```
  (node:XXXXX) TimeoutOverflowWarning: 7200000000 does not fit into a 32-bit signed integer.
  Timeout duration was set to 1.
  The request was still running after 7200000s, so the CLI stopped waiting…
  ```

  `createClient({ timeout })` takes SECONDS — the unit of the global `--timeout <seconds>` flag it
  is spread from — and converts once, on the way to the transport. The command handed it a
  constant named `PROMPT_ASSISTANT_TIMEOUT_MS`, already two hours in milliseconds, so the value
  was multiplied by 1000 a second time. Node clamps a `setTimeout` delay past 2^31-1 ms **to
  1 ms**, warning only on stderr, so the abort fired immediately and then reported itself as a
  timeout after the 7,200,000 seconds it had not waited.

  The same call also pinned that value unconditionally, after the spread that carried the flag.
  So `--timeout` changed nothing, while the CLI's own error told the user to raise it — a false
  instruction in shipped output, and the reason the defect had no workaround.

  Three changes, at the boundary rather than at the symptom:
  - the command's default is `PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS`, in the unit the
    parameter takes, and falls back to it only when `--timeout` is absent — the shape
    `task execute` already used;
  - `timeoutSecondsToMs` and `parseTimeoutSeconds` REFUSE a value past Node's timer ceiling and
    say so, naming the likely cause. A clamp to 24.8 days would be indistinguishable from
    working; an instant abort was indistinguishable from a slow server;
  - `chat --help` derives both of its waits from the constants, so the poll's five minutes and
    the request's two hours cannot drift from the code.

  No unit crossed a boundary unlabelled anywhere else: the other six `timeout` wirings in the CLI
  all convert through `timeoutSecondsToMs` or name a `*_MS` constant, and a source gate now holds
  that convention in both directions.

- 2a1fc22: `nexus role tasks --help` names the write verb instead of denying it.

  The note read `READ-ONLY TODAY. There is no "set-tasks"` while `set-tasks` was
  defined thirty lines below it in the same file. An operator reading the help was
  told the write did not exist, so the sentence sent them looking for an API the
  CLI already exposed.

  It was also silent on the consequence that matters. `PUT /roles/:id/tasks`
  replaces the whole list: a task sent without its `id` is deleted and re-created,
  and `RoleTaskResponsibility.taskId` cascades, so that task's ticked duties go
  with it — at 200 OK, with a correct-looking body and nothing in a log. The help
  now says to send each task's id back, and says what dropping it costs.

  The claim rotted because no assertion held it. `role.test.ts` now asserts both
  halves — that the help names `set-tasks`, and that it carries the id
  consequence — so restoring the stale sentence reds a test rather than passing
  review as tidying.

- a900658: A millisecond number can no longer reach a parameter that means seconds.

  `createClient`'s `timeout` is SECONDS and every transport under it is milliseconds. Both were
  `number`, so nothing stopped a constant named `PROMPT_ASSISTANT_TIMEOUT_MS` crossing that
  boundary. It was multiplied by 1000 a second time, overflowed Node's 32-bit timer, was clamped
  to 1 ms, and aborted every `prompt-assistant chat` before the request left the machine. The
  docblock on that parameter already said SECONDS and was already right — a docblock is not a
  check.

  The option is now typed `Seconds`, a branded number with exactly one way in: `seconds(...)`.
  Calling it is the moment somebody states the unit out loud. Passing a plain number does not
  compile.

  Nothing else had to change. `createClient(program.optsWithGlobals())` — the shape at the great
  majority of call sites — still compiles, because commander types its option bag with an `any`
  index signature. That is also the brand's honest limit: `globals.timeout ?? SOME_MS_CONSTANT`
  is `any` and slips through, so the type does not subsume the source gate that already refuses a
  `*_MS` identifier in the seconds slot and requires a command default to keep reading
  `globals.timeout`. The two overlap on purpose. The type catches what a name cannot — an unnamed
  literal like `7_200_000` — and it fires in the editor rather than after a push, which is the
  half that matters for a branch months behind staging.

  Deliberately NOT built: a repo-wide rule against an explicit key set after a spread of user
  options, the shape that made `--timeout` unoverridable. Measured before deciding — across
  `packages/cli`, `packages/sdk`, `packages/types` and `apps/backend` the pattern has 23
  instances, of which 21 are ordinary correct code like
  `{ ...this.attributionColumns(options.attribution), status: "IN_PROGRESS" }`. Only 2 sites
  involve user flags at all and both are already correct. A gate there would be roughly 91% false
  positives on a shape that is normal everywhere else, and a guard that cries wolf is switched off
  within a day.

## 0.22.1

### Patch Changes

- 6e18439: `role tasks --help` stops describing an assignment id that does not exist.

  The help said "AN ASSIGNMENT ID IS NOT [durable]: assignment rows are deleted and
  re-inserted under their task on every save", and separately that "ASSIGNMENTS carry ids
  and no names". A `RoleTaskAssignment` has no published id at all.

  Measured against the built schema rather than read off source:
  `RoleTaskAssignmentViewSchema` parses a person assignment to exactly `kind` and `userId`,
  and a payload carrying an `id` is REFUSED. The refusal is the load-bearing half — a
  schema that merely tolerated an extra key would have accepted it, so the absence is a
  contract rather than an omission.

  The identity is the ARM OBJECT — `{ kind: "person", userId }` or
  `{ kind: "resource", resourceType, resourceId }` — which is what
  `@@unique([taskId, userId])` and `@@unique([taskId, resourceType, resourceId])` already
  enforce on the row. The help now says that.

  The true half is kept: a task id IS durable and a task saved with its id is updated in
  place, and assignments still carry the ids they point AT rather than display names.

  This is the CLI copy of a claim already corrected across the v1 contract, the v1 response
  schema, the controller's Swagger description and the SDK in #3344.

- 317be28: `nexus role` uses "coverage" for one thing only: the automation figure.

  The word named two things on commands an operator reads side by side — the
  automation figure that `nexus role coverage` returns, and the task↔duty
  checklist, which is not a figure at all. `remove-responsibility` said it unticks
  a duty "from every task that COVERED it", three screens from a command whose
  whole subject is a coverage percentage.

  Every sentence involved was true, which is what made it worse than the false
  coverage claims corrected just before it: there was nothing to catch.

  The figure keeps the word on evidence, not seniority — it owns the published
  `role_coverage:read` API scope, the `coverage.view` / `coverage.manage`
  capability strings, the command name and the response schema, while the
  checklist sense owned no identifier anywhere and was prose in two help strings.
  So the checklist is now "the duty checklist", and a task "ticks" a duty, reusing
  the metaphor those same paragraphs already used.

  A module docblock listing a surface this CLI does not expose as "— not covered —"
  now reads "— not exposed —", which was a third sense of the same word.

- 4f0604e: `nexus role` no longer tells a caller that writing the job model moves a Role's coverage.
  It does not, and five help strings said it did.

  A Role carries two cost models with one vocabulary. Coverage is derived on the server from
  the Role's workload, each held system's impact model, and the organization's automation
  settings. The job model — the Scope, the job-type library, the Role's variables, its
  working year — is stored by the server, read by the server for nothing, and evaluated in a
  browser. An API caller wrote every job-model input the public surface exposes on one Role,
  read them all back correctly, and the figure did not move by a digit.

  Corrected: `scope-lines` no longer calls the Scope "its authored workload";
  `set-scope-lines` no longer claims an empty list makes coverage "not modelled";
  `set-working-year` no longer claims to change "coverage denominators"; `delete-job-type`
  no longer claims to change "coverage and money figures"; and `update-job-type`'s reprice
  warning now sends the reader to the affected Roles' scope lines rather than to a coverage
  read the write cannot move. Every job-model WRITE now carries one shared statement saying
  which figure it does not touch.

  `nexus role coverage --help` gains the answer the caller went looking for: the three rows
  that do move the figure, that only the organization's automation settings are writable
  through this API, that the workload and the per-system impact are authored in the
  dashboard on the Role's General tab, and that those two routes are absent from the public
  API deliberately rather than by omission.

## 0.22.0

### Minor Changes

- 7ee6747: `--help` for `agent`, `agent-tool`, `workflow`, `execution` and `agent-eval` now carries
  the behaviour a caller needs to get each command right first time: preconditions, the
  exact body shape, what a silent failure looks like, and how to verify the write.

  Six shipped examples could not work and are corrected — `--type WEBHOOK` is not a tool
  type, `agentInputSchema` is required on every `agent-tool create`, ids inside `--config`
  must be UUIDs, an edge type is `main` or `rewind`, a batch `ref` is declared bare, and
  `action` / `condition` / `llm` are not node types.

  Two flag changes, both because the flag could not work as shipped: `agent create` and
  `agent update` drop `--tone`, which the API refuses with a 400 before validation because
  `tone` was removed from the agent resource; and `agent-tool update` gains `--type`, which
  the API requires alongside any `config` update, so `--config` alone could only ever fail.

- 2da8509: `--help` now carries the full instruction for the root command and for `folder`,
  `workspace`, `tracing`, `ticket` and `version`.

  The standard is `nexus role`'s and is unchanged: imperative `Notes:` blocks that
  name the consequence, written so that pasting a command's `--help` into an agent
  prompt with no other source is enough to use it correctly first time — including
  the cases where it would otherwise silently do the wrong thing.

  `nexus --help` gains the contract that holds everywhere: every failure exits 1,
  a table column is hard-truncated to its width, `-` and blank mean null, a
  `--timeout` is client-side and does not stop the server, an unknown body key is
  dropped rather than refused, and scopes are not hierarchical.

  Six behaviours that were documented internally but absent from the help of the
  command they concern are now in it, among them: `version restore` writes the
  draft only, so on a published agent it changes nothing at runtime; `version
create` auto-publishes the first checkpoint; `tracing trace` caps its
  generations list at 100 and recomputes the count from the truncated array;
  `folder delete` promotes child folders to root; and `ticket create` silently
  loses `endpoint` on read when `method` is omitted.

  A minor rather than a patch: no runtime behaviour changes, but the help text is
  the CLI's published interface for agent callers and this is a substantial
  addition to it. Three command descriptions that stated something untrue are
  corrected — `tracing export-bulk` said max 1000 where the schema caps at 500,
  `version restore` implied it published, and `folder list` implied it printed
  assignments.

- f4a5f6c: `nexus credential delete` gains `--yes`, and `credential`, `access-card`,
  `external-tool` and `prompt-assistant` `--help` carry the behaviour a caller
  needs to use them correctly the first time.

  The flag first, because it is the only behaviour change. `credential delete`
  cascade-deletes every access card on the credential — including the master card
  `access-card delete` refuses to remove — and fired on submit with no
  confirmation, while its far less destructive sibling `tool delete-credential`
  has always confirmed. It now confirms the same way, gated on
  `process.stdout.isTTY`: piped and scripted callers behave exactly as before,
  with or without `--yes`, so nothing that automates this command changes.

  Everything else is help text, which for these four namespaces is a contract
  rather than a convenience — they are consumed by pasting `--help` into an agent
  prompt with no other source available. Each namespace now names the outcomes
  that were previously indistinguishable from the safe ones at the call site: the
  delete cascade and the refusals around it; that an access card created with no
  `policies` grants NOTHING; that `external-tool execute` answers `success: true`
  for an action that failed upstream; and that an unrecognised
  `prompt-assistant --thread-id` silently opens a new thread instead of
  continuing yours.

  A minor rather than a patch for the new flag alone. No existing invocation
  changes meaning.

- 650ad1e: `nodeStatusCounts` now means the same thing on every execution endpoint, and the
  loop-inclusive figure has its own field.

  `execution diagnose` keyed its counts by the raw uppercase node status
  (`COMPLETED`) and summed them across loop iterations, while `execution list` and
  `execution get` keyed the same field by lowercase bucket (`completed`) and counted
  each graph node once. Reading `nodeStatusCounts.completed` off a diagnose response
  returned `undefined`, and comparing the number against `list()`'s gave two
  different answers for one execution. The human-readable output hid both, because
  the CLI lowercased the keys itself before printing them.

  On all three endpoints `nodeStatusCounts` is now the fixed lowercase
  `ExecutionNodeStatusCounts` shape, tallying this execution's OWN nodes — one entry
  per graph node, equal to the length of `diagnose().nodes`. The loop-inclusive
  tally moves to a new `nodeExecutionStatusCounts` field on both `ExecutionSummary`
  and `ExecutionDiagnose`: it counts every node execution beneath the row, so a
  `doWhile` that polled 8 times over 4 nodes contributes 32 there and 4 above. The
  two are equal when the workflow has no loop.

  `ExecutionNodeStatusCounts` also gains `skipped`, for nodes on a branch that was
  not taken.

  For the CLI, `execution diagnose` prints the second line only when the workflow
  actually looped, rather than repeating identical figures twice.

  Breaking for anyone reading `ExecutionDiagnose.nodeStatusCounts` as a
  `Record<string, number>` of uppercase statuses, or relying on it being
  loop-inclusive. Both packages are pre-1.0, so this is a minor.

- a4f9319: `--help` for `deployment`, `channel`, `phone-number`, `emulator` and
  `conversation` now carries the behaviour a caller needs to use each command
  correctly first time — preconditions, body shape, destructive consequences and
  how to verify — instead of a usage line and an example list. All 76 screens in
  those five namespaces carry guidance; 51 previously had none.

  Two behaviour changes come with it.

  `nexus phone-number buy` and `nexus phone-number release` now require
  confirmation. Both were previously unguarded, and both are irreversible: a
  purchase bills monthly until released, and a release hands the number back to
  the carrier pool and detaches every deployment on it. Interactively they prompt;
  **without a terminal they refuse unless `--yes` is passed**. That is the
  breaking part — a script or CI job invoking either without `--yes` now exits 1
  having done nothing, rather than silently spending or releasing. Add `--yes` to
  keep the old behaviour.

  `nexus deployment folder assign --folder-id null` now sends a wire `null`,
  which is how the route spells unassignment. It previously sent the string
  "null" and 400ed, so the documented way to take a deployment out of a folder was
  unreachable from the CLI.

  Also corrected: `deployment create` no longer advertises `--type SMS`, which has
  no settings schema behind it and cannot succeed, and its EMBED example passes
  the settings body that type requires.

- b4b90db: Make the Roles `--json` documents say what the human output says.

  `nexus role create` and `nexus role delete` answer a union discriminated on
  `status`, and the SDK type says in as many words: READ `status`, NEVER THE HTTP
  CODE. A 2xx can mean an approval request was FILED — no Role created, or no Role
  removed. The human rendering obeyed that; `--json` carried no `status` at all, so
  a pending delete reported `success: true` while the Role kept serving traffic and
  kept holding every system. `status` is now on all three arms — `created`,
  `deleted`, `pending` — and the pending arms carry `requestId`.

  Nine fields also answered `null` with an English sentence under `--json`, because
  `printSuccess` renders one object down both channels and the `?? "(none)"` written
  for the terminal replaced the null a script parses. Absence detection was a string
  match against display copy, and the same fields are proper nulls on the matching
  GET. They are nulls on the write now too; the sentences stay in the terminal.

  `nexus role create` accepts `name` and `ownerUserId` from `--body`, which a
  `requiredOption` made impossible — commander enforces one before the action runs,
  so a complete body was refused for the field most likely to carry an apostrophe.

  A minor rather than a patch: these are the documents scripted callers parse.
  `role attach`, `role detach`, `role update --owner none`, `role set-working-year`,
  `role set-automation-settings` and `role review-creation-request` now emit `null`
  where they emitted a sentence, so a caller that matched on the copy — which was
  the only detection available — must switch to a null check. Every one of those
  sentences is unchanged in the human output.

  The SDK bump is documentation only: `roles.list()` now states that `readiness` is
  a parallel array to correlate on `roleId`, and that `nexus role list --json`
  answers a joined array under the same `data` key. No runtime or type change.

- 99834f3: A permission set can be joined and left from the SDK and the terminal.

  `client.roles.addPermissionSetMember()` and `removePermissionSetMember()` reach the two
  v1 routes that decide who actually holds a set's capabilities, and
  `nexus role add-permission-set-member` / `remove-permission-set-member` drive them.
  Until now a set could be created, changed and deleted from here while its membership —
  the half that decides what anybody can do — was reachable only from the web app.

  Both writes are idempotent and the boolean is the answer, never the status code:
  `added: false` for somebody already in the set, `removed: false` for somebody who was
  not. Every POST on this surface answers 201 regardless.

  Two preconditions the help now states, because both fail as a bare "not found":
  the user must already hold the Role, as owner or member, since a permission set is a
  subset of the Role's team; and removing one person is `remove-permission-set-member`,
  never `delete-permission-set`, which cascades every other member's row.

- f3c2618: A Role's duties, and its proposed tasks, are reachable from the SDK and the terminal.

  Four v1 routes ship with this change and the SDK and CLI reach every one:
  `listResponsibilities`, `addResponsibility`, `removeResponsibility` and
  `listTasks`, driven by `nexus role responsibilities | add-responsibility |
remove-responsibility | tasks`.

  The duty surface is complete. The TASK surface is READ-ONLY on purpose: a
  `RoleTask` id is not stable across a save of the list, so the write is excluded
  from v1 with its reason and its ticket written into the contract. `RoleTask.id`
  carries that warning on the type itself, because an SDK caller holds an id
  across a session where a dashboard user never does.

- a2cec17: SharePoint can now be searched by file-name fragment, like Google Drive and Notion.

  It was the only cloud provider whose adapter implemented no `searchItems`, so
  `cloudImports.search("sharepoint", …)` answered 400 `Provider does not support search`.
  Microsoft Graph exposes a recursive server-side `search(q=…)`; nothing called it.

  `SearchCloudItemsParams` gains an optional `siteId`, matching `BrowseCloudItemsParams`
  and `ImportCloudItemsParams`. It is additive, so no existing caller changes: Google Drive
  and Notion ignore it. SharePoint requires it and answers 400 `siteId is required for
SharePoint` without one, because SharePoint addresses items within a site.

  `nexus cloud-import search` gains `--site-id`. Its help previously said the flag was not
  accepted and pointed callers at `browse` instead; it now documents that SharePoint
  requires it, and that the search covers the whole drive recursively unless `--folder-id`
  narrows it.

  The search `query` is now trimmed before it is used, and a blank one is refused with a 400. This changes existing Google Drive and Notion callers too: `" T1 "` and `"T1"` were
  two different searches and are now one, and a whitespace-only query used to be accepted.
  An empty fragment is a substring of every name, so on SharePoint a blank query defeated
  the name-only filter completely and handed back every file on the page, content hits
  included.

### Patch Changes

- e3d4779: `role add-member` no longer tells an operator it grants capabilities it does not grant.

  The help text said a membership row "grants every capability the tier's permission sets
  carry". It grants none. `UpsertRoleMemberUseCase` writes the `RoleMember` row alone and
  creates no `RoleGroupMember`, and Role capabilities are resolved from those rows alone —
  so somebody who added a member at `--tier ADMIN`, read that sentence and stopped had
  granted nothing while believing they had granted admin. The same command's
  `add-permission-set-member` help, 349 lines further down, already said the opposite
  ("IT IS THE SET, NOT THE TIER, THAT CARRIES THE CAPABILITIES"), and an operator reads
  the wrong half first.

  The tier is now described as what it is: recorded on the row and read by nothing.
  `templateKeyForMemberTier` maps both `ADMIN` and `MEMBER` to the same template, and the
  membership read that resolves a person's reach carries no tier predicate, so the two
  values resolve identically. A membership row still decides reach into the Role's systems,
  collections and workspaces — that half was true and is kept.

  The same false sentence is corrected everywhere it was copied to: the SDK's
  `upsertMember()` docblock, the Public API v1 contract's `RolesUpsertMember` descriptor,
  and the two in `v1-roles.controller.ts` — one of them the `@ApiOperation` description,
  which is the published OpenAPI text an API caller reads. No runtime behaviour changes
  anywhere.

- a42fcb6: `--help` for `collection`, `task`, `document`, `template` and `cloud-import` now
  carries the behavioural facts a caller needs to use each command correctly first
  time, in the `nexus role` style.

  The point of the release is that these commands report success while doing
  something other than what the caller asked, and until now the only way to learn
  that was to hit it. `collection attach-documents` drops folder ids and reports the
  count you sent. `collection remove-document` leaves retrieval answering from the
  removed document for up to fifteen minutes. `document add-website --mode sitemap`
  with no `config.urls` fetches nothing and reports READY. `document update
--metadata` replaces the metadata bag rather than merging it. `cloud-import
import` skips unreadable items in silence. `template generate` ignores variable
  names the template does not use, and returns a public, non-expiring URL. Each of
  those now appears in the help of the exact command it concerns.

  A patch because nothing executable changed: help text only, plus three `task
create` examples that replace four which were each a guaranteed 400.

- d17dc27: `--json` now emits a real `null` for an absent folder on `deployment folder assign`
  and for an unnamed checkpoint on `version create`.

  Both built their `printSuccess` payload with `?? "(none)"` / `?? "(unnamed)"`, and
  `printSuccess` renders one object down two channels — so the string meant for the
  terminal reached the wire, and a script had to detect absence by matching English.
  The matching GET already returned `null` for the same field. Both now use
  `absent()`, which emits `null` under `--json` and the sentence in the terminal.
