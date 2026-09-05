# @agent-nexus/sdk

## 3.1.0
### Minor Changes

- 8335b08: A prompt can branch without ever rewriting history
  
  Prompt versions were one flat lineage per agent: iterating on a rewrite meant
  editing the live draft, and comparing two candidate prompts meant keeping them
  in files outside the platform. Phase 1 of the Prompt Lab rework makes
  `AgentPromptVersion` branch-based: every agent has exactly one **Main** variant
  (the production lineage — the name is reserved) plus named variants that fork
  from any version and iterate independently. There is no merge and no rebase,
  deliberately: a variant reaches Main only through **promote**, which appends a
  NEW Main version recording `promotedFromVersionId`. Nothing is ever rewritten
  and archiving deletes nothing.
  
  ## `@agent-nexus/sdk`
  
  **`client.promptVariants`** — `list`, `create` (fork; default source = Main
  tip), `fork`, `rename`, `archive`, `saveVersion`, `listVersions`, `promote`,
  `graph`, `compare`. Variant refs accept an id, a name (case-insensitive), or
  `"main"`; compare refs additionally accept a bare version id.
  
  ## `@agent-nexus/cli`
  
  **`nexus prompt`** — `variant list|create|rename|archive`, `save`, `history`,
  `promote`, `compare`, `graph`. A save NEVER publishes; going live is
  `nexus prompt promote --variant <name> --publish` and nothing else.
  
  ## Existing behavior, unchanged
  
  The `agents/:agentId/versions` routes and `agent update --prompt` keep working
  exactly as before — their writes now land on the Main variant, with ordinals
  allocated under a variant row lock. Pre-existing versions were backfilled onto
  each agent's Main in `createdAt` order by the migration.
- 543bec5: Task ready answers two questions instead of one
  
  `tracks task ready` used to return one flat list, and every caller that took its
  `.length` was answering a question nobody asked. The rows in it were unblocked —
  which is not the same as workable. One board reported **29 ready** over a set in
  which 23 needed a human decision and 6 could actually be picked up.
  
  The response now splits on whose turn it is. `ready` holds the rows an agent may
  take right now — unblocked AND `nextOwner: "CUE"` — and it is the only array
  whose length answers "how much can be worked on". `waiting` holds the rows that
  are unblocked and somebody else's turn, and it is printed only when it has rows.
  `tasks` stays on the wire as a deprecated union of the two, so a client built
  against the previous shape keeps working; the SDK's own result type does not
  carry it, so no call site inside this repo can drift back onto the sum.
  
  **A waiting row is not blocked.** Every blocker on it is satisfied — it is absent
  from `ready` because it is not your turn, not because anything is holding it. So
  `tracks task why-not-ready` will not explain one, and should not: that command
  answers the blocker axis and this is the owner axis.
  
  `nextOwner` is `CUE` (an agent may proceed), `USER` (a person has to act) or
  `EVENT` (something outside has to happen first). It is not the banner, not who
  ticked the task, and not a permission — it grants and refuses nothing.
  
  **`tracks plan import` is the only door it arrives through**, because that is the
  only way a task row is born: there is no single-task create and no task update on
  either surface. A plan naming no owner imports every row as `CUE`, which is what
  every row meant before the field existed, so nothing changes for a plan you
  already have. Like `kind`, an owner does NOT propagate to children — a `USER`
  parent whose sub-steps are ordinary agent work is the common shape, and
  inheriting would park that whole subtree on somebody who was only asked about the
  parent.
- 11b9954: BREAKING: the conversation-eval surface is deleted — `nexus agent-eval` and `client.agentEvals` are gone
  
  The Agent Conversation Evaluation system ("system B") has been torn out of the
  platform entirely: its 263-file backend module, all 33 `/public/v1/agent-evals/*`
  routes, the `conversation_evals:*` scopes, its frontend module and its 11 tables.
  The server no longer answers anything these clients could call, so both client
  surfaces go in the same release rather than serving a deprecation cycle against a
  dead API:
  
  - **CLI:** the whole `agent-eval` namespace — `agent-eval run create`,
    `agent-eval run list`, `agent-eval run get`, `agent-eval run results`,
    `agent-eval run transcript`, `agent-eval run compare`, `agent-eval run execute`,
    `agent-eval run abort`, `agent-eval run delete`, `agent-eval batch create`,
    `agent-eval batch get`, `agent-eval batch list`, `agent-eval template create`,
    `agent-eval template get`, `agent-eval template list`,
    `agent-eval template importable`, `agent-eval template update`,
    `agent-eval template clone`, `agent-eval template attach`,
    `agent-eval template detach`, `agent-eval template delete`,
    `agent-eval schedule create`, `agent-eval schedule list`,
    `agent-eval schedule update`, `agent-eval schedule pause`,
    `agent-eval schedule resume`, `agent-eval schedule delete`,
    `agent-eval trigger upsert`, `agent-eval trigger list`,
    `agent-eval trigger delete`, `agent-eval webhook upsert`,
    `agent-eval webhook get`, `agent-eval webhook delete`. A script running any of
    them now gets commander's unknown-command error; before this release it got a
    `404` from the server.
  - **SDK:** the `client.agentEvals` resource and every `ConversationEval*` type.
  
  This removal did NOT serve the two-release deprecation cycle COMPATIBILITY.md
  promises for STABLE commands — it cannot: the routes the warnings would have
  pointed at were deleted in the same change, by a locked product decision
  (prompt-eval-rework-spec.md, "Teardown of system B"). The 33 baseline rows were
  removed by hand in the same commit, in the open, which COMPATIBILITY.md names as
  the visible form of this act. A replacement evaluation system (prompt variants +
  golden conversations, under `nexus prompt` / `nexus eval`) ships in the
  following releases.

### Patch Changes

- 2af4940: The published types are one file per module, and the duplicate `.d.mts` copy is gone
  
  The shape of `dist/` in the published tarball changes. Nothing you import changes
  with it — this is the same API, emitted differently and shipped smaller.
  
  **`dist/index.d.ts` was one rolled-up file and is now a tree.** On
  `@agent-nexus/sdk` a single 741,380-byte declaration becomes 112 declarations
  mirroring `src/`, so `dist/` goes from 4 files to 114. On
  `@agent-nexus/mcp-server` three rolled-up declarations become 9, and `dist/` goes
  from 12 files to 15. The entry point is unchanged in both: `exports["."].types`
  still names `./dist/index.d.ts`, and that file still exists.
  
  **`dist/index.d.mts` no longer ships, and nothing ever read it.** It was a
  byte-for-byte duplicate of `index.d.ts` — both 741,380 bytes on the SDK — emitted
  only because the bundler wrote one declaration per output format. No resolver
  reached it: the `types` condition in `exports` is unconditional and listed first,
  so it answers `import` and `require` alike, and it names `index.d.ts`. Dropping
  the copy takes **708,166 bytes** off an SDK install, about 30% of `dist/`.
  
  **Your types are the same types.** The SDK's entry point exports **908** names
  before and after, and the two sets are identical in both directions. Resolution
  was checked from a consumer's side rather than argued: a project importing
  `NexusClient`, `NexusClientOptions` and a list method typechecks with **0 errors**
  against both the old and the new output, under `moduleResolution` `bundler`,
  `node16` and `node10`, with `skipLibCheck` off so that a declaration that failed
  to resolve its own neighbours would be reported. Importing a name the package does
  not export fails in all six of those runs, which is what makes the zeros mean
  something.
  
  **Your JavaScript is the same bytes.** `dist/index.js` and `dist/index.mjs` are
  sha256-identical either side of this change on both packages, as are the
  `mcp-server` `cli.js` and `stdio.js` bundles and the shebang on the `nexus-mcp`
  binary. Only declaration emission moved.
  
  **What you gain besides the smaller install:** go-to-definition now lands in the
  module that declares the symbol instead of at a line number inside one enormous
  file, and an editor no longer parses three quarters of a megabyte to answer a
  hover.
  
  **The one way to be affected** is a deep import of `@agent-nexus/sdk/dist/index.d.mts`
  by path. The `exports` map never offered that path, so an exports-aware resolver
  could not have reached it; if you reference it directly, point at
  `dist/index.d.ts`.
  
  **A new guarantee comes with the split.** `@nexus/types` is a private package and
  one of the SDK's development dependencies. A single rolled-up declaration inlined
  everything and could not name it; per-file declarations can, and a declaration
  naming a package that is not on the registry is broken for everyone who installs
  this one. The SDK build now reads its own emitted output and requires every module
  specifier in it to be relative, a Node builtin, or a package this manifest
  declares as a runtime dependency — 323 specifiers across 114 files on this
  release, all resolvable. A build that would ship an unresolvable one fails instead.

## 3.0.0
### Major Changes

- 09c0fad: A page says when the server said nothing about further pages
  
  ⚠️ **Breaking for every consumer of a list method.** `PaginationMeta.hasMore`
  (`boolean`) is replaced by `PaginationMeta.paging`, a
  `"has-more" | "exhausted" | "did-not-say"`. `meta.total` and `meta.page` become
  optional. `withDerivedHasMore` is replaced by `normalizePagingMeta`.
  
  🔴 **`requestPage` invented pagination metadata whenever the server sent none**,
  and it invented it in three directions at once:
  
  ```ts
  return { data, meta: { total: data.length, page: 1, hasMore: false } };
  ```
  
  `total` became the PAGE SIZE wearing a population's name. `page` claimed to be
  the first page on a payload that named no page. And `hasMore: false` told a
  caller the walk was finished when the server had merely declined to say.
  
  **The third one is the expensive one, because it terminates a loop.** A paging
  loop reading `hasMore` stops on page one and the caller reads a truncated
  collection as a complete one. Nothing in the payload distinguishes that from a
  genuinely complete first page — the rows are identical, the meta is
  well-formed, and no error is raised anywhere.
  
  **Absence is now a state, not a value.** A server that publishes nothing
  produces `{ paging: "did-not-say" }` — no total, no page, nothing derived from
  the page the SDK happens to be holding. The rows are still returned in full: the
  data was never in doubt, only its position in a larger set.
  
  **Why a three-valued union rather than an optional boolean.** `hasMore?: boolean`
  would reinstate the bug on the first edit: `meta.hasMore ?? false` compiles,
  reads as prudence, and collapses the third state back into the second with
  nothing to catch it. A union cannot be collapsed without naming
  `"did-not-say"`, and `Record<PagingState, T>` gives exhaustiveness for free.
  The field is RENAMED rather than retyped so that every existing read fails at
  compile time — a string is always truthy, so leaving the name `hasMore` would
  have turned `if (meta.hasMore)` into a silent always-true.
  
  **Inference is unchanged where the payload supports one.** A served `hasMore` is
  authoritative and passes through untouched; `page < totalPages` and
  `page * limit < total` are still derived. Only the case where the payload
  supports NO conclusion changed, and it changed from a guess to a report.
  
  **Migration.**
  
  ```ts
  // before
  let hasMore = true;
  while (hasMore) {
    const res = await client.agents.list({ page, limit: 50 });
    hasMore = res.meta.hasMore;
    page++;
  }
  
  // after — stop on "exhausted"; "did-not-say" is not a stop condition
  for (;;) {
    const res = await client.agents.list({ page, limit: 50 });
    if (res.meta.paging === "exhausted" || res.data.length === 0) break;
    page++;
  }
  ```
  
  Reading a count: `meta.total` may be absent, and absent means unknown. It never
  means zero, and it never means `data.length`.
  
  **Three resources inlined a copy of the helper's body rather than calling it**,
  so repairing the helper alone would have left them fabricating meta after the
  fix. `assets.list`, `credentials.list` and `tickets.list` now route through
  `requestPage`; `tickets.listAcrossOrganizations` returns its pagination as a
  `meta` object instead of three fabricated top-level fields.
  
  **CLI.** `--json` list output carries `meta.paging` in place of `meta.hasMore`.
  The table footer now PRINTS when a route published no paging counters — an
  operator who sees no footer reads the table as the complete set, so a silence
  that used to mean "we do not know" had to stop looking like "that is all of it".

### Minor Changes

- 49f7049: A browser can keep its conversation across a stale token
  
  `client.chat.refresh(deploymentId, auth)` exchanges a session token for a
  successor addressing the SAME conversation. It authenticates with the SESSION
  TOKEN and sends no api-key, so a browser holding nothing else can call it —
  which is the whole point. `createBrowserChatClient` exposes it alongside
  `stream()`, `resume()`, `stop()` and `status()`.
  
  Without it, a visitor who read an answer, switched tabs and came back was
  handed a brand new session addressing an empty chat, and their exchange with
  the agent was silently gone. The only way to keep a conversation alive was
  `createSession`, which needs the org API key and therefore a server — so a
  purely client-side embed could not do it at all.
  
  **A token may be exchanged ONCE.** A second presentation of the same token is a
  fork — two holders of one credential — and is refused. Keep the successor and
  discard the token you sent.
  
  **This is the only chat route that accepts an EXPIRED token**, because a browser
  learns its token is stale by being refused rather than by watching a clock. So
  a 401 from a chat route now means that TOKEN is finished, not that the session
  is: call `refresh()` before asking your own server for a fresh mint.
  
  What it does not extend is the session's absolute ceiling. The renewal deadline
  is carried forward to the successor, so twelve hours from the FIRST mint is a
  wall no number of refreshes moves. When that deadline passes, `refresh()` is
  refused too and `createSession` is the only way back — that refusal is the
  signal to mint, and it is the one case where a server is still required.
  
  There is no request body, deliberately: the conversation is the token's own
  claim. A `chatId` here would let a stranger holding a leaked conversation id
  append to somebody else's chat.
- 460397c: A system can be taken live without touching its model, and that alone moves the Role's coverage
  
  `client.roles.transitionSystemLifecycle()` moves one of a Role's systems between
  `"BUILDING"`, `"LIVE"` and `"RETIRED"`. The CLI verb is
  `nexus role set-system-lifecycle`.
  
  ```ts
  const moved = await client.roles.transitionSystemLifecycle(roleId, roleResourceId, {
    lifecycle: "LIVE"
  });
  
  moved.roleResourceId; // the attachment that moved
  moved.lifecycle; // "LIVE"
  ```
  
  ```bash
  nexus role set-system-lifecycle <role> <system> LIVE
  ```
  
  ## It moves a published figure in both directions, and the result reports neither
  
  Only `LIVE` systems are summed into a Role's coverage numerator and money totals.
  Moving a system **into** `LIVE` adds its person-hours, revenue and cost; moving one
  **out** of `LIVE` — for `BUILDING` or for `RETIRED` — removes all three. No model is
  touched either way.
  
  🚨 **THE PER-SYSTEM ROWS DO NOT CHANGE WHEN THIS CALL SUCCEEDS.** The system keeps
  publishing the same `personHours` on its own row whatever bucket it is in, so a UI
  rendering that list sees nothing move while the Role's headline has. The result
  payload deliberately carries no coverage figure — a stale numerator in a response is
  an invitation to re-render from the wrong number.
  
  `roles.coverage(roleId)` is the read that says by how much, and it needs
  `role_coverage:read`. **This write is `roles:write`, which does not imply it** — a key
  scoped only to write can make the change and cannot read its effect.
  
  ## `LIVE` is reachable only from `BUILDING`, so un-retiring is two calls
  
  `RETIRED -> LIVE` is refused with a 400. To bring a retired system back:
  
  ```ts
  await client.roles.transitionSystemLifecycle(roleId, systemId, { lifecycle: "BUILDING" });
  await client.roles.transitionSystemLifecycle(roleId, systemId, { lifecycle: "LIVE" });
  ```
  
  The rule is not ceremony. The move **into** `BUILDING` is the only thing that records a
  submitter, and an approval is checked against that submitter — so a direct
  `RETIRED -> LIVE` edge would put rows live with no submitter or a stale one, and the
  review requirement below would have to fail open or fail closed for exactly those rows.
  
  ⚠️ **Asking for the state the system is already in is a 409, not a silent success.**
  Retry logic that treats "already there" as idempotent will surface an error where it
  expects a no-op. The refusal is deliberate: the alternative is silently re-stamping the
  approver.
  
  ## Under `requireReview`, the approver must not be the submitter
  
  When the Role's system policy sets `requireReview`, this call is made as **the API
  key's owner**. A key whose owner submitted the system cannot approve it, and no retry
  helps — it is the same identity every time. Separate the keys, or have a different
  person's key make the call.
  
  A system with **no** recorded submitter cannot satisfy the requirement either. Retire it
  and submit it again, which records one.
  
  ## `roleResourceId` is the attachment, not the system
  
  The second argument is the `RoleResource` UUID — the row that attaches a system to a
  Role — not the agent's or workflow's own id. Read it off `roles.resources(roleId)` or
  off the coverage view. Passing the underlying resource's id is the easy mistake here and
  it does not resolve.
  
  ## Types
  
  `RoleSystemLifecycleBody` and `RoleSystemLifecycleResult` are exported, both reusing the
  existing `RoleResourceLifecycle`.
  
  They are new interfaces, so **nothing you already construct gains a required field** —
  fixtures, mocks and stubs of the existing Role types are unaffected by this release.
- f261b20: A `nexusApi` node can name the agent-memory family
  
  `NexusApiCategory` gains `"memory"`. That union types
  `NexusApiActionCatalog.categories[].category` — the catalog served on the
  `nexusApi` node type — so a client reading that catalog now has a name for a
  family it was already going to be handed, instead of a category it could render
  and not type.
  
  The family is labelled `Agent Memory` and carries two actions:
  
  - **`memory.get`** reads every stored entry for one subject. Reading a subject
    nothing has ever been written for is not an error — it answers `exists: false`
    with an empty `values` and `storedMemoryBytes: 0`.
  - **`memory.set`** stores one entry. The key must already be declared on the
    organisation's active memory schema for that scope, and a subject's entries are
    charged `key + value + 4` bytes each against an 8000-byte cap.
  
  ⚠️ **`values` is open on purpose, and everything beside it is a typed leaf.** The
  keys inside it are whatever the organisation's own memory schema declares —
  per-org, per-scope and versioned — so the catalog declares the envelope and no
  properties within it. `scope`, `subjectId`, `exists`, `entryCount` and
  `storedMemoryBytes` are declared and named.
  
  ⚠️ **The union widened, so an exhaustive `switch` over `NexusApiCategory` stops
  being exhaustive.** No existing member moved and nothing changes at runtime; the
  compiler is pointing at the one place the set is asserted rather than read.
- 52ed7dd: `tickets.list()` types `meta.total` as optional, because it can be unknown
  
  ⚠️ **Breaking for TypeScript consumers of `tickets.list()`.** It returns
  `TicketListPage` instead of `PageResponse<TicketSummary>`, and on that type
  `meta.total` and `meta.totalPages` are optional. Code that reads `meta.total` as a
  number now needs to handle its absence.
  
  🔴 **The breaking change already happened; this is the type catching up.** The
  route began omitting `total` when it stopped publishing a bounded count as an
  exact one. A consumer reading `meta.total` was already getting `undefined` at
  runtime — it was merely typed as a `number`, so arithmetic on it produced `NaN`
  and rendering it produced nothing, with no type error to warn anyone. The choice
  was to make the type honest or to make the runtime dishonest again.
  
  **Why absence rather than a number plus a flag.** A caller who ignores a
  `totalIsExact` flag gets a wrong number that looks exactly like a right one —
  silently, and only for the organisations large enough to hit the bound, which are
  the ones who notice least and matter most. A caller who ignores an absent field
  gets a compile error or `undefined`. Absence cannot be silently misread as a
  number; a wrong number can be silently misread as a right one.
  
  **Why not the shared `PaginationMeta`.** Around twenty other paginated endpoints
  always supply a total. Widening the shared type would make all of their consumers
  handle an absence they will never see, and a type that says "this might be
  missing" where it never is trains readers to ignore the warning.
  
  **`meta.hasMore` is always present and is what to page on.** It reports
  reachability — whether a further page will return rows — so it terminates. It
  previously stayed `true` on every page once the upstream fetch was bounded,
  including empty pages past the bound, so a loop over `hasMore` never ended.

### Patch Changes

- e6b002c: A transcript row's `agentName` is documented as a background agent's name
  
  No behaviour change — the field, its type and its null case are untouched. What
  changes is the sentence a caller reads on it, which called the sender a
  _teammate_.
  
  That word named a distinct kind of agent this platform never produced. Under a
  headless runner no team forms and no teammate spawns, so a reader meeting it went
  looking for the thing that made a teammate different from a background agent and
  found nothing. The runner's own vocabulary retired the word; this doc comment was
  one of the surfaces still speaking it, and it is the one published to SDK
  consumers — it reaches the generated declarations, so it is what an editor shows
  on hover.
  
  `agentName` still holds the display name of the background agent a row is
  attributed to, and is still null on a lead-composed row.
