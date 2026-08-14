# @agent-nexus/cli

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
