# @agent-nexus/sdk

## 0.15.0

### Minor Changes

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

- 5852eee: `models.list()` is typed as the array it has always returned. It is not `{ models: [...] }`.

  **This changes the declared type, so a caller destructuring `{ models }` stops compiling.** That
  is the point: the destructure was already returning `undefined` at runtime, and the type was the
  only thing hiding it.

  `GET /models` answers `createApiSuccess([...])`, which the HTTP client unwraps to the array
  itself. The wrapper key was deliberately dropped from the server's use case — its own comment
  records the old `{ models: [...] }` shape as violating the SDK contract — and this signature was
  never moved with it.

  Nothing could have caught that. `request<T>()` takes `T` from the call site, so a declared return
  type is compared against nothing; the SDK's existing ratchets drive requests and mirror schemas,
  and neither reads a method's response type. It failed in the consumer instead, silently: the
  CLI's `const { models } = await client.models.list()` read a key that does not exist, so
  `nexus model list --json` printed `{}` for 45 models — indistinguishable from an empty account —
  and the table path threw `Cannot read properties of undefined (reading 'length')`.

  If you destructured, take the array directly:

  ```ts
  const models = await client.models.list();
  ```

## 0.14.1

### Patch Changes

- e44f330: The SDK now replays a transient edge failure on an idempotent request, and never on a POST.

  A request that is in flight when staging finishes a rolling deploy comes back `502` with an
  HTML body, so `JSON.parse` fails and the caller gets
  `API error (502): Failed to parse response body (status 502)`. Nothing retried: `HttpClient`
  had no retry policy at all, so a single 502 from the proxy in front of the API failed the
  whole call. A real user hitting a deploy saw the same thing.

  `GET`, `HEAD`, `OPTIONS`, `PUT` and `DELETE` are now replayed up to twice on `502`, `503`,
  `504`, and on a dropped connection, with full-jitter exponential backoff (250 ms base,
  doubling, capped at 5 s). `maxRetries: 0` turns it off.

  **`POST` and `PATCH` are deliberately never replayed.** A 502 from a proxy cannot distinguish
  "no healthy upstream, never forwarded" from "applied, and the connection died before the
  response". Replaying a POST on the second reading duplicates its effect —
  `POST /emulator/:deploymentId/sessions/:sessionId/messages` writes a message and starts an
  agent turn, so an automatic retry would post a user's message twice and bill two model calls.
  A POST that needs to survive this needs an idempotency key on the wire, which this API does
  not have.

  A client-side timeout is not retried either, even though it is a connection error: the caller
  stated a deadline, and unlike a 502 the server may still be processing the request.

  A discarded `502` has its body cancelled before the next attempt — Node pins the connection in
  the undici pool until a body is consumed or cancelled, so dropping the response object would
  leak one socket per retry.

## 0.14.0

### Minor Changes

- 67920d3: A Role's task list and its duty ticks are writable over the Public API v1.

  Three routes ship with SDK methods and CLI commands: `replaceTasks`
  (`nexus role set-tasks`), `listTaskDuties` (`nexus role task-duties`) and
  `replaceTaskDuties` (`nexus role set-task-duties`).

  Send each task's `id` back on a replace. A named task is updated in place and
  keeps its id; one without an id is created; one the body omits is deleted. The id
  is what keeps that task's ticked duties attached, and dropping it still answers
  success.

## 0.13.0

### Minor Changes

- a966eaa: `RoleCoverage` gains `grantedSystems: { collections, workspaces }`, and its docblock stops
  promising a completeness the response never had.

  A Role holds systems through three placement tables. `contributions` and `unmodelledSystems`
  are both derived from `RoleResource` rows alone, so a Collection or a Workspace reaching the
  Role through a grant appeared in neither — while the Roles index counts all three tables under
  the word _systems_. The type's own guidance said the opposite: _"Every attached system appears
  in exactly one of the two arrays."_ That was true when `RoleResource` was the only placement
  table anyone read and became false when the index started counting grants.

  `grantedSystems` is the population the two arrays structurally cannot carry.
  `RoleSystemImpact.roleResourceId` is a `@unique` foreign key onto `RoleResource`, so a grant is
  not _unmodelled yet_ — no impact model can ever point at one. Counts rather than identities,
  because the field's job is to let a caller state what its own total excludes.

  Both numbers come from reads issued on the same request as the coverage figures, so `0` is a
  measurement and never "nobody looked".

  A minor rather than a patch: the response type gains a required property, so a caller
  constructing a `RoleCoverage` literal must supply it.

### Patch Changes

- 5b496f2: Correct what the SDK says about a task assignment's identity.

  The types said an assignment's id "is not durable" and told a caller never to
  store one. There is no assignment id on this contract to store: the ARM OBJECT is
  the identity — `{ kind: "person", userId }` or
  `{ kind: "resource", resourceType, resourceId }`. Comment-only; no shape changes.

## 0.12.0

### Minor Changes

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

- b0418e1: Drop `role.transfer_ownership` from the `RoleCapability` union.

  The value named no ability. No route on the internal API or on public v1 ever
  evaluated it, so a permission set holding it granted nothing. Handing
  `Role.ownerUserId` to somebody else is authorised by identity — the Role's current
  owner, or an organisation admin — which no permission set can satisfy, so the
  capability was unsatisfiable by construction rather than merely unwired.

  A minor rather than a patch because the union is exported: code that spelled the
  literal stops compiling. Nothing it did changes, because it did nothing — the
  literal was only ever accepted, never acted on.

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