- 52ed7dd: `conversations.search()` accepts a `limit`, and says that it is bounded
  
  The search was capped at 50 results with no parameter to change it and nothing in
  the response to say a cut had happened. A query matching four thousand
  conversations returned fifty, and fifty was indistinguishable from a complete
  answer.
  
  **`SearchConversationsParams` now takes `limit`** — 1 to 100, defaulting to 50, so
  an existing caller sees exactly what it saw before.
  
  ⚠️ **`search()` still cannot tell you when it cut.** The HTTP response carries
  `meta.hasMore`, but this method returns `data` only, so a result of exactly
  `limit` items may be a truncated page and looks identical to a complete one.
  Until the method returns that flag, treat a full page as possibly incomplete:
  raise `limit`, or narrow the query. `getMessages()` returns `hasMore` because its
  result type carries it; `search()` returning a bare array cannot gain the field
  without a breaking change.
- d1ad304: The tool-connect request bodies are checked against the schema that validates them
  
  `ConnectToolOAuthBody` and `ConnectToolHttpBody` are hand-written in this package
  and the CLI's request literal is typechecked against them. Nothing compared them
  to `ConnectToolBodySchema` — the schema the handler actually validates the body
  with — so the chain contract → SDK → CLI stopped one link short of the server.
  Renaming a field on the contract side left every consumer compiling perfectly
  and shipping a body that can only 400 (NEX-3535).
  
  Three pairs join the drift gate in `types-match-the-v1-contract.test.ts`: the two
  arms and the union over them, each against the schema's `_input`, because a
  request body is what a caller SENDS. Proven by mutation rather than by reading —
  renaming `service` to `serviceName` upstream takes the OAuth pair and the union
  pair to `TS2344` and leaves the HTTP pair green.
  
  No runtime behaviour changes; this is a compile-time gate.
- d8661f4: The workflow wire types cite the gate that exists
  
  `types/workflows.ts` told anyone reading it that
  `workflows-wire-types.conformance.ts` was what kept these declarations honest
  against the server. No file by that name exists, so a reader who checked found
  nothing and had to conclude the declarations were unheld.
  
  They are held — by `workflow-types-match-the-v1-contract.test.ts`, whose
  assertions fail `tsc` the moment a declaration here stops matching the v1 schema
  the server validates its own responses against. The doc comments now name that
  file, the table inside it that lists every gated pair, and the table that names
  what it deliberately cannot reach.
  
  Comments only. No type changes, and `NexusApiCategory` gains no member.

## 2.1.0
### Minor Changes

- 7d3ffa2: A board can ask which tracks are waiting on a human
  
  `GET /tracks` narrowed on `status` and `archived` and nothing else, so a "waiting
  on me" panel had to fetch a page and filter it in the browser. A page is at most
  200 rows. On any organization past that, the panel filtered one page of a longer
  list and under-reported — and it under-reported as **"nobody is waiting on you"**,
  which is the one wrong answer nobody questions. That screen could not be built
  honestly from the client, which is why this is a contract change rather than a
  component.
  
  ## `@agent-nexus/sdk`
  
  **`tracks.list()` takes `nextOwner`.** One value out of `CUE`, `USER` and
  `EVENT`; every owner when omitted, exactly as `status` behaves.
  
  It narrows the SQL, so `total` counts the whole filtered set rather than the page.
  `list({ nextOwner: "USER", limit: 1 })` is therefore a one-request count for a
  badge, with no paging at all.
  
  **It names a KIND of actor, never a person.** `Track.nextOwner` says whether a
  human, Cue, or an external event is due next. `nextOwner: "USER"` is "waiting on a
  human" across the whole organization — it is not "waiting on you", and this API
  has no per-user narrowing anywhere. A UI that labels it "mine" is labelling it
  wrongly.
  
  **The column is `NOT NULL`**, so there is no unowned row for the filter to have an
  opinion about. Every track matches exactly one of the three values.
  
  ## 🔴 Cursors issued before this upgrade are refused
  
  The page cursor carries a fingerprint of the filter set it was issued under, so
  that replaying a `status=PLANNED` cursor into a `status=DONE` request is refused
  rather than served the middle of a different list. `nextOwner` joins that
  fingerprint, which means **the fingerprint gained a segment and every cursor
  already in flight no longer parses.** They come back as a 400 naming a malformed
  cursor.
  
  That is the correct outcome and not a cost being worked around: a token minted
  before this filter existed carries no statement about it, so honouring it would
  resume a walk under a filter set it was never a position in — the exact
  plausible-wrong-page the fingerprint exists to refuse.
  
  **What to do:** drop the cursor and read from the top. Nothing else is affected —
  a caller that pages within one process, which is every caller the SDK shape
  encourages, never sees this. Cursors are server-issued and their shape has never
  been part of the promise; keep round-tripping `nextCursor` verbatim and never
  build one.
  
  ## `@agent-nexus/cli`
  
  **`nexus tracks list --next-owner <CUE|USER|EVENT>`.**
  
  It filters the same column the `WAITING ON` column already prints, so what the
  table shows and what the flag selects cannot disagree. `--help` states that it
  names a kind of actor rather than a person.
  
  ```
  $ nexus tracks list --next-owner USER
  $ nexus tracks list --next-owner USER --status IN_PROGRESS
  ```
- 43b0468: A covered system says whether it is live, and coverage counts only the live ones
  
  `client.roles.getCoverage(roleId)` now reports a `lifecycle` on every row —
  `"BUILDING"`, `"LIVE"` or `"RETIRED"` — and a new
  `impactPersonHoursByLifecycle` split beside the headline numerator.
  
  ```ts
  const coverage = await client.roles.getCoverage(roleId);
  
  coverage.impactPersonHours;                     // LIVE only
  coverage.impactPersonHoursByLifecycle;          // { BUILDING, LIVE, RETIRED }
  coverage.contributions[0].lifecycle;            // which bucket that row is in
  ```
  
  ## The headline changed meaning, and reading it the old way now overstates
  
  `impactPersonHours` is the sum of the contributions that evaluated **and are
  `LIVE`**. A system somebody is still building publishes a real `personHours` on
  its own row and is deliberately outside the total: it is work the customer is
  not yet receiving, and a headline that counted it would report a saving that has
  not happened. `coverage` is computed from that same live numerator.
  
  🚨 **SUMMING `contributions[].personHours` NO LONGER GIVES `impactPersonHours`.**
  It never errors — it just reads high by exactly the building and retired rows.
  Read `impactPersonHoursByLifecycle`, which is the same split already done:
  `impactPersonHoursByLifecycle.LIVE === impactPersonHours`, by construction.
  
  ## `unmodelledSystems` carries it too, and that is the counter-intuitive half
  
  A system can be `BUILDING` **and** unmodelled at the same time — the ordinary
  state of something just started. So a count of "what is being built" taken from
  `contributions` alone undercounts by exactly those rows.
  
  ## There is no `PROPOSED`
  
  A covered system names a system that already exists, so "a proposed system that
  exists" is a contradiction. The thing that is proposed and names nothing yet is
  a Role task.
  
  ## `lifecycle` says nothing about `basis`
  
  A live hand-estimated system is an estimate; one still being built whose volumes
  were measured is measured. Going live changes the bucket, never the basis.
  
  ## Types
  
  `RoleResourceLifecycle` is exported. `lifecycle` is required on
  `RoleCoverageContribution` and `UnmodelledRoleSystem`, and
  `impactPersonHoursByLifecycle` is required on `RoleCoverage` with all three
  buckets always present — a zero there is a measurement, never a missing key.
  
  ⚠️ **If you CONSTRUCT any of those types — a fixture, a mock, a stub response —
  they now need the new fields.** Reading one is unaffected.
- fb17a22: A ready page says whether it was truncated
  
  `tracks.listReady()` and `tracks.listReadyTasks()` answered with a page and nothing
  else, so a truncated page and a complete answer were the same response. A caller
  reading 50 rows could not tell 50 from 165, and the rows that went missing were not
  arbitrary: both statements order by ascending `number`, and a newly created row takes
  the highest number, so the dropped rows were always the NEWEST ones — the ones a board
  is most likely to be waiting on.
  
  **`ListReadyTracksResponse` and `ListReadyTrackTasksResponse` both carry `hasMore`.**
  
  `true` means the ready set is larger than the page you received. The page defaults to
  50 and is capped at 200. Truncation is reachable on the task route today — one track
  can hold 165 ready tasks against a default page of 50 — and latent on the track route.
  
  **There is deliberately no `total` and no `nextCursor` on these two responses.** Raise
  `limit` and re-read from the top; `tracks.list()` is the paged surface when a caller
  needs to walk a set. A keyset cursor would be wrong here rather than merely absent:
  readiness is re-derived on every request, so a task that becomes ready after a cursor
  was issued sits above that cursor and the next page excludes it — it is never offered
  again. `hasMore` points at the one action that stays self-consistent.
  
  Nothing breaks. `hasMore` is an addition to two responses; a caller that ignores it
  keeps its current behaviour, including the page ceiling it already had.
- c661666: A section carries its prose, and a task carries its position
  
  Two columns that have been writable since the tracks domain shipped were
  returned by no route on either surface, so a client could write them and never
  read them back. Both are now on the response types.
  
  ## `TrackSection.body`
  
  **Without it a section tree is an outline and never a document.**
  `client.tracks.createSection()` has always accepted `body`, and nothing has ever
  given it back — so a caller could not check what it had stored, and a surface
  rendering the tree could show every title and none of the content underneath.
  
  ⚠️ It is **never `null`**. The column is NOT NULL with an empty-string default,
  so "nobody wrote any" is `""`. A consumer branching on `null` is branching on a
  value this API does not produce.
  
  ## `TrackTask.position`
  
  **It is the only thing that orders a plan**, and without it a client renders the
  steps in whatever sequence the response happened to arrive in — silently, and
  plausibly, because a wrong order still looks like a plan.
  `@@unique([trackId, parentTaskId, position])` is what makes it total.
  
  ⚠️ It is unique **per parent**, not per track. Two tasks under different parents
  legitimately share a position, so sorting a flat list by this column alone
  interleaves the branches. Group by `parentTaskId` first.
  
  ## What changes for a caller
  
  Nothing breaks. Both fields are additive on response types only; no request
  shape moved, no field was removed or made optional, and no route changed its
  status code. A caller that ignores both fields behaves exactly as before.
  
  TypeScript consumers constructing a `TrackSection` or a `TrackTask` literal by
  hand — a test fixture, a mock — will need the new field, which is the compiler
  pointing at the one place the shape is asserted rather than read.
- 28e4c69: A task says what it is, and a board can be read whole
  
  Two things landed together because they are the same complaint: a track's plan
  could be worked and never READ, and the rows it held could not say which of them
  were work.
  
  ## `client.tracks.listTasks(trackId)` · `nexus tracks task list <trackId>`
  
  The only route that enumerates a track's tasks. Before it, `listReadyTasks()`
  answered what was unblocked and `readTask()` needed an id you already held, so a
  board could not be reviewed, audited or drawn. On one live track of 136 rows the
  ready set showed 107 and nothing reached the other 29.
  
  ⚠️ **NOT PAGED, and there is no `limit`.** The tree only means anything whole:
  `parentTaskId` has to resolve inside the answer, and `position` is unique per
  PARENT rather than per track, so a page hands you a forest of orphans in an
  order you cannot restore. Rows arrive grouped by `parentTaskId`, then by
  `position` — sorting the flat array by `position` alone interleaves the
  branches.
  
  ⚠️ **A track in another organization answers an EMPTY LIST, not a refusal** —
  the same call `readRollup()` makes by answering `0/0`. An empty answer is not
  proof the track exists.
  
  ## `TrackTask.kind` — `STEP` · `DECISION` · `DEFINITION`
  
  A closed vocabulary saying what a row IS. `STEP` is real work. `DECISION` is a
  choice recorded on the board. `DEFINITION` is a definition, rule, axis or
  constraint.
  
  🔴 **THE ROLL-UP NOW COUNTS `STEP` LEAVES AND NOTHING ELSE.** `TrackRollup.done`
  and `.total` are a narrower number than they were, and `TrackRollup.byKind` is
  the whole task set partitioned so you can see exactly what they left out. Every
  key is always present, `0` included.
  
  **No existing number moves on its own.** The column is `NOT NULL DEFAULT 'STEP'`,
  `TrackPlanNode.kind` defaults to `STEP`, and every row written before the field
  existed reads `STEP` — so `done`/`total` change only for a plan somebody
  deliberately reclassifies. Nothing in this release rewrites a row.
  
  ⚠️ **A `STEP` whose only children are content is a LEAF, not structure.** The
  work tree is the `STEP` tree, so filing a rule under a step does not make that
  step vanish from the denominator.
  
  ⚠️ **A `DECISION` or a `DEFINITION` is never in the ready set** — it cannot be
  picked up. It can still BLOCK: an unticked content row somebody drew an edge
  from holds its dependents exactly as a step would, because dropping it would
  release work rather than merely show less.
  
  **Say what an entry is at the import.** `tracks plan import` is the only door a
  task row is born through, so `kind` on a `TrackPlanNode` is the only place it
  can be declared. It does not propagate to `children`: a `DEFINITION` under a
  `STEP` is the ordinary shape, so each node declares its own. A plan that names
  no kinds is a plan of steps, which is the behaviour this field exists to let you
  opt out of.
  
  `nexus tracks rollup` now prints `steps`, `decisions` and `definitions` beside
  `done` and `total`, and `nexus tracks task list` carries a `KIND` column.
- 23cf88d: A task says when it joined the plan, and the roll-up help stops promising `0/0`
  
  ## What changes for a caller
  
  `TrackTask` carries `createdAt` (ISO-8601), so `client.tracks.readTask(taskId)`
  and every task list now report when a row joined the plan. It is required on the
  response, and the generated response contract lists it in `required` for
  `GET /tracks/tasks/:taskId`.
  
  That is the field a reader needs to explain a denominator that moved. A roll-up
  is a snapshot, so a plan that GREW while work was being done reads as work going
  backwards — `5/20 → 6/20 → 6/36 → 9/136` is three tasks closed and 116 added, and
  every one of those numbers was correct while the board looked frozen. With
  `createdAt` beside `doneAt`, "closed in this window" and "added in this window"
  are both a filter over the plan you already hold, and neither is a new number
  anybody has to keep honest.
  
  It is the ROW's birth, not the plan's: a plan imported in one call gives every
  task the same instant, so it separates added-later from added-at-import and
  cannot order what arrived together.
  
  ## CLI help only, and it was wrong
  
  `nexus tracks rollup` documented that a track belonging to another organization
  reads `0/0`, "deliberately indistinguishable" from a track with no tasks. That
  stopped being true when the tracks routes were gated: `GET /tracks/:trackId/rollup`
  names `:trackId`, so an unreachable track is a **404** — one answer covering an
  absent id, another organization's and an ungranted one alike. The help now says
  so. The BATCH `GET /tracks/rollup` still answers `0/0`, because it takes its ids
  in a query where no guard can see them.
  
  `nexus tracks ready` and `nexus tracks task edge` also explain that a blocker
  with children is released by its subtree rather than by its own tick.
  
  No command gained a verb, a flag or a changed argument, which is why the CLI is a
  patch: its published artefact here is the help text, and the help text was
  serving a claim the server no longer honours.
- 1b775fc: A track and a task can carry a short name
  
  A track title is written to be read in a document — "Rewrite the whole billing
  subsystem end to end". A board column, a breadcrumb and an agent's own status
  line all need the same thing called something shorter, and every surface that
  needed one had to invent it. There is no honest way to invent it: the obvious
  move is to truncate the title on read, and a truncation cannot honour a WORD
  count. One 200-character word truncates to a 200-character "short" title or to a
  fragment of a word, and there is no character limit at which a five-word English
  title and a space-free CJK one both come out right.
  
  So the short name is **stored**, written by whoever knows what the thing is
  called, and returned verbatim.
  
  ## `@agent-nexus/sdk`
  
  **`Track`, `ReadyTrack`, `TrackTask` and `ReadyTrackTask` gain `shortTitle: string | null`.**
  Every read that returns a title now returns this beside it — `tracks.list()`,
  `tracks.get()`, `tracks.create()`, `tracks.listReady()`, `tracks.listTasks()`,
  `tracks.listReadyTasks()` and `tracks.readTask()`.
  
  **`null` means UNCURATED, and you fall back to `title`.** It is not "pending" and
  it is not an error state — it is the value every track and task that exists today
  carries, so it is the common case rather than the exception. The server never
  fills it in for you, and never shortens `title` to stand in for it: if it did,
  no caller could tell a track somebody deliberately named in five words from one
  nobody has named at all, and nothing could report what is left to curate.
  
  **It is never `""`.** A blank is refused at the contract and again by a database
  CHECK, so `null` and a real name are the only two values that reach you. A
  consumer branching on the empty string is branching on a value this API does not
  produce.
  
  **`tracks.create()` takes `shortTitle`, and `TrackPlanNode` takes one per task.**
  Omit it, or send `null`, to leave the thing uncurated.
  
  🔴 **The plan import is the only door a task's short name can arrive through.**
  There is no single-task create and no task update on this API — a task row is
  born in `tracks.importPlan()` and nowhere else — so a task not named at import
  time stays uncurated. The same holds one level up for a different reason: a
  track's `title` has never been updatable either, and `shortTitle` follows it.
  
  ## The two bounds, and why they are enforced in different places
  
  **At most 5 words, and at most 80 characters.** Both are refused with a 400
  rather than truncated, so a value you send is either stored exactly as you wrote
  it (after trimming) or refused with a reason.
  
  - The **character** bound is also a database CHECK, in the same unit — code
    points, what `char_length()` counts, not UTF-16 code units. 80 emoji are 80
    characters and are accepted.
  - The **word** bound is enforced by the API alone, deliberately. A word count in
    Postgres is vacuous for a space-free script — a CJK title is one word at any
    length — and Postgres' own whitespace class does not agree with JavaScript's
    about a non-breaking space across the versions we run. One rule in one place
    beats two rules that disagree.
  
  Words are runs of non-whitespace after trimming, so `a  b` is two.
  
  ## `@agent-nexus/cli`
  
  **`nexus tracks create --short-title "<text>"`.** Omitted leaves the track
  uncurated.
  
  **`nexus tracks get` prints `shortTitle`**, and `tracks create` echoes the stored
  value so you can see it landed. Under `--json` an uncurated one is `null`; in the
  terminal it reads as a sentence, so a script never has to detect absence by
  matching English.
  
  ```
  $ nexus tracks create --slug billing-rewrite --title "Rewrite the whole billing subsystem end to end" \
      --short-title "Billing rewrite"
  $ nexus tracks get 11111111-1111-4111-8111-111111111111 --json
  ```
  
  The task-level short name is set through `nexus tracks plan --body`, on each
  entry, alongside `title` and `kind`.
  
  ## Nothing existing changes shape
  
  The field is additive on every response and optional on both write doors. No
  cursor, no filter and no ordering is affected, and no value already stored moves.
- f0d9aa1: A track can say what blocks what, and read its own outline
  
  Two read routes that the tracks surface never had. Both tables have been
  writable since the domain shipped and neither could be read back through the
  public API, so a plan could be drawn and never inspected.
  
  ## `client.tracks.listTaskEdges(trackId)` · `nexus tracks task edges <trackId>`
  
  **This is what accounts for a task the ready set withholds.** `task list`
  answers what the plan CONTAINS and `task ready` answers what can be picked up
  NOW; the difference between the two was a set nothing could explain, because the
  anti-join that withholds a task is server-side and published nothing. A track
  reporting 61 of 65 done with four open leaves, one of them ready, left three
  that neither the owner nor the agent could account for — work outstanding that
  nobody could find or close.
  
  A task's blockers are the edges naming it **or any of its ancestors** as
  `blockedTaskId`: an edge hung on a section parent holds every row beneath it,
  and those rows carry no edge of their own. That is now a question the two lists
  answer together — reading only the edges that name a task directly reports a
  genuinely blocked row as unexplained.
  
  ⚠️ **Unordered.** The row carries no position and the table has no ordering
  column, so no order is promised and none should be relied on.
  
  ⚠️ **No cycle information.** Refusing a circle is the write path's job, inside a
  lock over a snapshot this read does not have.
  
  ⚠️ **`edges` reads and `edge` writes.** `nexus tracks task edge` still adds one
  and requires `--blocker` and `--blocked`; the new leaf takes the track and
  nothing else. A mistyped read lists, a mistyped write refuses on the missing
  options — both directions fail loudly or harmlessly.
  
  ## `client.tracks.listSections(trackId)` · `nexus tracks section list <trackId>`
  
  **The section resource was write-only.** Create and rename shipped with no read,
  so a caller could build an outline and never read it back — and `body`, the
  section's prose, is accepted by `createSection()` and was returned by nothing, so
  a writer had no way to check what it had stored.
  
  Rows arrive in `path` order, so every parent precedes its children and the tree
  builds in one pass. `position` orders siblings.
  
  ⚠️ **`body` is never `null`.** The column is NOT NULL with an empty-string
  default, so "nobody wrote any" is `""`. A consumer branching on `null` is
  branching on a value this API does not produce.
  
  ## A new scope, and no existing key needs re-minting
  
  `track_sections:read` joins the catalog, because `track_sections` had a write
  scope and no read one. **Every key that already holds `track_sections:write`
  satisfies it** — on the same resource, `write` implies `read` — so nothing has
  to be re-minted. The catalog entry exists so that a key CAN be minted that reads
  a track's outline and cannot restructure it, which was previously inexpressible.
  
  `listTaskEdges` needs `track_tasks:read`, which already existed.
  
  ## What changes for a caller
  
  Nothing breaks. Two additive routes, two additive SDK methods, two additive CLI
  leaves, one additive scope. No request shape moved, no field was removed or made
  optional, no route changed its status code, and no existing command was renamed
  or relocated.
  
  ⚠️ **A track in another organization answers an empty list on both, not a 404.**
  The reads are anchored on the caller's organization, so an empty answer is
  exactly what a real, empty track returns and is not proof the track exists —
  the same call `readRollup()` already makes by answering `0/0`.

### Patch Changes

- b1e3013: A memory tool config is readable, and the type says it is never creatable
  
  `AgentToolConfigType` gains `MEMORY`, so a stored memory tool config read back from
  `client.agents.tools.list()` / `.get()` is now typed rather than typed out of
  existence. Before this the SDK's hand-written union held five members while the v1
  contract published six, so an exhaustive `switch` over a real response could miss a
  row it had actually received.
  
  **The write bodies are narrowed to match the API rather than the read set.**
  `CreateAgentToolBody.type` and `UpdateAgentToolBody.type` are now
  `WritableAgentToolConfigType` — `Exclude<AgentToolConfigType, "MEMORY">` — because a
  `MEMORY` config is inert if created through v1, and publishing it as creatable would
  advertise a capability the API does not have.
  
  ## What changes for a caller
  
  Nothing breaks. `MEMORY` was absent from the SDK type entirely, so no caller could
  have been sending it on a create or update body; the write set holds exactly the five
  members it always did. The read side is purely additive — a `switch` that was
  exhaustive over the old five now needs a `MEMORY` arm, which is a compile error at the
  call site and is the good direction.
- 9f1f356: An edge hung on an ancestor holds the rows beneath it, on every surface that says so
  
  Four surfaces said a task's blockers are the edges naming it as `blockedTaskId` —
  the SDK's `listTaskEdges()` docblock and its response type, the `nexus tracks task
  edges` help text, and the OpenAPI description of `GET /tracks/:trackId/task-edges`.
  The SDK docblock added that an open task with no such edge is held by an unticked
  ancestor or by a child "rather than by a dependency". The readiness predicate tests each
  edge against the task AND EVERY ANCESTOR OF IT, so an edge hung on a section
  parent — the shape a plan import produces when dependencies are drawn between
  parents — holds every row beneath it, and those rows carry no edge of their own.
  That IS a dependency, and it has a nameable blocker row. The old sentence steered
  a reader away from it: they looked for a structural cause, found none, and
  reported the board as unexplained. That is the production report this correction
  comes from.
  
  All four now say a task's blockers are the edges naming it or any of its
  ancestors, and state what composing that costs. The materialised ancestry column
  the ready-set query reads does not cross the wire — it is absent from the v1 task
  schema and from the SDK types — so a client rebuilds it by walking `parentTaskId`,
  which agrees with the server only while the two are in step. `nexus tracks task
  why-not-ready` already does that composition and ships the caveat with its
  answer, so it is the thing to reach for rather than a hand-rolled intersection.
  
  Documentation only. No type, no signature and no behaviour changes; it is a
  release because the SDK docblocks are emitted into the published `.d.ts` and the
  CLI help text is printed on every `--help`.
- 3a2b176: Four SDK doc claims corrected where they stated the opposite of the API
  
  No behaviour changes — but these are the sentences a caller designs against, and
  four of them described an API that does not exist.
  
  **`listReadyTasks()` and `listTasks()` said a track in another organization
  answers an empty set.** It answers **404**. Both routes name a `:trackId`, so the
  access gate decides them before the read runs, and absent, another organization's
  and ungranted are one indistinguishable refusal. `get()` and `readRollup()` in the
  same file already documented it correctly, so the file contradicted itself — and a
  caller that wrote `if (tasks.length === 0)` to mean "not mine" was reading a
  branch that never runs. An empty list means a real, readable track with nothing on
  it, and nothing else.
  
  **`readRollups()` said to zip its answer against your own list.** The route
  collapses duplicate ids before it reads, because the response is keyed by track
  id, so `[A, A, B]` returns TWO entries — and a positional zip then pairs B's
  progress with A, silently, with both arrays looking well-formed. Index the answer
  by `trackId`, or pass a de-duplicated list if you want the lengths to match.
  
  **`rowsRewritten` is `0`, not `1`, when a section rename is a no-op.** Renaming a
  section to the slug it already has writes nothing and returns `0`. The doc said
  "`1` when it is a leaf" with no mention of that case, so `0` read as a vanished
  section.
- 48719ce: `permissions` accepts `track` as a resource type
  
  A Track is a resource you can grant, revoke and read the access list for. Use
  `track` where you already use `agent` or `workflow`:
  
  ```bash
  nexus permissions grant --resource-type track --resource-id <trackId> \
    --subject-type user --subject-id <userId> --relation viewer
  nexus permissions revoke --resource-type track --resource-id <trackId> \
    --subject-type user --subject-id <userId>
  nexus permissions access track <trackId>
  ```
  
  The CLI refused `track` before this change. It refused the value locally, so the
  request never left your machine. The three commands above now send it.
  
  The SDK types carry the new value too. `PermissionResourceType` lists `track`,
  and `GenericGrantResourceType` derives from that list. So
  `client.permissions.grant()`, `client.permissions.revoke()` and
  `client.permissions.listResourceAccess()` all accept `track`. It is no longer a
  compile error.
  
  `nexus permissions set-visibility` does not take `track`. That command keeps its
  own list of resource types, and the list is unchanged.
- 3a3d451: The Roles SDK describes releasing a grant as a change of audience, not a publish
  
  `client.roles`'s doc comment on the suspend path said that emptying a Role's
  grants publishes every Collection and Workspace it was the last holder of to the
  whole organization. Under the allow-list that is backwards.
  
  The resource returns to the set no Role has claimed: every caller placed in no
  Role reaches it, and every Role-placed caller loses it. No runtime behaviour
  changed in this package — this corrects a description that would have led a
  caller to expect a widening where the effect is a narrowing for anyone holding a
  Role.
- 4086d14: `workspaces.list()` documents that it returns the caller's reach, not the organization's
  
  No behaviour change — the doc was describing an API that stopped existing when the
  narrowing was fixed.
  
  `workspaces.list()` said it lists "the organization's workspaces". It lists the
  workspaces **this key can reach**: `ListWorkspacesUseCase` drops any workspace a
  `RoleWorkspaceGrant` narrows out for the caller, so the result agrees with what that
  same caller could actually open.
  
  The route genuinely did return the whole organization once — that was a bug, and the
  use case's own docblock records it: `subjects` was made a required key precisely
  because "the Public API v1 list route did exactly that and returned every workspace in
  the org to a caller a Role had narrowed out". The narrowing landed; the sentence
  describing the old behaviour did not.
  
  **What this changes for you:** nothing in the wire shape, but stop reading a shorter
  list as an error. Two keys in the same organization legitimately receive different
  lists, and a workspace missing from one of them has not been deleted — that key is
  narrowed out of it.

## 2.0.0
### Major Changes

- d41c13b: `format`, `autoShowInitialMessagePopup` and `autoShowInitialMessagePopupDelay`
  are removed from the embed config — none of them ever had a consumer
  
  All three were declared on `EmbedSettingsSchema`, served on every response, and
  accepted on every `PATCH`. No code has ever read any of them.
  
  `format` is declared `"bubble" | "classic"` and nothing in the platform branches
  on the value. The widget has one layout. The `bubble format only` notes on the
  bubble fields and on the landing screen described an intent that was never
  enforced — those sections are gated by `landingScreenEnabled`, or by nothing.
  
  The other two name a popup that does not exist. No auto-shown initial-message
  popup has ever been implemented in the widget, at any value of either field. The
  symptom that follows is the reason this is a removal and not a doc note: an
  operator could set a five-second popup delay through the CLI, read it back
  unchanged, and no popup would ever appear. Storing and returning a number that
  governs nothing teaches every caller to configure a feature that is not there.
  
  There were two honest endings — build the thing, or stop publishing the fields.
  Building a `classic` layout and an opening popup is product work nobody has
  asked for; publishing a control surface for neither is what was actually
  shipping.
  
  ## What changes for a caller
  
  Both routes serving this shape lose three keys:
  
  - `GET /api/public/v1/deployments/:deploymentId/embed-config`
  - `PATCH /api/public/v1/deployments/:deploymentId/embed-config`
  
  - the JSON response loses three keys, so `config.format === "bubble"` was true
    and is now false, and `"format" in config` was true and is now false
  - TypeScript consumers get a compile error, which is the good direction
  - a JS consumer reading `config.autoShowInitialMessagePopupDelay` moves from `3`
    to `undefined`
  - a `PATCH` body carrying any of the three is now an **undeclared key**, and this
    endpoint strips undeclared keys rather than rejecting them — so such a call
    still returns `200` and simply does not write those fields. That is the
    endpoint's existing documented behaviour for undeclared keys, not a new one,
    but it is the shape a caller migrating off these fields will meet first.
  
  No caller can be relying on an effect, because there has never been one. A
  caller relying on the field's mere presence is the case the major bump is for.
  
  This is the same call NEX-3864 took on `ExecutionNodeResult.logs` and
  `ExecutionOutput.outputType`, and the document-summary removal took on
  `DocumentSummary.chunkCount` and `.embeddingStatus`: a published field teaches
  every consumer to handle a value, write a branch for it, and wait for it.
  
  `uiBgPattern` is deliberately NOT removed. It has a live reader — the widget
  resolves it into a `backgroundImage` — and no dashboard control, so its docs
  entry now says it is API-only instead.

### Minor Changes

- 880a36b: A coverage figure says whether it rests on measurements or on estimates
  
  `client.roles.getCoverage(roleId)` now returns a `basis` — `"ESTIMATED"`,
  `"MIXED"` or `"MEASURED"` — and every row in `contributions` carries its own.
  Until now a Role's coverage percentage, its person-hour totals, its money
  figures and its EUR savings projection all arrived with nothing saying where the
  numbers behind them came from, and a hand-authored model was indistinguishable
  from an observed one.
  
  ```ts
  const coverage = await client.roles.getCoverage(roleId);
  
  if (coverage.basis === "ESTIMATED") {
    // every magnitude behind this figure was typed by a person
  }
  ```
  
  ## What the three arms mean
  
  Over the inputs a published figure actually CONSUMED:
  
  | | |
  |---|---|
  | `ESTIMATED` | no consumed input came from a measurement |
  | `MIXED` | some did, some did not |
  | `MEASURED` | every one did |
  
  It is all-or-nothing rather than a proportion, and that is deliberate. A
  coverage model is a PRODUCT of its inputs — tickets × handling time × headcount
  — so one guessed factor is a factor of the answer rather than a fraction of it,
  and its error is not diluted by the measured terms beside it. A threshold would
  let a guess hide behind its siblings.
  
  ⚠️ **`ESTIMATED` is also the answer when nothing was evaluated at all** — a Role
  with no workload model, or a row whose stored model could not be read. It is the
  arm that cannot overstate, and there is deliberately no fourth arm for "no
  figure": `coverage` and each money term already say that in their own unions.
  
  ## Today every Role answers `ESTIMATED`, and that is correct rather than broken
  
  Nothing populates the measurement channel yet, so `MEASURED` is currently
  unreachable through the product. A client rendering this should treat a constant
  `ESTIMATED` as a true statement about hand-authored inputs — not as a missing
  value, a placeholder, or a fault.
  
  ## Three things worth knowing before you read it
  
  ⚠️ **`basis` is not a period basis.** A coverage input's `perPeriod` states the
  WINDOW a magnitude accumulates over. This states where the magnitude came from.
  The two share a word and nothing else.
  
  ⚠️ **`basis` is NARROWER than the `measuredInputKeys` published beside it, and
  you must not derive one from the other.** A model that evaluated cleanly and was
  then refused — wrong dimension, an inadmissible window, a window disagreeing
  with the denominator — reports its keys in `measuredInputKeys` and reaches no
  basis, because it reached no published figure. Reading `basis` off those keys
  prints `MIXED` over a set of numbers containing no measurement at all.
  
  ⚠️ **`MEASURED` is a claim about the MAGNITUDES, never about the model.** A
  measurement replaces a number; the dimension, the unit and the expression a
  person wrote around it are unchanged. It does not mean the model is right, and
  it says nothing about the organisation's stated working day, week and year,
  which travel separately on `workingTime` with their own per-field `origin`.
  
  ## Types
  
  `CoverageBasis` is exported. `basis` is required on `RoleCoverage` and on
  `RoleCoverageContribution`, so every producer of one owes a value and a client
  narrowing on it is exhaustive.
  
  ⚠️ **If you CONSTRUCT either of those types — a test fixture, a mock, a stub
  response — it now needs the new field.** Reading one is unaffected. The shipped
  response manifest gains `basis` on `GET /roles/:roleId/coverage` as a required
  key; it is an opt-in observer that never alters a payload, so an older server
  omitting the field is reported to a contract reporter if you installed one and
  changes nothing otherwise.
- c71fc83: A `smartAction` node's result no longer carries the node's own bookkeeping
  
  The node picked a tool, ran it, and then wrote its own two fields INTO that
  tool's response before publishing it:
  
  ```ts
  { data: { ...toolResult, chosenTool, chosenToolId } }
  ```
  
  Both keys were written after the spread, so they won a collision: a tool whose
  response already carried a field called `chosenTool` had **its** value replaced
  by the node's — the tool's data lost, not shadowed. And every tool the node can
  ever call had those two names reserved, whether or not it used them.
  
  The tool's response is now published exactly as the tool produced it. What the
  node chose travels beside it.
  
  ## `@agent-nexus/sdk`
  
  `ExecutionNodeResult` (`client.workflowExecutions.getNodeResult`) and
  `TestNodeResult` (`client.workflows.testNode`) each gain a `metadata` field,
  beside `output` / `data` rather than inside it. For a `smartAction` node it
  carries `chosenTool`, `chosenToolId` and `chosenAction`; for a loop node, its
  iteration ids; `null` for the node types that record nothing about a run, which
  is most of them.
  
  ⚠️ **Additive on the wire, and it changes no existing field** — but a caller
  reading `output.chosenTool` off a `smartAction` node result is reading a key
  that is no longer there. It moved to `metadata.chosenTool`. The tool's own
  fields (`output.members`, `output.channels`) are untouched, which is why the
  metadata went into a column of its own rather than nesting the result one level
  deeper: that alternative would have moved every field instead of these two.
  
  `chosenToolId` also changed source. It was the tool CONFIG's own entry id — a
  field the schema declares required and nothing enforces, absent on nodes built
  through the API, where it resolved to `undefined` and dropped out of the JSON
  silently. It now carries `toolId`, the identifier the node actually resolves the
  tool with, so it is present on every run. `chosenAction` is new and is what
  tells two candidates apart when they share one `toolId` and differ only by the
  action they call.
- 86940d7: A track list can be paged, counted, and rolled up in one call
  
  `GET /tracks` answered with a page and nothing else. There was no cursor and no
  offset, so an organization past the 200-track ceiling could not enumerate its own
  tracks at all, and there was no total, so a caller reading 200 rows could not tell
  200 from 2,000. Progress was worse: `GET /tracks/:trackId/rollup` takes one track,
  so a board of N tracks cost `1 + N` requests and `1 + N` queries.
  
  ## `@agent-nexus/sdk`
  
  **`tracks.list()` takes a `cursor` and answers with `total`, `hasMore` and
  `nextCursor`.**
  
  The cursor is a **keyset** over `Track.number`, not an offset — `number` is unique
  per organization, so it is a total order and needs no tiebreaker. That is what
  makes paging safe while the list changes underneath a reader: with `LIMIT/OFFSET`,
  one track archived above your position shifts every later row up by one and the
  next page silently skips one. A keyset cannot do that. A row that leaves the
  filtered set simply stops appearing; no row is ever skipped or repeated.
  
  `total` counts the whole filtered set, ignoring `limit` and `cursor` — not what is
  left, which would change on every page. The page and the count are built from one
  filter expression on the server, so a total you cannot page to is not a state this
  API can reach.
  
  **The cursor is server-issued and carries the filters it was issued under.**
  Round-trip `nextCursor` verbatim. Passing a cursor from a `status=PLANNED` page
  into a `status=DONE` request is refused with a 400 rather than served: honouring
  it would return a correctly-scoped, correctly-counted page that starts in the
  middle of a different list, with nothing to tell you so. Do not build a cursor
  from a track's `number`; a hand-rolled token is refused too.
  
  **`tracks.readRollups(trackIds)` — progress for up to 100 tracks in one request.**
  
  One HTTP round trip and one database statement, not a server-side loop. Entries
  come back one per id **asked for**, in the order asked, so you can zip the answer
  against your own list. A track that does not resolve in your organization is
  present with `0/0` rather than omitted — the same answer `readRollup()` gives it,
  so this cannot be used to learn which ids exist elsewhere.
  
  The cap is 100 rather than the 200-track page size, and the bound is URL length:
  200 uuids is ~7.4 KB of query string against the 8 KB single-buffer request line
  some proxies default to. A full page is therefore two calls.
  
  **`TrackTask` now carries `doneByUserId`.**
  
  The column has been written since the domain shipped and no route returned it, so
  no client could say who closed a task. Read `null` as "nobody is attributed",
  never as "a person is missing": ticking a task is reachable with an org API key
  that resolves no owning human, and the API writes `null` rather than a fabricated
  author.
  
  ## What changes for a caller
  
  Nothing breaks. `cursor` is optional and omitting it reads the first page exactly
  as before; `total`, `hasMore`, `nextCursor` and `doneByUserId` are additions to
  responses. A caller that ignores all four keeps its current behaviour, including
  the 200-row ceiling it already had.
  
  ## `@agent-nexus/cli`
  
  No command changed. The version moves with its SDK dependency.
- 1fbcba2: Agent conversation evaluations reach the SDK
  
  `client.agentEvals` is new, and it covers the whole `/agent-evals` surface: 33
  routes across runs, batches, templates, schedules, triggers and webhooks. Until
  now the domain shipped on the Public API with no SDK resource at all — not a
  method that was skipped, but an entire family the SDK had never been extended
  to, and the largest single block in the gate that tracks exactly that.
  
  ```ts
  const run = await client.agentEvals.runs.create({
    /* … */
  });
  await client.agentEvals.runs.execute(run.id);
  const { rollups, run: finished } = await client.agentEvals.runs.results(run.id);
  ```
  
  **Read the resource's header before any write.** `runs.execute`,
  `batches.create`, `schedules.create` and an enabled `triggers.upsert` all start
  model spend, and the last two spend repeatedly and unattended. Every cost field
  is in ten-thousandths of a USD cent.
  
  **Nothing about the CLI's surface changed.** `nexus agent-eval` has the same
  commands, the same flags, the same help and the same JSON on stdout. What
  changed underneath is that it no longer builds its own HTTP client, which fixed
  two things that transport silently did without:
  
  - **the `organization-id` header.** A personal (cross-org) token selects its
    acting org with that header and this namespace never sent one, so every
    `nexus agent-eval` command acted on whatever org the server defaulted to
    rather than the profile's selected one. Org-scoped keys were unaffected,
    which is why it went unnoticed.
  - **retry notices.** A rate-limited command waited in silence.
  
  **One naming note for anyone reading the contract beside the SDK.** The v1
  descriptors are spelled `ConversationEval*` while every route they declare is
  under `/agent-evals`. The SDK follows the route: `client.agentEvals`,
  `AgentEvalRun`, `AgentEvalTemplate`. `client.evaluations` is a different family
  — AI-TASK evaluations, on `/evaluations` — and is unchanged.
  
  **One derived figure in `COMPATIBILITY.md` moved, and no command's output did.**
  It now reads 101 leaves building their own JSON document rather than 102. The
  leaf that moved is `mcp serve`, in a file this change never touched: the
  json-shape scanner resolves its call graph by BARE FUNCTION NAME across every
  file at once, so `mcp.ts`'s `transport.send(...)` was resolving to the
  file-scope `send` helper `agent-eval.ts` used to declare — one that did write a
  JSON document. Deleting that helper removed the collision, and `mcp serve` is
  now classified as what it is: a stdio server that emits no document. Both the
  old and the new classification are "unclassified", so the published shape map is
  byte-identical and no `--help` line or stdout shape changed.
  
  **Two response types are transcribed rather than gated, and say so.** The
  `transcript` and `compare` routes declare no response schema in the contract, so
  no contract-derived gate compares their types to anything. They are read off the
  handlers instead, and a server-side rename cannot turn any test red.
  
  `AgentEvalScoreDiff` is the worked example of what that costs. Transcribing it
  recorded a real defect: `compare` was serving `current` / `baseline` while
  `ConversationEvalScoreDiffSchema` — the declared response of that same route on
  the internal contract — spelled them `currentScore` / `baselineScore`, so the
  dashboard's own parse stripped both keys and every score column rendered blank.
  The value object has been corrected and this type spells both fields
  `currentScore` / `baselineScore`, matching the column, the entity and the
  published API reference.
- f324a77: Connecting an external app is its own flow, not a step inside tool configuration
  
  Connecting an app had exactly one door — `POST /public/v1/tools/:toolId/connect` —
  and **its OAuth branch never reads `:toolId`**. Measured on a dev stack: tool id
  `12df363b…` (Finmei) paired with `service: "expofp"` returns a live ExpoFP
  connect link. The path parameter names a tool the handler ignores, so a caller
  who wants to connect Gmail must first find _some_ marketplace tool's UUID to put
  in a segment nothing looks at. That is what made connecting an account read as a
  step inside tool and workflow building (NEX-3929).
  
  Two additive routes now address it as what it is:
  
  ```
  POST /public/v1/credentials/connect
  GET  /public/v1/credentials/connect/:handshakeId
  ```
  
  The behaviour is shared with the tool-scoped route rather than copied — both
  delegate to the same use case. What changes is the address. The tool route stays
  supported and unchanged.
  
  ## `@agent-nexus/sdk`
  
  **`credentials.connect()`, `credentials.connectStatus()` and
  `credentials.waitForConnection()`.**
  
  ```typescript
  const started = await client.credentials.connect({ authType: "oauth", service: "GMAIL" });
  // no tool id anywhere
  if (started.authType === "oauth") {
    const done = await client.credentials.waitForConnection(started.handshakeId);
  }
  ```
  
  The API-key arm carries its tool in the BODY, because that arm genuinely has one —
  the key is stored against that tool's auth block:
  
  ```typescript
  const created = await client.credentials.connect({
    authType: "api_key",
    toolId: "tool-uuid",
    apiKey: "sk-…"
  });
  ```
  
  **It answers with BOTH ids and says which is which.** A connected account is
  addressed by two different UUIDs — the unified `Credential.id` that
  `credentials.get/update/delete` take, and the tool-scoped `ToolCredentials.id`
  that `tools.credentials()` lists. Neither namespace accepts the other's, and both
  are well-formed UUIDs. The tool route returns only the second; this one returns
  `credentialId` **and** `toolCredentialId`.
  
  ## `@agent-nexus/cli`
  
  **`nexus credential connect` and `nexus credential connect-status`**, so the
  namespace is a complete lifecycle instead of browse-and-delete:
  
  ```bash
  nexus credential connect --service GMAIL
  nexus credential connect --tool <tool-id> --api-key-value <key> --name "Production key"
  nexus credential connect-status <handshake-id>
  ```
  
  The branch is inferred from which flag arrived, and every ambiguous combination
  is refused rather than resolved: `--service` with `--api-key-value`, `--tool`
  with `--service`, `--api-key-value` without `--tool`, and neither.
  
  `--api-key-value`, not `--api-key`: the latter is a global flag on this CLI, so a
  subcommand declaring it would have the root parser swallow the operator's
  _provider_ key and apply it as Nexus transport auth.
- 8bb4662: Read every track event in the organisation, not one track at a time.
  
  `client.tracks.listOrganizationEvents()` and `nexus tracks event feed` reach `GET /track-events` —
  every track's events at once, plus the ones that name no track, newest first. The server has been
  able to answer this since the domain shipped; nothing could ask, because both event routes were
  mounted under `tracks/:trackId` and parsed a track id off the path before reading.
  
  **It pages by CURSOR, and there is deliberately no offset.** The stream is append-only and read
  newest-first, so rows arrive at the head of the page you are walking: an offset window would
  re-serve rows and silently skip others, and every response would still be a well-formed page of
  real events. Feed `nextCursor` back as `cursor` and stop only when it is `null` — including after a
  full page, which always carries one, because "full" and "full and final" are indistinguishable
  without counting.
  
  `--since` takes a full ISO-8601 instant rather than a date, and refuses anything ambiguous: a
  mistyped bound that silently returns a different window is worse than an error. `--type` filters on
  an exact event type. There is no total.
- d81294b: Role governance settings report only what the server enforces
  
  **Breaking.** `client.roles.getManagementSettings()` and `nexus role governance`
  now return **two** rows — `CREATE_ROLE` and `DELETE_ROLE` — and each row carries
  `action` and `requiresApproval` only. The `grants` array is gone, the
  `RoleManagementGrant` type is removed from the SDK, and the CLI's `ALLOWED`
  column is gone with it.
  
  Both removals report a control that had stopped controlling anything.
  
  `grants` reported the org-wide `RoleManagementAction` allow-list. That was a
  second authorization axis in front of the per-Role capability layer, and it is
  retired: it was keyed on the organization with no Role, so it could not express
  "on this Role"; nothing populated it; and its documented no-rows policy was "org
  admins only" — so on every Roles write it refused every permission set an
  administrator had granted through a Role group, before the capability layer ran.
  Measured on production: zero grant rows across every organization, so the entries
  this field reported granted nothing in any tenant. Authorization on the Roles
  surface is now `RoleCapability` alone, over a Role scope and an organization
  scope. Its organization-scoped grants have no public editor yet; when they get
  one it is a new contract rather than this field returning.
  
  The three extra rows — `MANAGE_MEMBERS`, `MANAGE_GROUP_GRANTS`,
  `MANAGE_RESOURCES` — reported a `requiresApproval` that no code path reads. Only
  creating and deleting a Role can file a request for review instead of acting, so
  a caller who set the flag on the others was configuring an outcome that cannot
  occur, with nothing failing to say so. `PATCH /api/roles/management/:action/policy`
  now refuses those three with a 400 naming the reason, where it used to store the
  value and answer 200.
  
  `RoleManagementAction` keeps all five values: it mirrors a Postgres enum, which
  cannot have a value dropped without recreating the type and rewriting every
  dependent column under an exclusive lock.

### Patch Changes

- 51155dd: A chat turn now cites the knowledge it retrieved
  
  `source-url` and `source-document` were declared in this SDK's chunk union and
  had no producer on the Nexus side. They have one now, so the docblock that
  listed what a turn actually emits was about to become wrong.
  
  Nothing in the SDK's runtime changed. The union already carried both members —
  that is the whole reason it declares the SDK's whole union rather than the
  subset Nexus emits — so a consumer whose `switch` already handled them starts
  receiving them with no code change.
  
  **What arrives.** One frame per retrieval hit, before the first text delta.
  A hit with a durable URL — a website page, a Notion page or row, a Google Sheet
  — arrives as `source-url`. Everything else — uploads, Google Drive, SharePoint —
  arrives as `source-document` carrying `mediaType` and `title`.
  
  **Branch on the member, or on `url`'s presence. Never on a source-type field.**
  There isn't one, deliberately: `url` is required on `source-url`, so a citation
  that has no URL is representable only as `source-document`, and the illegal
  state cannot reach you.
  
  `providerMetadata.nexus` carries `{ score, excerpt?, pageNumber? }`. **`score` is
  an unbounded reranker score, not a similarity** — do not render it as a
  percentage, and do not validate it into `0..1`. `excerpt` and `pageNumber` are
  absent rather than `null` when the retrieval row carried neither.
  
  ⚠️ **A citation is a document the answer was GIVEN, not one it used.** Nothing
  asks the model which snippets it leant on and the model does not say. A UI
  labelling these "the sources for this answer" overstates them.
  
  `providerMetadata.anthropic` remains the model's own web-search citation, on the
  same members. The two namespaces have different trust properties and are never
  merged.
- b30dd9a: A node test's id is accepted by every `execution` verb, and `status` is truthful
  
  Nothing in the runtime moved here. What moved is what the CLI and the SDK **say
  about the platform** — and both were describing a server that no longer exists,
  in the direction that costs the caller work.
  
  ## The id was never a dead end
  
  `workflow node test` hands back a per-node test id — a `WorkflowExecutionNode`
  key, not a `WorkflowExecution` one. Four screens of `--help` told you that
  `execution get` on it answers `404` and that the output was already in the test
  response, so the id was good for nothing.
  
  It resolves. `get`, `poll`, `follow`, `diagnose`, `node-result`, `output`,
  `retry`, `cancel` and `export` all accept it, resolve it to the parent execution,
  and answer for that execution under its own canonical id.
  
  ⚠️ **The recovery trick that help recommended is the thing to stop doing.**
  `execution list` was documented as the way to "recover a real execution id" by
  reading the most recent row — with its own caveat that it is only safe while
  nothing else is running. It was never necessary, and two concurrent tests on one
  workflow make the newest row a coin flip. `--include-test-runs` is a filter on
  `wasTestExecution`, so it is what LISTS a node test; it was never needed to
  ADDRESS one.
  
  A `404` from `execution get` therefore means the id names nothing this
  organization can reach — a wrong id, or somebody else's. Those two are
  deliberately indistinguishable.
  
  ## `status` reports the outcome (NEX-4066)
  
  Both packages carried a warning that a run whose node threw still reports
  `status: "COMPLETED"`, because the service returned that arm with no status and
  the v1 layer's `result.status ?? "COMPLETED"` stamped one on.
  
  The field is truthful now: `"FAILED"` when the executor threw, with the error
  envelope in `data`; `"PENDING"` when the run went to the background and `data` is
  `null`; `"COMPLETED"` when it settled clean. The SDK's `testNode` JSDoc said the
  opposite and ships in the published `.d.ts`, so it was wrong on hover.
  
  🚨 **The exit code is still read from `data`, and that is not an oversight.** A
  published CLI talks to whatever server an organization runs, so the older shape
  that stamped COMPLETED on a thrown node is still reachable in the field. Reading
  `data` also keeps the CLI and the console's own test panel deciding the same run
  the same way. `workflow-verdict-exits.test.ts` keeps its failure fixture at the
  OLD shape on purpose and now says so — modernising it to `"FAILED"` would make
  the case pass for the wrong reason and delete the only test pinning the rule.
  
  **The output is in `data` only for a synchronous node type.** `plugin`,
  `firecrawl`, `exaai`, `sixtyfour`, `aiTask`, `cueNode`, `loop`, and `parallelai`
  on any action but `search` or `chat` are dispatched to the background: `status`
  `PENDING`, `data` `null`, result read back later through the id above. That is
  UNMEASURED — neither a pass nor a failure.
  
  ## Four `--json` shapes that were described wrong
  
  ⚠️ **`task list` is not a bare array.** `workflow list --help` offered it as the
  contrast case — "one parser cannot read both" — and named it a bare array. It
  answers the route's own `{items, total}`. Both are objects, so `jq '.[]'` selects
  nothing on **either**: the rows are under `.data` here and `.items` there. The
  same screen now separates three shapes rather than two, since `agent-tool list`
  *is* bare and two commands ending in `list` can land on three different patterns.
  
  ⚠️ **`workflow node create` puts created ids at `created.{nodes,edges,branches}`,
  not `data.created`.** The SDK has already unwrapped the envelope, so
  `jq '.data.created'` selects `null`.
  
  ⚠️ **`workflow upload-icon --json` is `{success, message, id, iconUrl}` and the
  API answers `{iconUrl}` alone** — `id` is the argument you passed, not something
  the route returned.
  
  **Deleting a loop enumerates what it took.** The help said nothing did. The `200`
  carries `deletedNodeIds`, `deletedEdgeIds`, and `severedNodeIds` for the
  survivors that lost an edge.
  
  ## Also
  
  `workflow node test` writes back `testExecutionId` and the inferred
  `outputFormat`. **`runOutput` is persisted only for `agentInputTrigger`,
  `humanInput` and `newsMonitorTrigger`** — on every other type the snapshot is
  stripped before the graph is saved, so `workflow get` shows `runOutput: null`
  right after a green test. That null is not a failed test, and the help now says
  so where it previously listed `runOutput` among the fields that survive.
  
  `workflow get`'s table prints seven fields; help claimed six.
- 1ee3e83: A tool type read off a search result can be sent back as a filter
  
  `GET /tools/search` publishes `type` as the **integration kind** — `PIPEDREAM`,
  `CUSTOM_MANIFEST`, `API`, `MANIFEST`, `WEBHOOK`, `APIFY` — and its `type` FILTER
  was declared against a different Postgres enum entirely. The two sets share one
  member, so the value a caller read off a result could not be sent back as a
  filter, and the values that *were* accepted matched nothing.
  
  Measured against production: `APIFY` (1,283 rows) and `CUSTOM_MANIFEST` (154)
  were refused with a 400, while every accepted value except `PIPEDREAM` selected
  zero rows out of 4,184.
  
  ## `@agent-nexus/cli`
  
  **`nexus tool search --type` now offers the six values that can actually match**,
  and refuses the twelve it used to offer. The flag's choices are generated from
  the route contract, so this follows the server.
  
  The removed values were never useful here: `--type WORKFLOW` and its siblings
  printed an empty table every time, because no marketplace tool can carry one.
  `WORKFLOW` / `TASK` / `COLLECTION` remain correct on `nexus tool skills`, which
  is a different list with a different enum — the help text now says so at the
  flag.
  
  ## `@agent-nexus/sdk`
  
  **No runtime or type change** — `type` stays `string` on both the request and the
  response. What changes is what your editor tells you it may hold: three doc
  comments said `"PLUGIN"`, which is not a value this route can return under any
  reading, and on `SearchMarketplaceToolsParams.type` it was an example that would
  now answer `400`. They name the real closed set instead, and say that the
  response value and the filter value are the same set.
- 4699550: An agent's collection list reports the STORED document counter, not a live count of links
  
  `GET /api/public/v1/agents/:agentId/collections` published `documentCount` from
  the LIVE junction aggregate — a count of `DocumentCollection` rows taken on every
  request. It now publishes the stored `Collection.documentCount` column, which is
  what `GET /api/public/v1/skills/collections` already serves for the same
  collection. One published field named `documentCount` carried TWO definitions for
  one collection across the v1 surface, and neither contract said which of them a
  caller was holding.
  
  They were different definitions, not two readings of one number:
  
  - the junction aggregate counts LINK ROWS, and filters neither soft-deleted
    documents nor folders;
  - the stored column is written by `CollectionsService.updateStatistics`, which
    counts the linked documents that are neither soft-deleted nor folders.
  
  On ordinary data the two agree, and that is why the split was never observable on
  the wire: a folder link cannot be written, and a delete removes every link. **The
  window where they part is real, narrow and named.** A document delete recounts
  each collection it detached from, once, after the last link is gone — and a
  recount that fails there is logged and swallowed BY DESIGN, per collection,
  because the delete itself succeeded and a retry would 404. For as long as that
  lasts, the links are gone and the stored column is still high. It closes on that
  collection's next attach or remove.
  
  ## What changes for a caller
  
  - `documentCount` on this route can read HIGHER than the documents the collection
    actually holds, for the length of that window. Its previous source, the live
    link count, was taken fresh on each request and could not lag.
  - **The type does not change.** `documentCount` was a `number` and still is, so
    nothing moves in the shipped response contract, in codegen, or in a consumer's
    typecheck. The VALUE is the only observable — which is the whole reason this
    note exists instead of a gate.
  - **No SDK version pins this.** The change is server-side. It took effect for
    every caller on every version the moment it deployed, and neither upgrading nor
    pinning the SDK restores the old number.
  - Needing a count taken live, per request, is still served — by
    `GET /api/public/v1/skills/collections/:collectionId/statistics`, which counts
    the surviving links and excludes soft-deleted documents. That route is
    deliberately the live one, it is unchanged, and it is the one remaining
    `documentCount` on the v1 surface that is not the stored column. The stored
    column is now the single definition for a collection OBJECT.
  
  ## `@agent-nexus/cli`
  
  - `nexus agent-collection list --json` is a bare array of this response, so
    `.[].documentCount` moves with it. The table view has never shown the column,
    so a human at a terminal sees nothing change.
  - `nexus collection list` / `collection get` are unchanged: they already read the
    stored counter, and their notes already send you to `nexus collection stats`
    for the live number.
  
  ## `@agent-nexus/sdk`
  
  No shape change. `AgentCollection.documentCount`, `CollectionSummary.documentCount`
  and `CollectionStatistics.documentCount` now each say which of the two definitions
  they carry, so a consumer reading the field in an editor is told whether it is the
  stored counter or a live count rather than left to assume.
- 3132dc8: `RolePermissionSetSurface` accepts `apps`
  
  The feature catalog gained an `apps` key for the Vibe surface, so the SDK's
  surface union carries it too. A permission set naming `apps` now type-checks
  against the v1 contract instead of being rejected.
- fce8836: `role.create` joins the RoleCapability union, and it is the first one a permission set cannot hold
  
  The server catalog gained an ORGANISATION-SCOPED capability. `role.create` names no
  Role — the Role does not exist yet when you create one — so it is held org-wide
  rather than inside a Role, and a permission set's `capabilities` are keyed to ONE
  Role.
  
  It is in the union because the union mirrors the server's catalog, which is what
  `GET /roles/:roleId/capabilities` answers from. Sending it on
  `POST`/`PATCH /roles/:roleId/permission-sets` is refused with
  `400 ORG_SCOPED_ONLY_ROLE_CAPABILITY`: the row would satisfy the column's
  constraint and be read by nothing.
  
  Nothing else in the SDK changes. The union is wider by one member, so code that
  switches exhaustively over `RoleCapability` will want a branch for it — a UI
  offering it as a tickable permission-set row is the case worth checking, because
  the server now refuses that write.
- b55a52f: The SDK README documents `client.chat`
  
  `README.md` is in this package's `files` array, so it is the page npm renders for
  `@agent-nexus/sdk`. Measured against the published `1.0.0` tarball: the whole README
  scored **one** occurrence of the word "chat", and it was `promptAssistant.chat` in the
  timeouts table — against 30 for "agents". A customer landing on the package page saw no
  chat surface at all, while the package shipped a full one.
  
  `## API Reference` now opens with a Chat section covering:
  
  - **The headline** — the wire format is the Vercel AI SDK 7 UI Message Stream
    (`x-vercel-ai-ui-message-stream: v1`, terminated by `data: [DONE]`), so a stock
    `useChat()` renders a Nexus agent with no custom transport.
  - **The two hops**, as a runnable pair: the customer's server mints with the org API key,
    the browser streams with the short-lived token. The point of the split is that the API
    key never reaches a browser, so it is stated as the reason rather than as a step.
  - **`createBrowserChatClient`**, which is how a browser reaches these routes without
    holding a placeholder API key.
  - **The `useChat` door** — `streamRaw` from a `POST` handler and `resumeRaw` from a `GET`
    handler, forwarded verbatim, which is what `useChat({ resume: true })` needs.
  - **The control surface** — `stop`, `status`, `resume`, `resumeRaw`.
  
  And the four things a chat UI gets wrong without being told:
  
  1. **Branch on `status().outcome`, never on the frames.** A stopped turn has no single
     wire shape — it is the provider's. One deployment ends `abort` → `finish`; another
     ends `data-nexus-error` → `error`, with no `abort` frame at all, because the provider
     surfaced the cancellation as a failure. `outcome` reads `"stopped"` on both.
  2. **`stop` reports acceptance, not effect.** Frames keep being written after the 200.
  3. **The resume cursor is exclusive**, and a resumed stream opens with a synthesised
     opener per block still open — one per open block, not one `text-start` — carrying no
     `id:` line, so it must not move the cursor.
  4. **One credential, never two.** A request carrying both an API key and a session token
     is refused with a message that reads like an expired token.
  
  Every TypeScript sample in the section is extracted from the README and typechecked
  against the package's own declarations, and the two-hop example was run end to end
  against a live deployment.

## 1.0.1
### Patch Changes

- 66aaa85: A chat turn can be stopped, watched and picked back up
  
  Three routes have been live since the browser chat surface shipped, and neither
  package could reach any of them:
  
  ```
  POST /public/v1/deployments/:deploymentId/chat/stop
  GET  /public/v1/deployments/:deploymentId/chat/status
  GET  /public/v1/deployments/:deploymentId/chat/stream
  ```
  
  They are the Stop button, "is a turn still running", and the reconnect after a
  reload — most of what separates a chat demo from a chat product. All three take
  the same **chat-session token** as `chat/chat`, so a browser holding one already
  has the credential for every one of them.
  
  ## `@agent-nexus/sdk`
  
  **`client.chat` gains four methods.**
  
  ```ts
  const auth = { token };
  
  // The Stop button.
  const { accepted, turnId } = await client.chat.stop(deploymentId, {}, auth);
  
  // The fact the stop route deliberately does not claim.
  const { running, outcome } = await client.chat.status(deploymentId, auth);
  
  // Reattach — parsed frames, or the raw Response for a proxy.
  for await (const chunk of client.chat.resume(deploymentId, auth, { lastEventId })) { … }
  const upstream = await client.chat.resumeRaw(deploymentId, auth, { lastEventId });
  ```
  
  **`accepted` is not "the turn has stopped".** The abort reaches the pod running
  the generation through a fire-and-forget publish, so no value the stop request
  can compute knows whether it landed. Deltas keep arriving for a few hundred
  milliseconds afterwards and the terminal frames land about a second and a half
  later. `status()` is where the fact lives, as `outcome: "stopped"` — the stream's
  own `finish` frame says `finishReason: "other"`, which cannot tell a stop from
  anything else that ended a turn early.
  
  **`RequestOptions` gains `onEventId`, and it is what makes resume usable
  twice.** A frame iterator yields parsed `data:` payloads, so the SSE `id:` field
  — which on this API IS the resume cursor — was dropped on the floor; a caller
  could only reattach from the start of a turn, and a text block accumulates by
  APPENDING, so that reprints the answer. `stream()` and `resume()` both take it,
  and it fires after each frame has been consumed.
  
  **Two properties of a resumed stream that a client has to know about.**
  
  - **The cursor is exclusive.** `lastEventId: "<turn>:13"` replays from `:14`, so
    the two halves of the answer join with no overlap and no gap. Omit it and the
    whole turn replays, which is right for a page that reloaded and holds nothing.
  - **The first frame reopens a block you are already inside.** A cursor lands
    mid-block, so the server synthesises a `text-start` with the SAME block id and
    no `id:` line of its own. It carries no cursor because it is not a log entry,
    and the SDK does not filter it out: a stock reader THROWS on a `text-delta`
    whose opener it never saw.
  
  `ChatTurnStatus.lastEventId` is the newest frame **recorded**, not the newest you
  received, so it is the wrong value to reattach with after a drop — it would skip
  everything written in between. Use the cursor you kept.
  
  ## `@agent-nexus/cli`
  
  **`nexus chat` gains three verbs.**
  
  ```
  nexus chat stop   <deployment-id> --chat-id <uuid> [--turn-id <id>]
  nexus chat status <deployment-id> --chat-id <uuid>
  nexus chat resume <deployment-id> --chat-id <uuid> [--last-event-id <id>]
  ```
  
  Each names its conversation with `--chat-id` (a session is minted for it) or with
  `--session-token` (an existing one is reused). **Neither is optional**: a mint
  with no chat id reserves a NEW conversation, so all three would answer
  truthfully about a conversation that has never had a turn — `status` all-null,
  `stop` `accepted:false`, `resume` empty — and none of those looks like a mistake.
  
  `chat send` and `chat resume` now print the cursor of the last frame they
  received when the stream ends, as `last-event-id <id>` or as the `lastEventId`
  field under `--json`. That is the value `--last-event-id` takes, so a turn cut
  short by a dropped connection can be picked up exactly where it stopped.

## 1.0.0
### Major Changes

- 68f9438: `DocumentSummary.chunkCount` and `.embeddingStatus` are removed — they never had
  a source
  
  Both were declared on `DocumentSummary` and answered `null` on every response
  since the day each shipped. Not sometimes, not before processing finished — on
  every request, for every organization, for the whole life of both fields.
  
  Neither had a source anywhere in the platform. `chunkCount` and
  `embeddingStatus` are field names on NO model in the schema, and no writer
  exists for either; the backend filled both with a literal `null`. The only other
  place either name appeared was a pair of Swagger EXAMPLE payloads on an
  internal, non-v1 controller, sitting beside other invented keys — which is the
  likeliest provenance of the declaration, and which made the fields read as real
  to anyone who went looking. Those are deleted too.
  
  The two doc comments were the sharpest part of the problem: _"or `null` before
  processing"_ on both promised a value that arrives later, and none ever did.
  
  There were two honest endings — read the right column, or stop publishing the
  field. There is no right column. `Document.zeroEntropyStatus` is adjacent and is
  NOT the same thing (it is the ZeroEntropy index state, not an embedding status),
  and no chunk count exists on the model to pair with it, so filling them would
  have published a guess as a fact.
  
  ## What changes for a caller
  
  Both routes serving this shape lose a key:
  
  - `GET /api/public/v1/documents`
  - `GET /api/public/v1/documents/:documentId/children`
  
  - the JSON responses lose two keys, so `doc.chunkCount === null` was true and is
    now false, and `"chunkCount" in doc` was true and is now false
  - TypeScript consumers get a compile error, which is the good direction
  - a JS consumer reading `doc.chunkCount` moves from `null` to `undefined`
  
  No caller can be relying on a value, because there has never been one.
  
  This is the same call NEX-3864 took on `ExecutionNodeResult.logs` and
  `ExecutionOutput.outputType`, on different endpoints, for the same reason: a
  published field teaches every consumer to handle a value, write a branch for it,
  and wait for it.

## 0.27.0
### Minor Changes

- c257b1b: Add `createBrowserChatClient()` and fix `fetch` losing its receiver in a browser.
  
  A page holding only a chat-session token now has a supported way to reach the
  chat routes. `NexusClient` requires an organization API key and must keep
  requiring one — it wires forty resources and thirty-eight of them have no other
  credential — so the browser case was previously served only by constructing
  `HttpClient` with a placeholder key, which is indistinguishable from a real key
  that has been revoked. `HttpClientOptions.apiKey` is now optional, and a request
  that resolves to NO credential is refused by name before it is built rather than
  being sent unauthenticated.
  
  `HttpClient` also now binds the global `fetch` to `globalThis`. Stored unbound,
  `this.fetchFn(...)` invoked it with the client as its receiver. Node does not
  care what a `fetch` receiver is; the DOM does, and in a browser the first
  request came back as a REJECTED PROMISE carrying `TypeError: Failed to execute
  'fetch' on 'Window': Illegal invocation`.
  
  The rejection is the part worth stating precisely, because it decides how the
  failure is detected. `fetch` returns a Promise on every path, so this never
  surfaces as a synchronous throw — a receiver check that reports by rejecting is
  invisible to any probe that classifies by `try`/`catch` around the call alone.
  A nullish receiver is fine: `undefined` and `null` coerce to the global, so a
  bare `fetch(url)` is safe and only a NON-nullish foreign receiver — an object
  or a class instance, which is exactly what `this` is here — is refused.
  
  Every Node-based test passed either way, so the defect was invisible to this
  package's whole suite, to `tsc` and to the response-contract manifest.

### Patch Changes

- c829d24: A browser can mint its own chat session, without a key reaching it
  
  `POST /public/v1/deployments/{deploymentId}/chat-session/anonymous` is a second
  mint for the same short-lived browser credential, for the caller the first one
  has no answer for: a first-party embed served from a static host, where no
  server of ours or theirs is in the request path and there is nobody to hold an
  API key.
  
  The deployment opts in, per deployment, with
  `securitySettings.allowAnonymousChatSessions`. It is absent on every existing
  deployment and absent means off, so no widget in the estate gained a door — and
  it is deliberately separate from `visibility`, which is `"public"` by default on
  every new embed and would have opened all of them at once.
  
  Every refusal is the same refusal. Unknown deployment, wrong channel, inactive,
  not opted in, private, and an Origin outside the owner's allowlist all answer
  `404 Deployment not found`, byte for byte. A distinguishable one would let
  anyone sweep ids and keep whichever answered differently.
  
  The anonymous door is narrower than the org-key one on every axis: it takes no
  body, so it cannot resume a conversation somebody else is in, and cannot claim
  an `externalUserId` — the identity HMAC is over a server-side secret a browser
  cannot hold. Use `chat.createSession` from a server whenever you have one; it
  can do both of those and this cannot.
  
  ## `@agent-nexus/sdk`
  
  **No new method, and the response contract moves.** The generated response
  contract carries every v1 route, so this one is now projected in it. The SDK has
  no method for it because `NexusClient` throws without an API key and this
  route's principal presents none — so this client cannot construct the caller the
  route exists for. A method would be `chat.createSession` with the same
  credential and less capability. It becomes writable when a credential-less
  client exists.
- f219c72: A browser chat session can be minted and streamed
  
  `POST /public/v1/deployments/:deploymentId/chat` ships an agent turn as a Vercel
  AI SDK 7 **UI Message Stream** — the format `useChat` reads with no
  configuration. Neither package could reach it. Both can now.
  
  The route is authenticated by a short-lived **chat-session token**, not by the
  organization API key, and that is the whole shape of the feature: a customer's
  SERVER mints a token scoped to one deployment and one conversation, and the
  BROWSER holds only that. An API key can read every conversation in the
  organization and must never ship to a browser.
  
  ## `@agent-nexus/sdk`
  
  **`client.chat` — both hops.**
  
  ```ts
  // on your server
  const session = await client.chat.createSession(deploymentId, {
    externalUserId: user.id,
    identityHash: hmac(user.id)
  });
  
  // wherever the token is held
  for await (const chunk of client.chat.stream(deploymentId, { content: "hi" }, { token })) {
    if (chunk.type === "text-delta") process.stdout.write(chunk.delta);
  }
  ```
  
  `stream()` yields parsed `ChatStreamChunk` frames. `streamRaw()` hands back the
  `Response` **unread**, which is the `useChat` door: `ai`'s own transport reads
  the response HEADERS, and a frame iterator has already discarded them. A Next.js
  route handler proxying to Nexus is three lines:
  
  ```ts
  const upstream = await client.chat.streamRaw(deploymentId, await req.json(), { token });
  return new Response(upstream.body, { headers: upstream.headers });
  ```
  
  **`RequestOptions` gains `chatSessionToken`, and it REPLACES the api-key rather
  than accompanying it.** The server tries the api-key credential first and
  short-circuits on it, so a request carrying both authenticates as the api-key and
  is then refused `401 "Chat session is not valid."` — a message that reads like an
  expired token while the token is perfect. Every door of the transport now
  resolves its credential through one method that returns exactly one header, so
  the two cannot be sent together.
  
  `ChatStreamChunk` is exported as the SDK's whole 28-member union rather than the
  subset this API emits today, so a `switch` written against it stays exhaustive
  when a producer appears. What a turn actually carries is documented on the type.
  
  **Treat any 401 from the streaming route as "this credential is finished"** and
  mint a fresh session. Expired, revoked, wrong deployment and forged all answer
  identically, deliberately, so the refusal cannot be used to learn which ids are
  real.
  
  ## `@agent-nexus/cli`
  
  **`nexus chat` — two verbs.**
  
  ```
  nexus chat session <deployment-id>        # mint a token for a browser
  nexus chat send <deployment-id> -m "hi"   # mint + stream one turn, rendered live
  ```
  
  `chat send` performs both hops in one command, so the split is visible in
  `--help` rather than described somewhere: it mints with the API key and streams
  with the TOKEN. Text arrives delta by delta as the model produces it — there is
  no second call and no "processing" handoff, unlike `nexus emulator send`.
  
  Under `--json` one document is printed when the turn ends,
  `{"session":{…},"chunks":[…]}`, holding every frame in order. A turn that streams
  an `error` frame, or finishes with `finishReason: "error"`, exits non-zero
  through the ordinary error funnel — the stream opening successfully says nothing
  about whether the turn worked.
  
  **This runs the real agent on a real deployment**: real tools, real side effects,
  real cost. It is the production door the embedded widget uses, not the emulator.
- a775efd: The shipped response contract learns the browser chat resume, stop and status routes
  
  `src/response-contract.generated.ts` is a projection of the published v1 schemas,
  so three new routes on the browser chat surface move it. Regenerated with
  `pnpm --filter @agent-nexus/sdk run gen:response-contract`; the diff is exactly
  those three rows and no existing route's shape changed.
  
  | route                                        | payload                                                 |
  | -------------------------------------------- | ------------------------------------------------------- |
  | `GET /deployments/:deploymentId/chat/stream` | `undeclared` — `rawResponse`, an SSE stream             |
  | `POST /deployments/:deploymentId/chat/stop`  | `{ accepted, turnId }`                                  |
  | `GET /deployments/:deploymentId/chat/status` | `{ turnId, running, outcome, lastEventId, frameCount }` |
  
  **No SDK method accompanies them, and that is permanent rather than pending.**
  All three are authenticated by a chat-session token in `x-chat-session-token` — a
  credential minted for a BROWSER. `HttpClient` sets `"api-key": this.apiKey` on
  every request, so a method here could not present the credential the route
  admits. `V1_ROUTES_WITHOUT_AN_SDK_METHOD_CEILING` rises 59 → 62 for them, and
  its docblock now separates the four rows that can never fall from the rest of
  the ledger, which is ordinary debt.
  
  Teaching `HttpClient` a second credential is explicitly the wrong fix: this is a
  server-side SDK whose threat model is that its key never leaves a server, and
  the two-hop chat-session design exists so an org key does not ship to a browser.

## 0.26.0
### Minor Changes

- d33b8ce: A credential now says which tool it can actually be spent on
  
  `service` is a display LABEL, and for a tool credential it is the tool's public
  name — which nothing makes unique. An organization held two ACTIVE credentials
  reading `service: "Apify"`, both scoped to the Pipedream tool *named* Apify,
  while the Apify-type tool that actually needed one ("Google Maps Reviews
  Scraper") had none. Read off `credential list`, those two rows say "Apify is
  already connected". They are not: executing the other tool with either answers
  400 `Credential not found or does not belong to this tool/organization`.
  
  Every value in that payload was correct. It just did not contain the field that
  separates the two tools, so no consumer could have reached the right answer
  from it.
  
  ## What is new
  
  `Credential.toolId` — the external tool a credential is scoped to, and the same
  id `tools.credentials(toolId)` takes. `null` for `oauth_connection` and
  `api_key_connection`, which are organization-wide and belong to no single tool.
  
  `ListCredentialsParams.toolId` narrows the list to one tool, so an empty result
  means NOT CONNECTED rather than "no label matched". This is not cosmetic: an
  unimplemented query param is not inert — unknown keys were stripped, so a
  `toolId` filter used to return the entire unfiltered page, which reads as
  "every one of these matches".
  
  The filter matches tool credentials only. ORing in the organization-wide sources
  would put credentials the tool cannot be executed with into the answer to "what
  can I run this tool with" — the same false "already connected", behind a flag
  that looks precise.
  
  ## CLI
  
  `nexus credential list` gains a `TOOL ID` column and a `--tool-id <id>` flag:
  
  ```
  $ nexus credential list --tool-id bba3c3e2-7c56-4136-a2dd-4af480ad393f
  No results.
  ```
  
  The id is printed in full rather than abbreviated — it is the argument of
  `nexus tool credentials` and of `--tool-id`, so a cut one is a value the reader
  has to go and look up again.
- 679a10e: A `doWhile` now says whether it converged or gave up at `maxIterations`
  
  `GET /workflows/executions/:executionId/nodes/:nodeId` — `client.workflowExecutions.getNodeResult()`,
  `nexus execution node-result` — carries a new `terminationReason` field.
  
  A do-while that stopped because its continue-conditions went false and one that
  stopped because it hit `maxIterations` produced identical results: node
  `COMPLETED`, `output` = the array of pass results, `error: null`. With
  `maxIterations` defaulting to 100, an unconverged retry loop read as a success.
  Counting passes does not separate the two either — a loop capped at 3 that
  converged on its third pass and one that gave up at the cap both report three.
  
  ```ts
  const node = await nexus.workflowExecutions.getNodeResult(executionId, doWhileNodeId);
  if (node.terminationReason === "max_iterations_reached") {
    // the loop ran out of attempts; it did NOT converge
  }
  ```
  
  `condition_not_met` (the loop finished), `max_iterations_reached` (it did not),
  `condition_error` (evaluating the conditions threw — previously swallowed and
  indistinguishable from a satisfied condition), or `cancelled`. It is `null` on
  every other node type, and `null` on a do-while recorded before this shipped —
  absence means "not recorded", never "converged".
  
  The rest of the node result is unchanged: `output` still holds one entry per
  pass, in order.
- 384296f: A track can be finished, handed over, listed and read
  
  Four fields the tracks data model has carried since it shipped had no route
  behind them, so the only way to write or read one was a direct database
  statement.
  
  ## `@agent-nexus/sdk`
  
  **`tracks.setStatus(trackId, { status })` — this is how a track FINISHES.**
  `DONE` removes it from `tracks.listReady()` on the very next call, through the
  one predicate that read already runs. There is nothing to invalidate.
  
  There is no delete, and that is the design rather than an omission: a track's
  diary, its events and its memory ARE the record of how the work went, and all
  three are children of the row that would be destroyed with it. Every status is
  reachable from every other one, because work genuinely goes backwards — a track
  marked `DONE` that turns out not to be takes one call, not an escape hatch.
  `IN_REVIEW` deliberately stays in the ready set: work waiting on a reviewer is
  still work somebody can pick up.
  
  **`tracks.setNextOwner(trackId, { nextOwner, nextOwnerRef })` — the per-turn
  handover.** `nextOwner` is published on every row of the ready set and is what an
  agent reads to decide whether it may proceed at all, and it was writable only at
  `create` — the one moment a handover value is least interesting.
  
  🔴 **`nextOwnerRef` is written on every call and never merged.** Omit it and the
  watcher reference is cleared in the same statement. That is what keeps the pair
  legal: the server admits a ref only alongside `EVENT`, so a partial update that
  left an `EVENT`-era ref behind while moving to `USER` would be refused for a
  field you did not send. A ref sent with `CUE` or `USER` is a 400 that names the
  field, rather than a database constraint name reaching you as a 500.
  
  **`tracks.list(params?)` and `tracks.get(trackId)`.** `listReady()` was the only
  track-level list, and it is a FILTERED read — no `DONE`, no `BLOCKED`, nothing
  held by a dependency. So a track you finished was a real, addressable row that no
  method could list, and an empty ready set read exactly like an empty
  organization. `list()` answers what EXISTS, in `number` order, optionally
  narrowed to one `status`; `get()` answers one track, or 404 — the same answer a
  foreign id gives, deliberately indistinguishable from it.
  
  **`slug` now travels on every ready row**, and on `list` and `get`. The row is
  where a caller picks a track, and the only other short handle is the
  `number`, which the server mints and which means nothing outside its own
  organization.
  
  New exported types: `Track`, `TrackStatus`, `SetTrackStatusBody`,
  `SetTrackStatusResponse`, `SetTrackNextOwnerBody`, `SetTrackNextOwnerResponse`,
  `ListTracksParams`, `ListTracksResponse`. `ReadyTrack` gains `slug`.
  
  ## `@agent-nexus/cli`
  
  Four commands: `nexus tracks set-status <trackId> --to <status>`,
  `nexus tracks set-next-owner <trackId> --to <owner> [--ref <ref>]`,
  `nexus tracks list [--status <status>] [--limit <n>]` and
  `nexus tracks get <trackId>`.
  
  `nexus tracks ready` prints a `SLUG` column.
  
  **`set-status` rather than `status`.** A leaf named `status` promises a verdict a
  script can branch on and must carry that answer in its exit code; this is a
  write, with no verdict to carry. `set-next-owner` follows it so the pair reads
  the same way, and both match their SDK methods exactly.
  
  `--ref` is cleared whenever it is omitted, for the reason above — it is not a
  convenience, it is what stops the next handover failing on a field nobody sent.
- 78954ca: Deleting a loop says what it took, and takes all of it
  
  `DELETE /workflows/:id/nodes/:nodeId` answered `204 No Content`. On an ordinary
  node that is the whole truth. On a `loop` or a `doWhile` it is not: the container
  takes **every node scoped inside it**, and **every edge touching any of them** —
  including its own inbound and outbound edges, which connect nodes *outside* the
  container and leave them unconnected.
  
  Measured against a live stack: a workflow of 9 nodes and 6 edges, one `DELETE` on
  the loop, and afterwards 3 nodes and 0 edges. The response was four keys, none of
  which was a count. The only way to learn what had gone was to `get()` the
  workflow before and after — and by then it is gone.
  
  ## `@agent-nexus/sdk`
  
  **`workflows.deleteNode()` returns `NodeDeleteResult` instead of `void`.** Three
  arrays, answering three different questions:
  
  | field | answers |
  |---|---|
  | `deletedNodeIds` | what went — the requested node first, then its body in graph order |
  | `deletedEdgeIds` | which connections went with them, boundary edges included |
  | `severedNodeIds` | what is left holding a stump: nodes that SURVIVED and were the far end of a deleted edge |
  
  `severedNodeIds` is the half an enumeration of the casualties still cannot
  answer. Those are exactly the nodes `validate()` will start reporting as
  `DISCONNECTED_NODE`, and naming them is the difference between knowing the
  deletion happened and knowing what to repair.
  
  The route now answers `200` with a body. That is additive: a caller who ignored
  an empty body ignores this one, and `deleteNode()` already awaited a response it
  threw away.
  
  ## `@agent-nexus/cli`
  
  **`nexus workflow node delete` prints what it deleted.** It used to print a fixed
  `Node deleted.` with `{workflowId, nodeId}` — a CLI confirmation, because there
  was nothing from the server to report.
  
  ```
  ✓ Deleted 6 node(s) and 6 edge(s).
    workflowId: …
    nodeId: …
    deletedNodes: 6
    deletedEdges: 6
  ⚠ 2 surviving node(s) lost an edge to this deletion and are now unconnected on that side.
    Severed: 58b3a655-…, fa124e18-…
  ```
  
  Under `--json` the three id arrays are in the document. The severed-node line
  goes to **stderr** and the exit code stays `0`: the deletion succeeded, and a
  non-zero exit would claim a failure that did not happen — the same shape
  `nexus asset delete` uses for `objectRemoved`.
  
  ## The cascade is now transitive, and it was not
  
  Both packages inherit a second fix. The cascade collected only DIRECT children,
  so a container nested inside the deleted container was removed while its own body
  stayed — carrying a `parentId` naming a node that no longer exists.
  
  That is not a miscount. An orphaned `doWhileStart` cannot be deleted directly
  (`NODE_DO_WHILE_START_DELETE_FORBIDDEN` says "delete the parent doWhile node
  instead") and the parent it names is the node that just went, so nothing in the
  API could remove it, and `validate` did not report the dangling `parentId` at
  all. Deleting a container now takes its descendants at every depth.

### Patch Changes

- 9430e73: A failed node test no longer publishes the failure as the node's contract
  
  `nexus workflow node test` (and `workflow test-node`, the same endpoint) writes
  the run's output back onto the node: `testExecutionId`, `runOutput`, and an
  `outputFormat` inferred from what the node emitted. That inferred schema is what
  downstream nodes read to offer `{{upstream.field}}` variables, so it is the
  node's published contract.
  
  The write-back ran on **every** settled run, including a failed one — and the
  inner service does not throw on a failed node test, it *returns*
  `{error, errorDetails, timestamp}`. So a run that failed published the shape of
  its own failure:
  
  ```json
  {"type":"object","properties":{"error":{"type":"string"},"timestamp":{"type":"string"},
   "errorDetails":{"type":"object","properties":{"type":{"type":"string"},
   "message":{"type":"string"},"nodeType":{"type":"string"}}}}}
  ```
  
  Every downstream node was then wired against a schema that only exists when this
  node breaks. The same response also reported `status: "COMPLETED"` for that run,
  so nothing on the surface said the test had failed.
  
  **A failed run now writes back nothing but `testExecutionId`.** `outputFormat`
  and `runOutput` keep whatever the last **successful** test left — an untested
  node stays untested rather than acquiring a fictional contract — and
  `testExecutionId` still moves, because pointing at the failed run is exactly
  what a caller debugging it needs.
  
  **`status` now reports the outcome.** `"FAILED"` when the node threw (the error
  envelope is still in `data`), `"COMPLETED"` when it ran, `"PENDING"` when the run
  went asynchronous. `TestNodeResult.status` was previously documented as *not* an
  outcome flag; it is one now.
  
  The discriminant is explicit rather than sniffed. `WorkflowNodeTestResponse`
  gains a `failed: true` arm, so a real executor output that happens to carry
  `error` / `errorDetails` / `timestamp` keys is still treated as output — the
  shape alone never could tell the two apart.
  
  ## `@agent-nexus/cli`
  
  `workflow node test` and `workflow test-node` help now state what a failed run
  writes back, and that `status` is `"FAILED"` for one.
  
  ## `@agent-nexus/sdk`
  
  `TestNodeResult`'s docstring documents the three `status` values and the failed
  run's write-back behaviour.
- 25cbc5c: A node write that cannot be applied is refused instead of reported as done
  
  Three writes through `PATCH /workflows/:id/nodes/:nodeId` answered 200 with
  `configStatus: "complete"` and kept the previous value. One of them contradicted
  itself inside the same response body. Nothing separated applied from discarded,
  so a builder read the 200 as confirmation and then read several runs of the old
  configuration as results from the new one.
  
  All three are now a 400 that names the constraint and the repair (NEX-4075).
  
  - **`branching.data.type` will not leave logic mode.** Switching to `prompt`
    while `logic[]` held populated conditions answered 200 with `"type":"logic"` in
    the same response. It is now `400 BRANCHING_TYPE_LOCKED`, and the message
    carries the one-request repair — `{"data":{"type":"prompt","logic":[]}}`, since
    a top-level array replaces wholesale.
  - **`loop.iterationsSetup` discarded every non-`variable` handler.** The field is
    stored as the node's `instructions` and only a variable reference survives that
    conversion, so `handler: "manual"` left the previous iteration source in place.
    It is now `400 ITERATIONS_SETUP_HANDLER_UNSUPPORTED`, naming both supported
    ways to supply the list.
  - **A top-level `type` was stripped by the request schema.** `{"type":
  "manualTrigger","data":{…}}` returned 200 with the type unchanged, and a body
    carrying only `type` failed with "At least one of 'data' or 'parentId' must be
    provided" — an error about the envelope that never said `type` was unwritable.
    It is now refused by name, and the message points at `nexus workflow trigger`.
  
  ## `@agent-nexus/sdk`
  
  `UpdateNodeBody` declares `type?: undefined`, so passing a node type to
  `workflows.updateNode` is a compile error instead of a key the server discards.
  `workflows.replaceTrigger` is where a trigger type changes. No runtime behaviour
  changed.
  
  ## `@agent-nexus/cli`
  
  `nexus workflow node update --help` now states that a top-level `type` is refused
  by name rather than silently dropped, and where a trigger type is actually
  changed. No command, flag or output shape changed.
  
  Both refusals cover what a request WRITES and deliberately not what is already
  stored: a node the canvas left in prompt mode with conditions, or one already
  holding an unsupported handler, stays editable through this door.
- fe1bfb7: `workflow get`'s `agentInputSchema` answers for the LIVE graph, not the draft trigger
  
  `agentInputSchema` is the field an operator reads to answer "what does my
  published skill accept". It was the `Workflow.agentInputSchema` column, which
  every graph write re-derives from the **draft** `agentInputTrigger` — while a
  workflow skill is only ever invoked against `publishedNodes`. So a published
  workflow whose trigger was edited without a republish advertised parameters no
  caller could send, and `publish` refuses the republish that would have made them
  real (`WORKFLOW_ALREADY_PUBLISHED` — "Unpublish first to re-publish").
  
  On a `PUBLISHED` workflow the three v1 read surfaces — `GET /workflows/:id`,
  `GET /skills/workflows` and `GET /skills/workflows/:id` — now derive the field
  from the published graph's own agent trigger. A published graph carrying no
  agent trigger reports `null`: it accepts nothing, which is what every write door
  already stores for that same graph. A `DRAFT` is unchanged — it has no published
  graph to differ from — and so is a published workflow that was never snapshotted.
  
  **Nothing is hidden.** The draft's parameters are on the same response, under
  `.nodes[] | select(.type=="agentInputTrigger") | .data.parameters`, beside the
  `publishedNodes` snapshot they differ from. Only the workflow-level field moved.
  
  ## `@agent-nexus/cli`
  
  - `workflow get --json` reports the live contract in `agentInputSchema` for a
    published workflow. A script that diffed it against `.publishedNodes` to detect
    drift now finds them in agreement by construction; diff `.nodes` instead.
  - The `workflow get` notes say which graph the field is read from, and where the
    draft value lives on the same document.
  
  ## `@agent-nexus/sdk`
  
  No shape change. `WorkflowDetail.agentInputSchema` and
  `WorkflowSkill.agentInputSchema` document which graph the value is read from, so
  a consumer reading it in an editor is not told it echoes their last write.
  
  ## Also
  
  `GET /skills/workflows` is the attach surface: what it reports is what an
  operator copies into `agent-tool create --type WORKFLOW`. Reporting the draft is
  what made `LiveWorkflowSchemaGuardService` refuse a body this very endpoint had
  just handed out — that refusal is now unreachable through a copy of a live read.
- c6427d6: `nexus workflow node create --type <anyTrigger>` could put a second trigger into
  a workflow, and nothing could take it out again.
  
  A workflow runs from ONE trigger: every start path takes the first trigger-typed
  node it finds. The create door already refused a second REAL trigger — but the
  `selectTrigger` placeholder every new workflow is born with was not counted, so
  the create was accepted beside it, and `nexus workflow trigger` then replaced the
  FIRST trigger-typed node, which was the placeholder. The workflow ended up
  holding two live triggers, `node delete` answered `403
  NODE_TRIGGER_DELETE_FORBIDDEN` on both, and `workflow validate` called the graph
  `isValid: true, readyToPublish: true`. A test run reported COMPLETED while
  `execution node-result` answered `NOT_FOUND` for every node in the second
  trigger's subtree.
  
  ## What changed in the CLI's help
  
  - **`workflow node create`** now says a trigger type is refused with `409
    NODE_DUPLICATE_TRIGGER` while the workflow's trigger slot is taken — and that
    a new workflow's slot is taken from birth, by the placeholder. A trigger is
    installed with `nexus workflow trigger`, never added beside it.
  - **`workflow node delete`** now states the one exception to the trigger refusal:
    a trigger-typed node CAN be deleted while another real trigger remains. That is
    the repair for a workflow already holding two, and for a stale `selectTrigger`
    left standing beside a real trigger. The 403 returns the moment the last real
    trigger is the one being deleted.
  - **`workflow validate`** lists all four `graphIssues` types instead of two, and
    documents the new `MULTIPLE_TRIGGERS`, which reports each surplus trigger and
    names the node to delete.
  - **`workflow node-types`** notes that trigger types answer 409 at `node create`
    while the slot is taken.
  
  ## SDK
  
  `ValidationReport.graphIssues[].type` gains `MULTIPLE_TRIGGERS`, and
  `INVALID_EDGE`, which the report already produced and the union never listed.
  
  No CLI behaviour changes: every one of these is a server-side refusal or report
  the CLI passes through.
- 2153c80: The shipped response manifest learns the browser chat stream
  
  `response-contract.generated.ts` is a projection of every Public API v1 route, so
  it moves whenever the contract does. `POST /public/v1/deployments/:deploymentId/chat`
  joins it as `ChatSendMessageStream`, with `payload: { kind: "undeclared", why:
  "rawResponse" }` — the same entry the emulator stream carries, and for the same
  reason: the route sends `text/event-stream` rather than the `{success,data}`
  envelope, so there is no payload shape for a caller to check.
  
  **No SDK method comes with it, deliberately.** That route is authenticated by a
  chat-session token in `x-chat-session-token`, and `HttpClient.requestSSE`
  hardcodes `"api-key": this.apiKey` — this SDK cannot present the credential the
  route admits. Its client is the browser holding a token minted for it, reading
  the stream through the AI SDK's own transport. The route is ledgered in
  `v1-routes-have-an-sdk-method.test.ts` with that reason rather than left
  unaccounted for.
  
  What a consumer of this package sees: one more row in the manifest, no new
  method, no behaviour change to any existing call.

## 0.25.0
### Minor Changes

- 7cdc86d: `nexus tracks create` — a track can be made, can say what it is doing, and can
  report how far along it is.
  
  The Tracks domain shipped twenty-one Public API v1 routes and no way to create a
  track. Every one of those routes addressed a row nothing in the product could
  produce: the writer existed in the store with integration-test callers and
  nothing else. Two more fields were published and unreachable.
  
  ```bash
  nexus tracks create --slug billing-rewrite --title "Billing rewrite"
  nexus tracks current-step <trackId> --text "waiting on the design review"
  nexus tracks rollup <trackId>
  ```
  
  `client.tracks.create()`, `client.tracks.updateCurrentStep()` and
  `client.tracks.readRollup()` back them.
  
  🔴 **The track's `number` comes back, it is never sent.** It is allocated from a
  per-organization sequence inside the transaction that inserts the row, so it runs
  from 1, never repeats and never gaps — a caller-supplied number would be handed
  out again later and refused on somebody else's create. `slug` is unique per
  organization; a duplicate is a 409.
  
  ⚠️ **`tracks current-step` takes exactly one of `--text` and `--clear`.** Neither
  is refused and both is refused, deliberately: an omitted `--text` meaning "clear
  it" is a footgun, because a shell variable that expanded to nothing would silently
  wipe the line. `currentStep` is the line `nexus tracks ready` prints, and it was
  the one column no route could write.
  
  ⚠️ **`tracks rollup` returns counts, never a percentage** — divide them yourself,
  because a caller handed a percentage cannot recover the counts. It counts LEAVES
  ONLY at any nesting depth, so one parent holding three children reads `0/3` and
  never `0/4`. A track with no tasks reads `0/0`, and so does a track belonging to
  another organization: the read is anchored on your key's organization, so a
  foreign id matches no rows, and the two are deliberately indistinguishable.
  
  `tracks create` and `tracks current-step` need the `tracks:write` scope;
  `tracks rollup` needs `tracks:read`.

## 0.24.0
### Minor Changes

- b53c3c2: `nexus template delete <id>` exists, and the namespace help no longer says it cannot.
  
  A document template could be created and never removed. `nexus template --help` listed
  `create`, `folder`, `generate`, `get`, `list` and `upload` and no `delete`, and both
  plausible routes answered `Cannot DELETE` — while the dashboard has deleted templates the
  whole time through `DELETE /api/document-templates/:id`. So this was a v1/SDK/CLI parity
  gap, never a retention policy: every template a script or a test created stayed in a
  surface users browse, and stayed a live source of generatable documents.
  
  - `nexus template delete <id> [--yes]`, following the sibling pattern — `confirmable()`
    for the flag, `confirmDestructive()` for the refusal, so a script without `--yes` and no
    terminal refuses rather than destroying.
  - `client.skills.deleteDocumentTemplate(id)` on the SDK, behind
    `DELETE /public/v1/skills/document-templates/:templateId`.
  - **Refused with `409` while anything still points at the template** — an AI task rendering
    its output through it, an agent task, or an agent carrying it as a skill. `err.details`
    names the dependents, because "detach it first" is only actionable if the caller is told
    from what. Detaching an agent skill needs `agent_skills:delete`, which `skills:delete`
    does not imply; the help says so before you start.
  - The namespace help block that read _"A TEMPLATE CANNOT BE DELETED … a mistake is clutter
    nobody can clear, carrying whatever customer data it was filled with"_ is replaced by what
    delete does and does not take. It does not take the documents already generated from the
    template: generation writes no row and the URL it returned is the only reference that will
    ever exist, so those files stay in storage exactly as they did before.
- ad7060b: `nexus tracks` — the whole track loop reaches the terminal.
  
  A track is a unit of work with a dependency graph, a section tree, a task tree,
  the agents working it, an append-only log and a byte-budgeted memory. The domain
  shipped across eight phases with no public door: the only way in was a single
  `tracks task claim` registration posting to a route that did not exist yet, which
  was there so the collision banner had a command to name.
  
  Twenty-one Public API v1 routes now back `client.tracks` and the `nexus tracks`
  namespace. The loop is four calls:
  
  ```
  nexus tracks ready
    → nexus tracks task ready <trackId>
    → nexus tracks task get <taskId>
    → nexus tracks task claim <taskId> --agent <agentId>
  ```
  
  then `tracks task toggle` when the work is done, `tracks diary append` for what
  happened, and `tracks agent beat` in between to say the agent is still alive.
  `tracks section`, `tracks plan import`, `tracks memory` and `tracks event` cover
  the rest.
  
  🔴 **Read `banner` on every task you read.** Nothing in this domain reserves a
  region of a track or refuses a second worker — collision avoidance is a live
  instruction riding in the task payload, and it is the FIRST field on the wire so
  an agent acting top-down sees it before it acts. A claim on a task another agent
  holds SUCCEEDS and overwrites: claiming and taking over are one operation, which
  is why there is no take-over command to look for.
  
  ⚠️ `--agent` on `tracks task claim` took `<name>` and the route resolves an OPEN
  agent BY ID, so an agent that pasted the holder's name out of the banner's own
  "another agent is working on this" line got a 409 that named nothing. The
  placeholder says `<agentId>` now. The command, its parents and the flag are
  unchanged, so nothing that scripted it breaks.
  
  Seven scope resources rather than one — `tracks`, `track_sections`,
  `track_tasks`, `track_agents`, `track_diary`, `track_memory`, `track_events` — so
  a key can read the ready set and append to the log without being able to
  restructure a plan.

### Patch Changes

- e563bdb: A 429 is honoured instead of being thrown at the user
  
  The transport already retried a proxy 5xx and a dropped connection with jittered
  exponential backoff. It did not retry a **429**, and it read `Retry-After` on no
  code path at all — so the one failure the server tells you how to recover from
  was the one the client gave straight back to the user, with the server's own
  answer discarded.
  
  That server DOES state an answer. `PublicApiThrottlerGuard` ends with
  `res.header("Retry-After", timeToBlockExpire)` before it throws, and the value is
  whole seconds until the block lifts.
  
  ## `@agent-nexus/sdk`
  
  **A 429 is now retried, and the server's `Retry-After` decides the wait.**
  
  Both forms RFC 9110 permits are read: `delay-seconds` (what this API sends) and
  an HTTP-date (what a CDN in front of it may send). A header that is neither —
  absent, empty, `later`, `12abc`, `-5`, `1.5` — falls back to the existing
  backoff curve. It never falls back to **zero**, which would turn a rate-limit
  response into a hot loop against the server that just asked for room.
  
  **A 429 is replayed for every method, POST and PATCH included.** This is the one
  place the idempotent-method restriction does not apply, and it is safe for a
  structural reason rather than a convention: the 429 is thrown from a NestJS
  *guard*, and a guard runs to completion before the route handler is entered. No
  handler ran, so there is no effect to duplicate. A 502 is different in kind — an
  ambiguous *outcome* where the upstream may have applied the request — so it stays
  restricted to `GET`/`HEAD`/`OPTIONS`/`PUT`/`DELETE`, unchanged.
  
  **No idempotency keys, deliberately.** The Public API v1 does not read an
  `Idempotency-Key` header. The only inbound reader anywhere in the server is
  `POST /broker/v1/cards/:handle/invoke`, a surface this SDK never calls. Sending
  the header would be a protocol the server ignores, so the method restriction
  above is the whole safety argument.
  
  **The retry sequence is bounded twice, and the two bounds are independent:**
  
  | Option | Default | Bounds |
  |---|---|---|
  | `maxRetries` | `2` (three attempts) | how many times we ask |
  | `maxTotalRetryWaitMs` | `60_000` | how long we are prepared to wait in total |
  
  A `Retry-After` that **does not fit the remaining budget is refused, not
  capped**. A capped wait would send the next attempt while the block is provably
  still live — a guaranteed second 429 that also spends the budget — and would hide
  from the user that the real wait was an hour. The error instead carries the
  number the server actually asked for, in `retryAfterMs` and in its message.
  
  A budget that is already spent fits **nothing**, including a stated wait of `0` —
  which is why `maxTotalRetryWaitMs: 0` accepts no server-stated wait at all. A
  zero-length wait subtracts nothing from the budget, so honouring one would leave
  `maxRetries` as the only bound on a sequence the second bound is supposed to
  stop.
  
  `NexusApiError` gains two optional fields: `attempts`, present once a request was
  retried, and `retryAfterMs`, present only on that refusal.
  
  `NexusClientOptions` gains `maxRetries`, `maxTotalRetryWaitMs` and `onRetry`;
  none were forwarded to the transport before, so a consumer could not configure
  retrying or observe it.
  
  ## `@agent-nexus/cli`
  
  **A command that spends forty seconds waiting now says so**, on **stderr**:
  
  ```
    Retrying in 2s — HTTP 429, requested by the server (attempt 2 of 3)
  ```
  
  Never on stdout, and not suppressed under `--json`: `--json` promises exactly one
  parseable document on stdout, and the caller most likely to be running unattended
  in a script is the one that most needs to know why a command took a minute.
- 6fc78c3: Publish the shipped response contract for `POST /deployments/:deploymentId/chat-session`.
  
  The SDK's `V1_RESPONSE_CONTRACT` is a projection of the v1 schemas and is regenerated
  whenever a route declares one. This adds the browser chat-session mint's payload shape
  (`token`, `sessionId`, `chatId`, `expiresInSeconds`), so a caller validating responses
  against the manifest recognises the route instead of falling through the unknown arm.
  
  No SDK method yet — the `chat` resource lands with the streaming surface it credentials.

## 0.23.0
### Minor Changes

- 6bbe209: A client can now SEE a response that no longer matches the shape its route publishes
  
  `HttpClient` has three read boundaries that hand a caller a value typed `T`, and
  none of them looked at it: the envelope path of `requestWithMeta` (whose guard
  tests `success === true` and `"data" in body`, so it checks the ENVELOPE and
  nothing about the payload), its non-envelope passthrough, and each frame of
  `requestSSE`. A field the server renames therefore reaches the caller under a
  type that no longer describes it, and nothing anywhere says so.
  
  The three instruments that already watch this chain all read a SINGLE tree, so
  the case none of them can reach is the ordinary one: an INSTALLED client talking
  to a server that moved on without it.
  
  ## What is new
  
  `NexusClientOptions.onResponseContract` and `HttpClientOptions.onResponseContract`
  take a reporter that is told, for every read, whether the payload matched the
  shape its route publishes:
  
  ```ts
  const client = new NexusClient({
    apiKey,
    onResponseContract: (report) => {
      if (report.state === "mismatch") console.warn(formatContractReport(report));
    }
  });
  ```
  
  `formatContractReport`, and the types `ContractReport`, `ContractIssue`,
  `ContractReporter`, `ResponseContractState`, `RouteShape`, `PayloadShape` and
  `RouteShapeManifest`, are exported alongside it.
  
  ## What it does to your data: nothing
  
  The payload is returned UNCHANGED, in every state. The reporter observes; it
  never substitutes, strips or defaults. A checker that returned its own parsed
  output would delete every field it did not know about — so an older client
  against a newer server would quietly lose the new fields, which is the drift
  this detects wearing the cure.
  
  ## Three outcomes, never two
  
  `passed`, `mismatch`, and `unchecked` with a reason. A route publishing no
  response schema, a 204, an empty body and a streamed frame are all `unchecked`,
  so none of them can be mistaken for a payload that was examined and found good.
  
  ## Off unless you ask
  
  With no reporter installed nothing is checked, no shape is consulted, and the
  client behaves exactly as it did before. A reporter that throws is caught and
  ignored — an observer must not fail a request that succeeded.
  
  The shapes ship as generated data derived from the published v1 schemas. No new
  dependency: the package still declares none, and the built bundle carries no
  Zod and no `@nexus/types`.
- 7c5daef: `NodeTypeSchema` gains `nonExecutable`, so a caller can tell a live node type from a dead one before run time
  
  Four node types — `gptTask`, `polling`, `imageGen`, `surfer` — were offered by
  `client.workflows.listNodeTypes()` with a full label, description and category,
  accepted by `createNode()` at **201**, reported `configStatus: "complete"` with
  `missingFields: []`, and passed `validate()` as `readyToPublish`. Every
  execution of one threw `Node type <type> not found`.
  
  So every surface an SDK consumer could read BEFORE running a workflow said the
  node was healthy, and the only thing that disagreed was the run itself. A
  workflow containing one could be published and would fail in production.
  
  ## The field
  
  `NodeTypeSchema` gains an optional `nonExecutable?: { reason: string }`, returned
  by `client.workflows.getNodeTypeSchema(type)`.
  
  It is present **only** on a type the workflow engine cannot dispatch, and the
  reason names the working alternative where one exists — `aiTask` for `gptTask`,
  a `plugin` node on an image-generation tool for `imageGen`. Branch on its
  presence before offering a type to a user or writing a node of it.
  
  ⚠️ **Absent rather than `{ reason: "" }` or a `false` flag when the type CAN
  run.** The check is a presence test, so there is no third state to interpret —
  the same shape `guide` already uses.
  
  ## What changed on the server at the same time
  
  - **`createNode()` and the batch route now refuse one**, with
    `NODE_TYPE_NOT_EXECUTABLE` and the same reason string. A node that could never
    have run is no longer creatable.
  - **`validate()` reports it as a critical error**, so a workflow holding one is
    no longer `readyToPublish`.
  - **`updateNode()` still accepts one.** That is deliberate: the stored nodes are
    real, and a caller must be able to edit a workflow that already contains one.
    Refusing there would make those workflows permanently uneditable over changes
    that never touched the dead node.
  
  The types stay listed and stay describable, so a caller holding a stored graph
  that contains one can still read its schema and its guide. What changed is that
  the failure now arrives at the write, naming the type, instead of at the run.

### Patch Changes

- c7de914: A node-type field publishes the values it accepts
  
  `FieldDefinition` on a node-type schema carried `type` and nothing else, and
  `type` is PROSE: `'"hours" | "minutes" | "days"'` reads like a union and is a
  documentation string. A client that wanted to offer a picker, validate before
  sending, or explain a rejection had to parse English.
  
  `values?: string[]` is the machine-readable half. It is served on every field
  whose accepted set is closed, and the server refuses anything else on write with
  `400 NODE_FIELD_VALUE_INVALID`.
  
  ```ts
  const schema = await client.workflows.getNodeTypeSchema("scheduleTrigger");
  const interval = schema.fields.required.find((f) => f.name === "interval");
  interval?.values; // ["seconds", "minutes", "hours", "days", "weeks", "months"]
  ```
  
  Three things worth knowing before acting on it:
  
  - **The empty string is always accepted**, regardless of the list. It is the
    ordinary mid-configuration state of these fields, and several node types ship
    it in their `defaultData`.
  - **`values` may be WIDER than `type` names, never narrower.** `type` is what the
    field ADVERTISES; `values` is what the server ACCEPTS. `parallelai.searchMode`
    advertises the three current pipelines and also accepts three legacy aliases
    that still resolve to one of them.
  - **Absent `values` is not "any value works".** It means nothing on the server
    can say which values do — the field is not value-checked at all.
  
  The published sets are taken from the code that consumes each field rather than
  from the schema's own prose, so two of them are wider or differently spelled than
  what the API used to document: `scheduleTrigger.interval` now names all six units
  `intervalToCron` honours (it advertised three, while `weeks` and `months` have
  been working anchor-aware cadences all along), and
  `newsMonitorTrigger.monitorProvider` names `PARALLEL_AI` / `EXA` rather than the
  lowercase spellings it published, which the deploy-time guard has always
  rejected.
  
  Additive: `values` is optional and no existing field changed shape.

## 0.22.0
### Minor Changes

- 7d6539a: A prompt-assistant thread now says HOW LONG it has been working, and the wait can happen on the server
  
  Two gaps, one cause: `status` was the only thing a thread told you about itself.
  
  ## 1. `generating` was not observable
  
  `status: "generating"` says the prompt is being written. It does not say whether
  that started two seconds ago or forty minutes ago — and it reads identically to a
  thread whose assistant asked a question and has been waiting for a human ever
  since. A consumer with no way to tell those apart invented a state of its own and
  reported a live generation as needing clarification.
  
  `getThread` now carries `createdAt`, `updatedAt` and a `progress` object measured
  by the server:
  
  ```ts
  const thread = await client.promptAssistant.getThread(threadId);
  
  thread.progress.state; // "generating"
  thread.progress.elapsedSeconds; // 214 — time in THIS state, not the thread's age
  thread.progress.lastActivityAt; // the heartbeat: advances while it works
  thread.progress.isTerminal; // no terminal set to re-derive, and none to get wrong
  thread.progress.serverTime; // the clock elapsedSeconds was measured against
  ```
  
  `isTerminal` is the field to branch on. Deriving "which statuses are final" by
  hand is what shipped a four-value union that omitted `cancelled`, and a wait loop
  built on it polled a stopped thread until its own deadline.
  
  ## 2. Detecting completion meant polling
  
  `waitForThread` hides the poll but still pays for it: every pass downloads the
  entire transcript, and a 26-minute generation is dozens of full-thread responses
  to observe one state change.
  
  `awaitThread` moves the loop behind the API. One request, held by the server
  until the thread finishes:
  
  ```ts
  let result = await client.promptAssistant.awaitThread(threadId, {
    afterMessageCount: before.messages.length
  });
  while (result.outcome === "timed-out") {
    result = await client.promptAssistant.awaitThread(threadId, {
      afterMessageCount: before.messages.length
    });
  }
  console.log(result.thread.promptResult?.prompt);
  ```
  
  ⚠️ **It returns before a long generation finishes, and that is normal.** The
  proxy in front of the API cuts a request at 60 s, so the hold is capped at 55 s
  and `outcome: "timed-out"` means "not yet — ask again". The work never stopped;
  do not resend the message, because a resend is a second user turn.
  
  `afterMessageCount` matters whenever a turn was just sent: the server does not
  reset `status` when a new user message arrives, so a thread left `completed` by
  an earlier turn would otherwise answer instantly with that stale verdict.
  
  ## CLI
  
  ```bash
  # the same wait, one request instead of a poll loop
  nexus prompt-assistant await-thread <thread-id>
  nexus prompt-assistant await-thread <thread-id> --wait-timeout 30 --after-message-count 4
  
  # and get-thread now prints the progress block
  nexus prompt-assistant get-thread <thread-id>
  ```
  
  `get-thread --wait` is unchanged — it still blocks for as long as you ask, on the
  client side. Reach for `await-thread` in a hook or a script that only needs to
  know when the prompt is ready.
- c8c90e0: A Role can be paused, and pausing stops its WORK rather than its access
  
  `client.roles.pause(roleId)` / `client.roles.resume(roleId)`, and
  `nexus role pause` / `nexus role resume`. A paused Role's workflows and agents
  are refused execution until it resumes.
  
  ## 🔴 It reaches 2 of the 6 kinds a Role can hold
  
  Read this before reporting what a pause achieved, because the honest answer is
  narrower than the word:
  
  | kind                | off switch                               | stopped by a pause? |
  | ------------------- | ---------------------------------------- | ------------------- |
  | `workflow`          | `Workflow.status = PAUSED`, guarded      | ✅ stops            |
  | `agent`             | `Agent.status = PAUSED`, guarded         | ✅ stops            |
  | `deployment`        | `isActive`, **no execution-guard tier**  | ❌ keeps serving    |
  | `ai_task`           | **none**                                 | ❌ keeps running    |
  | `document_template` | `DRAFT \| SAVED` — not on/off            | ❌ unaffected       |
  | `external_tool`     | a status on the **shared catalogue row** | ❌ untouchable      |
  
  The last one is not an oversight left for later: that row is shared across
  tenants, so no per-Role state may touch it without reaching every other tenant
  holding the same tool. Call `client.roles.listSystems()` / `nexus role systems`
  first — on a Role whose systems are deployments and AI tasks, a pause changes
  nothing a customer would notice.
  
  ## 🚨 It changes no access, and the opposite reading does not exist on purpose
  
  Nothing the Role grants is suspended, narrowed or revoked, and every member
  reaches afterwards exactly what they reached before. There is no verb that
  suspends a Role's access, deliberately: a Role is the exclusive holder of the
  resources it owns and the permission family is subtractive, so emptying its
  grants would **publish** every collection and workspace it was the last holder
  of to the whole organization — the opposite of what "suspend its access" sounds
  like.
  
  ## Idempotent, and the first stop is the one that survives
  
  Pausing an already-paused Role succeeds and returns the **original** `pausedAt`.
  That field answers _since when_, and re-stamping it would destroy the only
  record of the original stop, so a double-click, a retry, or two operators
  reacting to one incident all resolve with the same answer.
  
  ⚠️ **There is no `changed` flag, and its absence is the contract.** `pause()`
  resolving with a `pausedAt` you did not set means _somebody already stopped this
  Role_, which is a SUCCESS. Do not retry or alarm on it. `role.pausedAt` is the
  answer.
  
  ## `@agent-nexus/sdk`
  
  - **`roles.pause(roleId)` and `roles.resume(roleId)`**, both resolving with
    `RolePauseStateResponse` (`{ role: Role }`).
  - **`Role` gains `pausedAt: string | null` and `pausedByUserId: string | null`.**
    `pausedAt` is ISO 8601; `null` means the Role is running.
  - **`RoleCapability` gains `"role.pause"` and `"role.resume"`.** They are a pair
    rather than one value: an on-call permission set that may restart a Role
    somebody else stopped, without being able to stop one itself, is a real
    audience a single capability cannot express.
  
  ⚠️ **The two new `Role` fields are additive on the wire and a compile error for
  one shape of consumer**, exactly as `Workspace.kind` was. Anything that only
  READS a `Role` is unaffected. Anything that CONSTRUCTS a `Role` object literal —
  a fixture, a mock, a hand-rolled double — now fails to compile until it supplies
  both. That is the good direction: the break is at build time.
  
  ⚠️ **`RoleCapability` widening breaks an exhaustive switch.** A consumer that
  maps every member of that union to something now has two unhandled cases.
  
  🔴 **`pausedAt` set with `pausedByUserId` null is a real and reachable state, and
  it is NOT "running".** The column clears when the user who paused it is deleted,
  so a paused Role outlives its pauser. Read the stop off `pausedAt` alone;
  `pausedByUserId` decides only whether you can name a person.
  
  ## `@agent-nexus/cli`
  
  - **`nexus role pause <role>` and `nexus role resume <role>`.** Both take a name
    or a UUID. Their `Notes` carry the census above.
  - **`nexus role get` now prints `Paused at` and `Paused by`** — it is the command
    an operator runs when a Role's workflows are not firing, so hiding the stop
    there would hide it in the one place it is looked for.
  
  ⚠️ **Pausing needs `role.pause` and resuming needs `role.resume`, and holding one
  does not imply the other.** Check before stopping a Role you cannot start again.
  
  ⚠️ **A 403 on resume has two causes and only one is about you.** `role.resume`
  not held is curable by asking the Role's owner. An organization that has opted
  out of Roles is not — the error `code` is `FEATURE_NOT_ENABLED`, nobody in that
  organization can reach the command, and the Role's systems are running
  regardless, because the server declines to enforce a Role stop for an opted-out
  organization.

### Patch Changes

- fc80b57: A blank environment variable no longer defeats the default it sits beside
  
  `??` fires on `null` and `undefined`. `""` is neither. So an environment
  variable that is SET AND EMPTY wins a `??` chain and the default beside it is
  unreachable — and a blank env var is not exotic: `NEXUS_BASE_URL=` in a `.env`,
  or `export NEXUS_BASE_URL=$SOMETHING_UNSET`, both produce it.
  
  ## `@agent-nexus/sdk`
  
  **`new NexusClient()` no longer sends requests to the empty string.**
  
  ```ts
  const baseUrl = opts.baseUrl ?? getEnv("NEXUS_BASE_URL") ?? "https://api.nexusgpt.io";
  ```
  
  `getEnv` returns `process.env[key]` verbatim, so a blank `NEXUS_BASE_URL` made
  `baseUrl` the empty string, every request resolved against a relative path, and
  the documented default one operand to the right was never reached. It now takes
  the first PRESENT value.
  
  The two `??` chains beside it are unchanged and were checked rather than
  rewritten: `apiKey` is followed by `if (!apiKey) throw` and `organizationId` by
  a truthiness test, so a blank is already caught in both.
  
  ## `@agent-nexus/cli`
  
  Seven places rendered a blank where they promised a fallback. All are display
  paths — the command still does the same work, it just no longer prints nothing
  in place of a label:
  
  - **`nexus workspace list`** — a blank org name swallowed the `orgId` fallback,
    leaving the column empty instead of identifying the org.
  - **`nexus execution ...`** — a blank node label swallowed the `nodeId`
    fallback, so a node in the tree could not be identified at all.
  - **`nexus vibe deploy-state`** — a blank ref name printed an empty string where
    the fallback is a sentence saying no ref head matches the commit.
  - **`nexus emulator`** — a blank tool name printed nothing instead of `tool`.
  - **`nexus ... --format table`** — a folder named `""` rendered as an empty
    cell, where the formatter's contract is a dash.
  - **the auto-update notice** — a blank cached version reached the user-facing
    message.
  
  Both packages carry a small local blank-aware helper rather than importing
  `firstNonBlankOr` from `@nexus/types`. Both publish standalone and hold
  `@nexus/types` as a devDependency, so an import would emit a `require` for a
  package their `dependencies` do not declare — it would install cleanly and throw
  on first call.

## 0.21.0
### Minor Changes

- 21e7929: `workflow node-type <type>` now answers with the node type's authoring guide
  
  `nexus workflow node-type aiTask` told you the SHAPE of an `aiTask` node — its
  fields, its defaults, how many edges it takes. It did not tell you the things
  people actually get wrong: which node type to reach for instead, what a
  configuration that RUNS looks like, or which writes the platform accepts at 200
  and then fails at run time.
  
  Each node type now carries a `guide`: one Markdown page, written from live runs
  against a real organisation rather than from source, covering what problem the
  type solves, when to pick it and over what, a minimal working configuration, the
  gotchas, and what it cannot do.
  
  ## `@agent-nexus/cli`
  
  - **`workflow node-type <type>` prints the guide below the schema.** The schema
    rows render exactly as before; the guide follows as a Markdown block.
  - **`--json` carries it as the `guide` string, in the same document as
    everything else.** The two channels are deliberately not split: a script and a
    reader get the same content.
  - A node type with no guide yet omits the key and prints nothing extra.
  
  ## `@agent-nexus/sdk`
  
  `NodeTypeSchema` gains an optional `guide?: string`, returned by
  `client.workflows.getNodeTypeSchema(type)`.
  
  ⚠️ **Additive, and it changes no existing field.** The value was already on the
  wire for nothing to read it: `NodeTypeSchemaResponseSchema` did not declare a
  `guide`, and Zod strips unknown keys — so a consumer parsing with the published
  contract would have silently discarded it. The schema declares it now, which is
  what makes the field reachable at all.
  
  This batch covers six of the eight trigger types: `agentInputTrigger`,
  `manualTrigger`, `pluginTrigger`, `scheduleTrigger`, `selectTrigger` and
  `webhookTrigger`. The remaining 35 node types follow on the same mechanism.
  
  ## Also
  
  **`newsMonitorTrigger`'s `description` said the node "cannot be created or
  replaced via the API". Only the REPLACE half of that was ever true.**
  `PUT /workflows/:id/trigger` does reject the type. `POST /workflows/:id/nodes`
  answers `201` — it refuses only `loopStart`, `doWhileStart` and `selectTrigger`
  — and what it creates is a second trigger node that no execution reaches and
  that cannot be deleted, because trigger nodes are `deletable: false`.
  
  The description now separates the two, because a reader who took the old
  sentence as "the API will stop me" was told the platform had a guard it does not
  have, and the damage it permits instead is permanent.
- b3f5f2b: An AI task can carry its few-shot examples as a field, instead of inside the prompt
  
  The platform already stored few-shot demonstrations, already showed a manager for
  them in the dashboard, and already replayed each pair as a user/assistant
  exchange ahead of the real input at inference. What it had no way to do was
  accept them over the public API. A create carrying `examples` answered success
  with the key stripped, and a task read back never mentioned the pairs it held —
  so the only place a demonstration could live was the prompt string itself. One
  reported prompt reached ~190K characters that way.
  
  `fewShots` is now a first-class field:
  
  ```ts
  const task = await client.skills.createTask({
    name: "Summarize Email",
    modelName: "gpt-4o",
    modelProvider: "OPEN_AI",
    generation: { expectedInput: "Raw email text", expectedOutput: "One sentence" },
    fewShots: [
      { input: "Dear team, the Q4 report is attached.", output: "Q4 report shared." }
    ]
  });
  
  task.fewShots; // [{ id, input, output }] — oldest first
  ```
  
  `TaskDetail` gains `fewShots`, and `CreateTaskBody` / `UpdateTaskBody` gain it as
  `{ input, output }` pairs. Both halves are required and must be non-empty: an
  empty one is not an empty example, it is a blank turn the model reads as an
  instruction to answer with nothing.
  
  ## On update it REPLACES, and that is the one field here that does
  
  The array sent becomes the task's whole set. `[]` clears it; omitting the key
  leaves the stored examples alone, like every other field on the PATCH. Whole-set
  replacement rather than per-example ids because a caller of this route never
  holds those ids — `getTask` is the only read that carries them — and an
  append-only field would leave "remove the third example" unexpressible.
  
  A `fewShots`-only update counts as a change and returns a `versionId`, so that
  field keeps its published meaning of "the body named a recognized field and
  something was written". The version snapshot covers the task's own fields and not
  its examples, so restoring one puts the prompt back and leaves the examples as
  the update left them.
  
  ## `examples` is refused, not dropped
  
  `examples`, `fewShotExamples`, `samples` and `demonstrations` are the names
  callers reach for, and all four are now a 400 that names `fewShots` — the same
  treatment `promptText` and `systemPrompt` get for the prompt. A write body that
  strips what it does not know and answers success is how this gap stayed
  invisible: you only found out by reading the task back and noticing the key was
  gone.
  
  ## Order is the caller's, and it is now stable
  
  The pairs are stored, read back and replayed to the model in the order they were
  sent. That was not previously guaranteed for a bulk write — the stored timestamp
  these are ordered by defaults to the transaction's, which is identical for every
  row written together, so the order fell to whatever the database returned.
  
  ## A task that carries examples can still be deleted
  
  `FewShot`'s foreign key to the task is `ON DELETE RESTRICT`, and the delete path
  never cleared those rows — so a task with demonstrations answered a database
  constraint error instead of deleting. That was already reachable through the
  dashboard's few-shot manager; making `fewShots` writable over the API would have
  made it the normal outcome. The demonstrations are now removed in the same
  transaction as the task.
  
  ## CLI
  
  `fewShots` is `--body` only on `task create` and `task update`, and `task get
  --json` reports it:
  
  ```bash
  nexus task create --name "Classify" --model-name gpt-4o --model-provider OPEN_AI \
    --expected-input "A ticket" --expected-output "bug | billing | other" \
    --body '{"fewShots":[{"input":"Card declined","output":"billing"}]}'
  
  nexus task get <id> --json | jq '.fewShots'
  ```
- cc4146e: An API deployment can stream a turn, instead of blocking and then polling
  
  `POST /public/v1/emulator/:deploymentId/sessions/:sessionId/messages/stream` is
  the streaming twin of the emulator send: same body, same effect on the
  conversation, but it holds the response open (`text/event-stream`) and emits the
  turn as it happens.
  
  Before this, the API channel had one shape: a POST that blocked for 10–60s, gave
  back `{chatId, messageId, debug.toolsInvoked}` and no text, and left the caller
  polling `GET /conversations/:chatId/messages` for the answer — against a
  persistence race that could land the final agent row AFTER the send returned. The
  embed widget had tokens, live tool activity and a settled final message the whole
  time, over its socket. A hosted app that wanted its own branding had to choose
  between an iframe and a spinner.
  
  ## The frames
  
  One JSON object per `data:` line, `start` first and `done` last:
  
  `start` (chatId/messageId, before the first token) · `token` (answer deltas) ·
  `thinking` (reasoning deltas) · `tool_call` (`started` then `completed`, sharing
  a `toolCallId`) · `message` (a row's final state) · `error` · `done`
  (`completed` | `failed` | `processing`).
  
  `thinking` and the leading edge of `tool_call` have no socket counterpart — the
  widget shows neither — so this surface is a superset of what the widget receives,
  not a copy of it.
  
  ## SDK
  
  ```ts
  for await (const event of client.emulator.streamMessage(depId, sessionId, { content: "hi" })) {
    if (event.type === "token") process.stdout.write(event.delta);
  }
  ```
  
  `HttpClient.requestSSE()` is the new transport underneath it — an async
  generator over a `text/event-stream` body. Leaving the loop early cancels the
  connection; the turn keeps running server-side and its result is still persisted.
  
  ## CLI
  
  `nexus emulator send <dep> <session> --text "…" --stream` prints the turn live.
  Under `--json` it still prints ONE document, `{"events":[…]}`, holding every
  frame in order.
  
  ## Additive
  
  The blocking send is unchanged, and so is every existing SDK method and CLI flag.
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
- 5f7b113: Cue conversation transcripts can now be exported, subagent traces included
  
  Cue persists everything a session did — every turn, every tool call and tool result, the
  reasoning behind each turn, the model and provider that produced it — and it does the same
  for every subagent the session spawns. None of that was reachable outside the product UI,
  so the population could not be used as data.
  
  Three routes, all read-only, all under one scope (`cue_transcripts:read`):
  
  ```ts
  // Which conversations exist, and how big each transcript is. No content.
  const { data } = await client.cueTranscripts.listConversations({ startDate: "2026-08-01" });
  
  // One conversation, whole.
  const transcript = await client.cueTranscripts.getTranscript(data[0].id);
  
  // Every conversation in a range, NDJSON by default.
  const corpus = await client.cueTranscripts.export({ startDate: "2026-08-01" });
  ```
  
  ```bash
  nexus cue conversations --start-date 2026-08-01
  nexus cue transcript <conversation-id> > session.json
  nexus cue export --start-date 2026-08-01 > corpus.ndjson
  ```
  
  ## A subagent's OWN transcript, not the summary it returned
  
  `agentThreads` carries one entry per spawned subagent, keyed by the tool-use id on the
  parent turn that spawned it, and each entry holds that subagent's complete transcript. The
  summary the subagent handed back to the main loop is what the lead saw; it is not what the
  subagent did, and only the second is useful as data.
  
  The split is not "assistant vs tool". A row belongs to a subagent thread only when it
  carries BOTH `parentToolUseId` and `agentName`. A row that names a teammate with no thread
  key is the SPAWN, and it stays on `mainThread` — that row is where the parent↔child link
  lives, so filing it under the thread would lose the lineage.
  
  ## Every document is versioned, and both routes emit the same one
  
  `schemaVersion` is `"cue.transcript/v1"`. A corpus on disk carries no URL, so the version
  travels on the document rather than on the route that served it — match on it before
  parsing. The per-conversation route and the bulk export emit the identical shape, so one
  parser serves both.
  
  ## The date window is `updatedAt`, not `createdAt`
  
  `startDate` / `endDate` bound when a conversation was last touched. That makes one
  parameter do two jobs: "sessions active in this period", and the incremental-refresh
  primitive — re-run with the previous run's `exportedAt` as `startDate` and you get exactly
  the conversations that changed. A `createdAt` filter could only answer the first, and would
  miss a session that started before the window and ran into it.
  
  ## `export()` buffers; the ROUTE streams
  
  `client.cueTranscripts.export()` and `nexus cue export` resolve the whole response before
  returning, the same as `analytics.export()`. The server writes one document at a time, so
  for a range wide enough to matter call
  `GET /api/public/v1/cue/transcripts/export` directly and consume the body as a stream —
  NDJSON is line-delimited precisely so a reader can.
  
  Both are rate limited to 5 requests per minute per organization: this is a bulk pull, not
  a poll.
- a3c20d8: An AI task can be run on another model per CALL, and `task duplicate` exists
  
  An AI task binds a prompt to a model. That binding is right for the prompt and
  wrong for the call: the same assessor runs over every record in a nightly sweep,
  where cheap and good-enough wins, and on the one record a human is about to act
  on, where the frontier model is worth many times more. Saying that needed two
  tasks — which means two copies of the prompt, and the prompt is the artifact you
  most want to keep single.
  
  ## `modelOverride` on execute
  
  `client.skills.executeTask()` takes an optional `modelOverride`, and
  `nexus task execute` takes `--model-name` / `--model-provider`:
  
  ```ts
  // The nightly sweep, cheap.
  await client.skills.executeTask(taskId, {
    input: notice,
    modelOverride: { modelName: "claude-haiku-4-5", modelProvider: "ANTHROPIC" }
  });
  
  // The same task, from a button, on its own model.
  await client.skills.executeTask(taskId, { input: notice });
  ```
  
  **Nothing is persisted.** The task keeps its binding, its versions are untouched,
  and every other caller of it is unaffected. The same field is accepted on a
  workflow's `aiTask` node, so a scheduled workflow and an on-demand run can share
  one prompt.
  
  - `modelName` and `modelProvider` are REQUIRED together. Half a pair is refused
    before any request leaves the CLI — completing it from the task's own config is
    how a task ends up addressing an Anthropic endpoint with an OpenAI model id.
  - **`temperature` is not overridable and is always the task's.** It is part of
    the reasoning rather than the routing.
  - **`customModelId` is NOT inherited.** A BYOM endpoint replaces the routing
    outright, so carrying a stored one into an override that names a platform model
    would accept the override and then silently ignore it. Name one in the override
    to route this call onto a custom endpoint instead.
  - The provider tuning (`thinkingLevel`, `reasoningEffort`, …) is not inherited
    either, matching what a model change already does on `task update`. It has no
    flag; send it under `--body`.
  
  ## `task duplicate` — the command the 409 has always recommended
  
  `POST /skills/tasks` refuses a byte-identical prompt with _"Consider editing the
  existing task or duplicating it instead"_, and nothing named `duplicate` existed:
  
  ```
  $ nexus task duplicate <id>
  error: unknown command 'duplicate'
  ```
  
  `client.skills.duplicateTask()` and `nexus task duplicate <id> [--name]
  [--description] [--model-name] [--model-provider] [--custom-model-id]` now serve
  it, and the 409 names only paths that exist — the override first, since that is
  what most callers arriving at it actually want.
  
  **The copy is the SOURCE for every field the body does not name**, which is the
  whole difference from calling create again. There, a field you leave out takes
  THAT route's default: an unsent `temperature` becomes 0.7 however the original
  was tuned, and `task get` returns no temperature at any value, so nothing you can
  read afterwards shows the change. That is not hypothetical — it is what a
  production "model-only" fork of a 94,268-char prompt actually did.
  
  Knowledge collections are the one field a copy does not carry: attaching one is a
  permission decision this path does not make.

### Patch Changes

- 8e8055f: `permissions` stops offering two resource types the route always refuses
  
  `nexus permissions grant --resource-type knowledge …` was refused with _"knowledge
  access is managed exclusively through Role grants, never through the generic
  Permissions API"_ — while `--resource-type`'s own help listed `knowledge` as an
  accepted value. The refusal is correct and is unchanged; the defect was that the
  only way to learn the value was ungrantable here was to send it and read the
  error.
  
  `knowledge` (a Collection) and `workspace` never carry a permission row at all —
  both are narrowed by a Role's grants, resolved live — so **every** route in this
  namespace refuses them, not just `grant`. They are now gone from the accepted
  values of:
  
  - `nexus permissions grant --resource-type`
  - `nexus permissions revoke --resource-type`
  - `nexus permissions access <resource-type>` (the positional)
  
  A wrong value is refused locally, naming the list, with no round trip. The
  namespace help now says where the two DO live (`nexus role collection-grants` /
  `grant-collection`, `nexus role workspace-grants` / `grant-workspace`) and that
  neither has a reverse read — nothing lists the Roles reaching one Collection.
  
  The narrowing is in the v1 contract itself rather than in the CLI's help, so the
  SDK's `GrantPermissionBody`, `RevokePermissionBody` and
  `listResourceAccess()` now type `resourceType` as the new
  `GenericGrantResourceType` — passing `"knowledge"` is a compile error instead of
  a runtime 400. Sending it over HTTP anyway is still refused, and the refusal
  still names the route that does answer.
  
  The same narrowing removes both values from the `permissions_*` **MCP tool**
  input schemas, which are projected from the same contract slot.
  
  `nexus permissions set-visibility` is unaffected: an organization CAN set
  `knowledge`'s and `workspace`'s org-wide visibility, and that command still
  offers both.

## 0.20.0
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
- d1b1dba: Every resource class is nameable from the package root
  
  Eight resource classes were exported from the internal resources barrel and
  missing from the package root, so no consumer could name them:
  
  `ChannelsResource` · `CustomModelsResource` · `CustomersResource` ·
  `DocsResource` · `KnownIssuesResource` · `MeResource` · `PhoneNumbersResource` ·
  `SkillFoldersResource`
  
  Nothing was broken at runtime — `NexusClient` constructs every resource
  internally, so `client.customers.list()` always worked. What was impossible was
  NAMING the class: constructing one over a custom transport, writing a typed
  double against it in a test, or an `instanceof` check.
  
  ## The root export is now derived, not restated
  
  The list was hand-maintained, which is why it drifted. `src/index.ts` now does
  `export * from "./resources"`, so membership is decided once — in the resources
  barrel — and the two cannot disagree again. This is the same fix as the
  `export type * from "./types"` already in that file, which replaced a hand list
  of 208 names against 329.
  
  ## `BaseResource` stays internal
  
  It is the abstract base every resource extends, and it is now withheld by being
  absent from the barrel rather than by being omitted from a list at the root.
  Every resource imports it from its own module directly, so nothing changes for
  this package — but "withheld" and "forgotten" no longer look identical, and
  publishing it would take a deliberate edit to the barrel.
  
  ## Additive
  
  Nothing is removed and no signature changes. Existing imports keep working.
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
- 6c6e4b0: `roles.update()` now reports which fields it actually changed.
  
  `RoleUpdatedResponse` gains `applied` — the field names the write really touched:
  
  ```ts
  const { role, applied } = await client.roles.update(roleId, {
    name: "Refunds and disputes",
    currency: "EUR"
  });
  // applied === ["name"]   ← currency was never a field here
  ```
  
  **Read it to tell "applied" from "discarded".** `PATCH /api/public/v1/roles/:roleId`
  accepts a key it does not know, strips it before the write, and still answers success. So
  the call above resolves with a Role whose name changed and whose currency never did — and
  until now nothing in the response separated the two. Re-reading the Role afterwards shows
  the name change and hides the loss, which is what made the failure so quiet: every
  observation a caller could make agreed with the request having worked.
  
  Only `name`, `jobDescription` and `ownerUserId` exist on this route. A Role's currency, its
  data-retention window, its paused state and its access card are all real product concepts
  with no field here, so reaching for one is the natural mistake rather than a careless one.
  
  **`applied` is derived from the PARSED body, never from the request.** That distinction is
  the whole value: reading the request back would report `currency` as applied and make the
  response lie in a new way rather than stop it lying. A field is listed when the schema
  accepted it, and `ownerUserId: null` counts — null CLEARS the owner, so it is a change,
  while an absent key is not.
  
  **Nothing that works today starts failing.** This is additive: the unknown key is still
  accepted and still discarded, and no request that succeeded before now returns an error.
  Refusing an unknown key outright would be a consumer-visible change — an ordinary client
  that GETs a Role, mutates one field and PATCHes the whole object back would break on its
  first request — so it is held separately, behind a traffic count that no request log
  currently retains.
  
  `applied` is never empty: a body that changes nothing is already a 400.
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
- 42e251c: The SDK reaches a Role's Overview lanes
  
  A Role's boards are how its systems are organised, and everything a Role holds
  lands in `Ungrouped` until something places it. Six routes now exist on public
  v1, and `client.roles` reaches all of them — so a Role provisioned through the
  API can be finished through the API instead of arriving as one undifferentiated
  pile that only a human with a browser could tidy.
  
  ```ts
  const { boards, cards } = await client.roles.listBoards(roleId);
  
  const board = await client.roles.createBoard(roleId, { name: "Automation" });
  await client.roles.moveBoardCard(roleId, "agent", agentId, { boardId: board.id });
  ```
  
  | method | |
  |---|---|
  | `listBoards(roleId)` | every lane, and where each card sits |
  | `createBoard(roleId, body)` | append a lane |
  | `reorderBoards(roleId, body)` | set the order of every lane |
  | `updateBoard(roleId, boardId, body)` | rename, recolour, or both |
  | `deleteBoard(roleId, boardId)` | delete a lane; its cards fall to Ungrouped |
  | `moveBoardCard(roleId, cardType, cardId, body)` | move one card, or unplace it |
  
  Scopes are `role_boards:read` and `role_boards:write` — a resource of their own,
  never `roles:*`, which would hand every board to everyone who can rename a Role.
  A scope gets a caller to the route and no further: the Role's own `board.view` /
  `board.manage` capability is evaluated against the API key's OWNER, so a key
  whose owner does not hold it is refused.
  
  ## Four things worth knowing before you call these
  
  ⚠️ **`boardId: null` is the Ungrouped lane, not a missing value.** It is a legal
  destination, so `moveBoardCard`'s body is required and nullable — `{}` will not
  silently unplace a card. Cards in no lane come back from `listBoards` with
  `boardId: null` rather than being omitted; a card absent from that payload does
  not exist, which is a different fact.
  
  ⚠️ **`cardType` values are lowercase** — `"agent"`, `"workflow"`, `"collection"`,
  `"workspace"`, `"external_tool"`, … — unlike the SCREAMING_CASE resource types
  elsewhere on this API. Only the eight kinds that have somewhere to store a
  placement are accepted; naming one of the six that do not is a `400` rather than
  a `200` for a move that did not persist.
  
  ⚠️ **`reorderBoards` asserts the WHOLE list.** The set you send must equal the
  Role's current boards or the write is refused `409` — silently renumbering a
  stale list would leave a board somebody else just created at a position nobody
  chose, and report success. A repeated id is a `400` instead: no refetch fixes it.
  
  ⚠️ **`deleteBoard` deletes the LANE, never the cards.** They fall back to
  Ungrouped, and `cardsUnplaced` counts how many did — so an empty board and a
  board holding nine systems do not answer alike.
  
  ## Types
  
  `RoleBoard`, `RoleBoardCard`, `RoleBoardsView`, `RoleBoardAccent`,
  `RoleBoardCardType`, `RoleBoardDeleted`, and the four bodies.
  
  `RoleBoardCard` carries **placement only** — no name, no status, no icon, and no
  position within its lane. The screen already holds that metadata from the reads
  that populate a Role's tabs; re-serving it would be a second source of truth.
  
  ⚠️ **A stored `accent` may hold a token that is no longer in the
  `RoleBoardAccent` union.** The palette grows and shrinks by editing an array
  rather than a database enum, and the column's CHECK is looser than the write
  schema — so a board created under an accent that was later retired still reads
  back with it. Do not switch exhaustively on it without a fallback branch.
  
  ⚠️ **`cardId` is a uuid for most kinds but NOT all.** Whether it is depends on the
  `cardType` beside it: a legacy owned-resource id lives in a loose TEXT column and
  may be any string. Do not assume a uuid when parsing one.
  
  Every one of these return types is now pinned against the v1 contract schema by
  `v1-response-types-match-the-contract.test.ts`. That pin is the durable half: it
  caught this changeset's own first draft inventing a `position` field on
  `RoleBoardCard` that the route has never sent.
  
  **Task graduation is deliberately absent** and has no SDK method.
  `POST /roles/:id/tasks/:taskId/graduate` sends the `CoverageFormula` tree grammar
  and moves a Role's published cost figure, which is the same reason v1 already
  refuses the workload and impacts writes.

## 0.19.0
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
- 16e19f3: Expose an access card's `constraint` on both surfaces that carry it.
  
  `CardVariableConstraint` (`pattern` / `enum` / `maxLength` / `format`) is the
  card's statement of what a consumer's value is allowed to be. It was absent from
  this package entirely — on `CardVariable` AND on `ParameterPolicy` — so the
  server stored and returned it while no typed consumer could read it, and the SDK
  could not send it either.
  
  Additive and optional on both interfaces, so no existing call breaks.

## 0.18.0
### Minor Changes

- 1713f2b: `RoleCoverageContribution` gains `formula` — the authored saved-work model behind that row's
  `personHours`, so a caller can check the figure and an editor can put the operands back.
  
  `RoleCoverage.workload` has always carried the authored DENOMINATOR, and the read contract's own
  header gives the reason: a reader shown _"18.29%"_ needs _"12 people × 35 h/week × 46 weeks"_ under
  it or the number is an assertion. A per-system `personHours` is the same claim one level down, and it
  shipped with no operands under it — so a client could render what a system saves and had no way to
  show, or re-edit, what that figure was computed from.
  
  `formula` is `CoverageFormula | null`, typed exactly as `workload` is. `null` means the stored JSON
  did not pass validation, with the reason in `integrity.warnings`; it never means _"no model"_, because
  a `RoleSystemImpact` row exists only because somebody authored one. A readable model always ships
  both the model and the figure, so a `null` formula beside a real `personHours` is a state the server
  does not emit.
  
  What this does NOT add is the raw stored row. Repairing a model that will not parse needs the
  unvalidated JSON, and that belongs to the authoring read rather than to the read for someone looking
  at a percentage.
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

## 0.17.0
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
- 27cd03b: Ten SDK response types omitted 24 fields the v1 contract declares, and one enum hid a live value
  
  The types under `packages/sdk/src/types/` are hand-written by reading the Zod
  contract. Reading is not a gate, and a drift gate already existed covering 102
  type pairs — these ten were outside it. A field the SDK omits is data the caller
  never learns exists: it arrives in the JSON, and the published type says it does
  not.
  
  **BREAKING for anyone who declares one of these types structurally.** Adding a
  required field to a published interface breaks an object literal that is checked
  against it. Consumers who only READ these types (the normal case) gain fields and
  break nothing.
  
  ### Response fields added, per type
  
  - `TraceSummary`, `TraceDetail` — `source`, `tags`, `triggeredBy`.
    `@agent-nexus/cli` now binds `--source` as a filter on `tracing traces`, so a
    caller could filter by a field the SDK's own result type said did not exist.
  - `GenerationSummary` — `cacheReadInputTokens`, `cacheCreationInputTokens`,
    `reasoningTokens`, `thinkingDurationMs`, `ttftMs`, `streamDurationMs`,
    `metadata`, `isAborted`, `temperature`, `finishReason`, `responseId`. Cache
    and reasoning token counts are cost inputs, and no SDK consumer could see them.
  - `GenerationDetail` — inherits the eleven above. `temperature` moves to
    `GenerationSummary`, where the contract declares it. `messages` and `tools`
    become `unknown[] | null` and `responseJson` becomes `unknown`; the previous
    `Record<string, unknown>` claimed a shape the contract does not promise.
  - `EvalResult` — `judgeStatus`, `executionError`, `judgeError`. Judging is a
    second dimension from execution, so a judge failure was indistinguishable from
    a row that was never judged.
  - `EvalSessionDetail` — `judgeFailedRows`.
  - `DeploymentDetail` — `inboundWebhook`.
  - `DocumentDetail` — `metadata`.
  - `ExternalToolDetail` — `documentation`.
  
  ### An enum that hid a live value
  
  `ApiKeyService` omitted `META_INSTAGRAM`, a real member of the `ApiKeyService`
  database enum. A caller could not name a connection the server accepts. This is
  the same defect class as `DeploymentType` (which declared a `SMS` the server
  rejects and omitted the real `INSTAGRAM`), found independently.
  
  `ApiKeyConnection.updatedAt` becomes optional, matching the contract's `nullish`.
  
  ### One fix in the other direction — the contract was the drifting party
  
  `ModelSummarySchema` omitted `source`. The backend's models repository emits
  `source: "system"` from `listSystem` and `source: "custom"` from `listCustom` on
  every row. The SDK's `ModelSummary` had it and was correct; the contract did not.
  The field is added to the schema, so the two agree and the pair becomes gatable.
  
  That change lands in `@nexus/types`, which is private and carries no changeset
  entry of its own — naming it here would make this a MIXED changeset (one ignored
  package, one released) and `changeset status` refuses those outright. Nothing
  about it is consumer-visible: no published package's types change because of it.
  
  ### The gate
  
  All ten pairs join `types-match-the-v1-contract.test.ts`, enforced by `tsc`. The
  ungatable remainder is ledgered with a reason per entry rather than left silent.

### Patch Changes

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

## 0.16.0
### Minor Changes

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
