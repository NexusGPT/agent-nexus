# @agent-nexus/cli

## 1.1.0
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
- 46f6f4d: A stuck board can name the rows that are holding it
  
  A board could read `127 of 156 done`, hold 29 open rows, and answer
  `nexus tracks task ready` with NOTHING — indistinguishable from a board that is
  nearly finished. The ready set is an anti-join computed inside the API and it
  publishes nothing about what it withheld, so no route named the offending edge
  and nothing escalated. Refusing such an edge at import was considered and
  rejected: a content-kind blocker holding its dependents is supported behaviour,
  so every candidate refusal predicate is a false refusal. The honest place to name
  the blocker is the moment a reader asks why nothing is ready.
  
  `nexus tracks task why-not-ready <trackId>` is that moment. It adds no route: it
  composes the three reads that already exist — the ready set, the whole plan and
  the task edges — and for every open row the ready set does not offer it names the
  rows holding it, says of each whether it is WORK or CONTENT, and says whether the
  blocker is released by ticking it or by finishing the work beneath it. A content
  row nobody would otherwise close now has a name. `nexus tracks task ready` also
  points at this command when it comes back empty, and pays for no extra request to
  do it.
  
  🔴 THE ANSWER IS RECONSTRUCTED ON THE CLIENT AND IS NEVER THE SERVER'S OWN
  REASON, and it says so in both channels — in the terminal and as a
  `reconstruction` field on the `--json` document. The materialised ancestry the
  server's ready-set query reads does not cross the wire, so the command rebuilds
  ancestry by walking `parentTaskId`. That agrees with the server while the two are
  in step and diverges exactly where they have drifted, which is one of the live
  failure modes here. When the two name different ready sets the command says so
  and picks no winner. `nexus tracks task ready` remains the sole authority on what
  may be picked up; nothing here computes that set.
  
  ⚠️ AN EDGE HUNG ON AN ANCESTOR HOLDS EVERYTHING BENEATH IT, and the held row's
  own edge list is empty. Composing on a task's own edges alone — the edges naming
  it as `blockedTaskId` — reports the held row as unexplained, and that is the
  shape a plan import produces. The output names the ancestor the edge is actually
  hung on.
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
- fa10ef6: The CLI can page a track list, and every ready read says which page it showed you
  
  `tracks.list()` gained `cursor`, `total`, `hasMore` and `nextCursor` on the SDK,
  and the changeset that shipped them recorded the CLI side as "No command
  changed." This is that command changing.
  
  ## `nexus tracks list --cursor`
  
  The token was in the `--json` document from the day the SDK carried it and **no
  flag accepted it**, so an organization past the 200-row ceiling could not
  enumerate its own tracks from the CLI in any spelling. `--cursor` now exists and
  round-trips the token.
  
  The terminal channel also prints what it is showing you — `50 of 240 matching
  row(s) shown` — and, when more remain, the exact command for the rest. That
  command carries the filters forward, because the cursor fingerprints
  `status`/`archived`/`nextOwner` and replaying it without them is refused with a
  400; and the token is shell-quoted, because an omitted status or next-owner
  encodes as `*`, so the default cursor is `50~*.exclude.*` and an unquoted paste
  into zsh dies on `no matches found` before the CLI runs.
  
  ## The three reads that could not say they were truncated
  
  `--limit` defaults to **50 server side** on `tracks list`, `tracks ready` and
  `tracks task ready`. Two of them said nothing about it and one said the opposite:
  
  - **`tracks ready`** listed four reasons a track can be absent — DONE, BLOCKED,
    archived, dependency-held — and omitted the fifth, which needs no flag to
    happen. The order is track number ascending, so the tracks a default page hides
    are always the newest.
  - **`tracks task ready`** said "truncated by `--limit`", which a reader who never
    typed `--limit` correctly reads as not applying to them.
  - **`tracks create`** went further and promised a new track "comes back as ready
    work on the very next call". That is true of the ready *predicate* and false of
    the *page*, and false precisely for the track just created: a new track takes
    the highest number and the set sorts ascending, so it is last in line.
  
  All three now state the default. The two ready reads also say their answer
  carries no `total` and no `hasMore`, because their response schemas genuinely do
  not — a partial page and a complete set are the same fifty rows there, and
  nothing on the wire distinguishes them.
  
  ## Two commands that demanded an id and never said where one comes from
  
  `tracks event append --agent` is required and uuid-only; `tracks diary append`
  takes `--agent`, `--task` and `--workspace`. None named the verb that mints one,
  and `tracks agent` sits under a different parent, so backing up one level does not
  find it either. All now point at `nexus tracks agent open` / `list`, at
  `nexus tracks task list`, and — for the workspace id — out of the namespace
  entirely to `nexus workspace list`.
  
  ## What changes for a caller
  
  Nothing breaks. `--cursor` is optional and omitting it reads the first page
  exactly as before. The page footer is terminal-only: `--json` documents are
  untouched, and already carried `total`, `hasMore` and `nextCursor`.

### Patch Changes

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
- 2ac1aa9: `nexus tracks task claim --help` now names where its required agent id comes from. The option is mandatory and the id can only be minted by another namespace, so the screen that demands it now points at `nexus tracks agent open` (which opens an agent and prints its id) and `nexus tracks agent list` (which shows the ones already OPEN on a track).
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
- cbf98b9: `tracks ready` and `tracks task ready` say when a page was cut
  
  Both ready responses now carry `hasMore`, read one row past the page. Before it, a
  full page and a complete set were the same output in EVERY channel: these routes
  carry no total and no cursor, so `--json` could not tell them apart either.
  
  The rows dropped are always the NEWEST — the statement orders by number ascending
  and a new row takes the highest — so the track you just created is the first to
  fall off. `tracks task ready` is the LIVE case, not a precaution: one production
  track holds 165 tasks against a default page of 50. `tracks ready` is the latent
  one.
  
  Three call sites, all of them:
  
  - `tracks ready` and `tracks task ready` render a footer when `hasMore` is true.
  - `tracks task why-not-ready` reads `hasMore` instead of inferring truncation from
    `ready.tasks.length >= READY_SET_CEILING`. That inference answers "did I get
    everything I ASKED for", never "is there more", and the two diverge the moment
    the server clamps below the request. The probe deliberately reads one row past
    the page and exceeds the server's own maximum by one, so `hasMore` is
    trustworthy exactly AT the ceiling — which is where the inference was weakest.
    `READY_SET_CEILING` stays as the limit that call requests; only the truncation
    claim moved to the wire.
  
  **The footer names the action, not a denominator.** These routes have no total to
  divide by, so there is no "x of y" to print; inventing one would be the same
  over-claim this change removes. The ceiling is not repeated either — `--limit`'s
  own description documents its range, and a third copy of `200` is a third thing to
  go stale, which is how this signal died quietly before it existed.
  
  **It is silent when `hasMore` is false.** A footer on a complete set is not just
  noise: it teaches the reader to skim the footer, so on the day it carries the
  warning it would not be read.
  
  The help strings that said the opposite are rewritten to the present truth. They
  still say there is no total and no cursor, because that remains true — these
  routes gained a truncation signal, not a paged surface, and `tracks list` is still
  the paged one.
  
  **Proved by mutation**, four of them, each reported against a prediction:
  dropping the guard reds only the quiet cases; forcing it off reds only the loud
  ones; emitting the footer outside `printEnvelope` reds the `--json` contamination
  assertion; and reverting `why-not-ready` to the length inference reds the
  truncation assertion on an envelope where the wire and the inference genuinely
  disagree — one ready row far below the ceiling, with `hasMore` true.
- 43b0468: `nexus role coverage --help` stops saying three rows are the only thing that moves the figure
  
  The note used to open "THREE ROWS MOVE THIS FIGURE AND NOTHING ELSE DOES". That
  was true when it was written and is not true now: a covered system's
  **lifecycle** decides whether its already-computed term joins the totals at all,
  and only a `LIVE` system is summed.
  
  It contributes no magnitude, so the three models — the Role's workload, each
  system's impact, and the organization's automation settings — are unchanged.
  But an operator who moved a system to `BUILDING` and watched the percentage drop
  was reading help text that said that could not happen.
  
  The note now reads "THREE ROWS PRODUCE THIS FIGURE", names lifecycle as the
  fourth thing that moves it, and states that a `BUILDING` or `RETIRED` system
  still reports its own hours on its own row while sitting outside every total.
- 3a3d451: `nexus role` stops warning that emptying a Role's grants publishes to the whole organization
  
  The warning on the Role suspend/delete paths said that emptying a Role's grants
  "PUBLISHES every collection and workspace it was the last holder of to the whole
  organization". That was true under the old subtractive rule and is now the
  opposite of what happens.
  
  Narrowing on Collections and Workspaces is an allow-list keyed on the CALLER's
  own placement. Emptying a Role's grants returns the resource to the set no Role
  has claimed — every caller placed in no Role reaches it, and **every
  Role-placed caller loses it**. The resource changes audience; it is not
  published.
  
  The warning still exists and still says the operation is not what "suspend its
  access" sounds like. Only the description of the effect changed.
- c442971: The reads that need an id are swept too
  
  `sweep.sh` exercised the 69 leaves that take no input against the live API. The
  373 that take a required id were never swept, because `registration-only` covers
  two opposite things at once: a mutation, and a read that simply needs an
  argument. `agent delete <id>` must never fire in a sweep; `agent get <id>` is
  safe the moment something hands it an id.
  
  A new gate splits them and sweeps the second group, with the ids DISCOVERED
  rather than written down. Which leaf produces which id is derived from the route
  tree — `/agents/:agentId/tools` takes its `agentId` from whatever serves
  `GET /agents` — so no table has to be maintained and a new command is covered
  the moment it is registered.
  
  A leaf may only enter that population when the Public API v1 contract proves its
  method is `GET`. Nothing is inferred from a command's name, which is what keeps a
  `trigger`, `execute` or `provision` from being mistaken for a read and fired
  against a real environment.
  
  No command's behaviour, flags or output change.
- fa82747: The stability contract ships with the package
  
  `COMPATIBILITY.md` was published in no tarball. `package.json` declared
  `files: ["dist"]` and no `.npmignore` existed, so the document naming which
  parts of the CLI you may script against reached nobody who installed it — the
  root `--help` epilogue pointed at a URL on the public mirror instead, which
  answers for the newest contract rather than the one you have and needs a
  network to read at all.
  
  It is now in `files`, so `npm pack` carries it (4 entries to 5), and a
  network-free gate asks npm what it would publish rather than reading the
  `files` array — the array is a request, and a spec that reads it stays green
  when the file itself is gone.
  
  Nothing about the contract's content changed. What changed is that the
  installed version now carries the promise it is actually bound by.
- 17a40c3: `tracks memory list` shows the byte budget to a person, not only to `--json`
  
  The command's own one-line description promises "with the byte budget".
  `trackMemoryBytes` and `budgetBytes` have been on this envelope the whole time,
  and the human table printed neither — so the promise was kept only in `--json`,
  the channel a person is not using.
  
  `budgetBytes` appears EXACTLY ONCE in the whole wire surface, on this response.
  So the 8000-byte ceiling reached a human through no command at all. `memory put`
  already prints the running total on its success line, which is what left the list
  view as the single place it went missing — and the list view is the one a person
  reads BEFORE deciding whether there is room to write.
  
  The table now carries a footer in the house idiom:
  
      2341 of 8000 byte(s) used.
  
  `--json` is untouched. `printEnvelope` returns before invoking the human callback
  under `--json`, where both fields are already in the document — verified by
  reading `output.ts`, and asserted by a test rather than assumed.
  
  **Proved by mutation.** Removing the footer — the original defect — reds the two
  human-channel assertions and leaves both controls green. Moving the same footer
  OUTSIDE the `printEnvelope` callback reds exactly one test: the `--json`
  contamination assertion, while all three human-channel assertions stay green. A
  fix with the right string and the right numbers, rendering perfectly to a person,
  would have corrupted every script parsing this command, and only that one
  assertion catches it.
- f91d793: `why-not-ready` stops claiming a negative its own walk could not establish
  
  With no hold rows, `nexus tracks task why-not-ready` printed, flatly:
  
  > No open work leaf is held by an edge. Nothing is being withheld by a dependency.
  
  That second sentence is a claim about the PLAN. What the command actually has is
  a claim about its own WALK, and the two come apart: `buildAncestry` breaks out of
  a parent chain that revisits a node, so on a looped plan it stops early and the
  hold table is short for a reason that is not "there are no holds".
  
  An incomplete ancestor list can only MISS a hold — it never invents one — so
  "the walk found nothing" and "there is nothing" render as the same empty table.
  Only `ancestryLooped` separates them, and the sentence was printed without
  consulting it.
  
  **The existing loop warning did not cover this, while reading as though it did.**
  It says "Some rows below may be explained against an incomplete ancestor list" —
  and this is the branch with no rows below. It qualified every case except the one
  carrying the strongest claim.
  
  On a truncated walk the command now says what it knows, in ASD-STE100 Simplified
  Technical English — active voice, simple present, one idea per sentence:
  
  > This report shows no work leaf that an edge holds. The ancestry walk stopped
  > early. This result can be incomplete.
  
  It reports what the report SHOWS rather than what EXISTS, and it still prints the
  ready-set fact, which is established. When the walk did not loop, the original
  sentence is unchanged byte for byte — the defect was the missing condition, not
  the wording of the case that was always entitled to its claim.
  
  **What this does not close.** `ancestryLooped === false` is not proof the walk was
  complete, and the new wording is chosen so it does not imply one. `buildAncestry`
  has a second exit — a `parentTaskId` naming a row absent from the supplied set —
  which truncates a chain and sets no flag. That is reachable whenever the task
  list itself was capped. Closing it needs a second flag out of `buildAncestry`.

## 1.0.0
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
- 4699550: Ten `--json` documents now carry a field the route sent and the printer dropped.
  Each of these MOVES that command's published envelope, which `COMPATIBILITY.md`
  puts in the EVOLVING tier — read the old and new shape per command below before
  upgrading a script.
  
  | command                              | old `--json`     | new `--json`                                              | what you can now read                      |
  | ------------------------------------ | ---------------- | --------------------------------------------------------- | ------------------------------------------ |
  | `analytics query`                    | `{data, meta}`   | `{rows, fields, rowCount, executionTimeMs, truncated, …}` | `truncated`, `rowCount`, `executionTimeMs` |
  | `analytics metrics`                  | `{data, meta}`   | the same, plus `generatedSql`                             | `truncated`, `rowCount`, `executionTimeMs` |
  | `tool search`                        | bare array       | `{tools, facets, total}`                                  | `facets`, `total`                          |
  | `tool skills`                        | bare array       | `{skills, total}`                                         | `total`                                    |
  | `task list`                          | bare array       | `{items, total}`                                          | `total`                                    |
  | `external-tool list`                 | `{data}`         | `{items, total}`                                          | `total`                                    |
  | `template list`                      | `{data}`         | `{items, total}`                                          | `total`                                    |
  | `tracing cost-breakdown`             | `{data, meta}`   | `{entries, dimensions}`                                   | `dimensions`                               |
  | `prompt-assistant await-thread`      | the thread, flat | `{thread, outcome, waitedMs}`                             | `outcome`, `waitedMs`                      |
  | `prompt-assistant get-thread --wait` | the thread, flat | `{thread, outcome, waitedMs}`                             | `outcome`, `waitedMs`                      |
  
  `prompt-assistant get-thread` WITHOUT `--wait` is unchanged: the response is the
  thread, so the document is the same bytes it always was.
  
  The dropped fields were consequential rather than cosmetic. `truncated` says the
  answer is PARTIAL and only the terminal was ever told, so a script read a short
  result as a complete one. `outcome` is what a wait actually did — settled, still
  generating, or out of time — and it survived only as the process exit code.
  `facets` is the category breakdown `tool search --category` must be filtered
  against, and it was reachable from no other command. `dimensions` names what a
  cost breakdown was grouped by, in order, which is the only way to split a
  composite `groupKey` of `value0|value1`. Every `total` is the count a caller
  needs to know whether `--limit` hid the rest.
  
  The `--help` note on each of these commands is rewritten to the new shape, and
  the derived `OUTPUT --json:` line follows the printer automatically.
  
  `known-issues` and `vibe deploy` / `vibe rollback` also adopt `printEnvelope`,
  and their documents do NOT change — both already answered the whole response
  through a hand-rolled `if (isJsonMode())` branch. `known-issues` gains a derived
  shape line on its `--help` as a result.

### Patch Changes

- b30dd9a: A `workspace mount` that cannot reach the API stops reporting CLI_UNKNOWN_ERROR
  
  `workspace mount` was the one place in this CLI where a network failure was
  anonymous. It had already diagnosed the cause and then threw it away, so the
  error document's `code` — the field a script branches on — read
  `CLI_UNKNOWN_ERROR` for a plainly unreachable API.
  
  Two separate holes, same symptom.
  
  ## The mount-token call is a raw `fetch`
  
  `mintMountToken` hits `/api/dav/_token` directly rather than through the SDK
  client, so it inherits none of the transport's error taxonomy. **`handleError`
  routes by CLASS, not by message.** A bare `fetch` rejection is a `TypeError`; it
  matched no branch and fell all the way through to the unknown-error funnel. A
  non-2xx was the same story one line down — a plain `Error` carrying the status
  only inside its message, where nothing reads it.
  
  Every throw on that path now raises what the SDK transport would have raised for
  the same failure:
  
  | failure | now raises |
  |---|---|
  | socket / DNS / refused | `NexusConnectionError`, with the cause's own message folded in |
  | `401` | `NexusAuthenticationError` |
  | any other non-2xx | `NexusApiError` with code `HTTP_<status>` |
  
  🚨 **`HTTP_<status>` is the SDK's own default and not a code this file invents.**
  `handleError` prints `NexusApiError.code` verbatim, so a CLI-minted
  `MOUNT_TOKEN_FAILED` would read as a code the SERVER sent. The `401` split
  matters for the same reason class-routing does: a `401` raised as a plain
  `NexusApiError` skips the authentication branch and loses the "run `nexus auth
  login`" hint — the one remedy most likely to apply here.
  
  ## `--shared` replaced the list's error with a fresh one
  
  Resolving a mount target starts by listing workspaces. When that list call threw,
  the resolver swallowed it and returned `null`, and the `--shared` path then threw
  a **new** plain `Error` about being unable to verify the slug. The cause — which
  already knew whether it was an unreachable API, a `401` or a `5xx` — was gone,
  leaving `handleError` nothing to classify.
  
  The list's own error is carried out and rethrown instead. `resolveMountTarget`
  keeps its signature and its degrading behaviour for the default bare-slug path,
  which is documented as best-effort; `resolveMountTargetDetailed` is what anything
  that REPORTS a failure must call, or it reports a cause it never looked at.
  
  ⚠️ **A `null` target always means the list call failed — it is never "not
  found".** A successful list yields an object on every path, including the
  no-match one. Reading `null` as absence is what made this bug survive a reading
  of the code.
  
  ## What a script sees
  
  The success path is untouched, and so is every message a human reads. What
  changed is the `code` on a failure: a mount that cannot reach the API, or is
  refused by it, now reports the same code as every other command that goes through
  the client. A script matching `CLI_UNKNOWN_ERROR` to detect a failed mount will
  stop matching — it was matching a bug.
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
- a1546d2: `collection attach-documents` expands a folder id to the documents inside it
  
  Attaching a folder to a collection was a silent no-op: the server filtered
  folder ids out of the request and the call still reported success, so a
  collection "created from a folder" held none of the folder's documents and
  answered every query with no results (NEX-4410). The CLI's help documented the
  drop as a fact of life across five commands.
  
  ## A folder id now attaches the folder's contents
  
  Any id naming a folder — a plain folder, a website folder from
  `document add-website`, the folder an imported Google Sheet or Google Drive
  import produces — expands server-side to every document under it, recursively,
  as of that moment. The folder row itself is still never linked: it carries no
  indexed content and does not count toward the collection's document count.
  
  Two edges worth knowing:
  
  - **The expansion is a snapshot.** Documents added to the folder later are not
    pulled in; re-attach the folder to pick them up.
  - **An empty folder attaches nothing and still succeeds.**
    `nexus collection documents <id>` remains the proof of what a call linked.
  
  ## Help text follows the behavior
  
  The notes on `collection attach-documents`, `document children`,
  `document create-folder`, `document add-website` and
  `document create-google-sheet` now describe the expansion instead of telling
  you to walk the children by hand.
- a38e1bc: The bundled embed doc taught five settings keys the API deleted, and the API answers `200` to every one of them
  
  The CLI ships the `claude-code-skills-nexus` corpus inside its own package — `src/skills-content.generated.json`, read at runtime and published via `dist/`. `skills/nexus-deployments/channels/embed.md` in that corpus documented five keys that no longer exist on the deployment contract:
  
  | key | removed by | why |
  |---|---|---|
  | `leadsSettings` (whole settings block) | #4337 | no lead-capture form exists in the product |
  | `format` (`"bubble"` \| `"classic"`) | #4358 | nothing branches on the value; the widget has one layout |
  | `autoShowInitialMessagePopup` | #4358 | the popup it names was never implemented |
  | `autoShowInitialMessagePopupDelay` | #4358 | delay for that same popup |
  
  **The endpoint strips undeclared keys rather than rejecting them.** So an agent following this content builds the settings body it was told to build, sends it, reads HTTP `200`, and has written nothing for those keys. There is no error at any layer — not a `400`, not a warning, not a log line the caller can reach. `deployment create --help` had already been corrected for `leadsSettings` (it says four settings objects, not five); the bundled doc still said five, and the bundled doc is what an agent reads before it acts.
  
  `EmbedSettingsSchema` is 59 keys now, was 62. The served embed-config response is 58, was 61.
  
  ## What moved
  
  Upstream, `NexusGPT/claude-code-skills-nexus#31`, one file, `-29 / +4`:
  
  - the create note said **five** settings blocks and named `leadsSettings` as one. EMBED needs **four** — `embedSettings`, `securitySettings`, `assistantSettings`, `advancedSettings`; `voiceSettings` is optional.
  - `~30 required fields` is now the counted **32**, and the `Full EMBED settings example` body is exactly those 32 keys and nothing else. Verified by parsing the JSON block out of the doc and set-comparing its `embedSettings` keys against the non-`.optional()` members of `EmbedSettingsSchema` at `origin/staging`: 32 = 32, empty in both directions.
  - the `Leads Capture` section and its worked `deployment update` example are deleted rather than annotated — the group no longer parses.
  - the `format` row and both popup rows leave the Display Customization table.
  - `Bubble format only.` on the Landing Screen was a claim about `format` and was never enforced. It now reads `Gated by landingScreenEnabled.`, matching the schema's own comment.
  - one line is added stating the strip-not-reject behaviour, because that is what makes a stale key here expensive rather than merely wrong.
  
  Here, `skills-nexus.lock` moves `58028615b8` → `d28e9180e3` and both halves of the bundle are regenerated together.
  
  ## Regenerating alone would have fixed nothing
  
  `gen:skills` re-bundles from the tarball at the SHA the lock pins. Run against the old pin it reproduces the stale content byte-for-byte and exits `0`. The pin had to move first.
  
  ## Why the pin did not move to upstream `main`
  
  `main` still carries the mirror-sync regression that `NexusGPT/claude-code-skills-nexus#25` documented — a sync declaring the upstream primary authoritative overwrote the mount-registry fix from #23, and `src/workspace-registry-skill-compat.test.ts` goes red against it. Re-measured with #25's own needle:
  
  ```
  git show 58028615b8:skills/nexus-workspaces/SKILL.md  | grep -c '\.\[\$s\]\.mountPath'   ->  0   (old pin)
  git show 3af7f00:skills/nexus-workspaces/SKILL.md     | grep -c '\.\[\$s\]\.mountPath'   ->  0   (#23 merge)
  git show origin/main:skills/nexus-workspaces/SKILL.md | grep -c '\.\[\$s\]\.mountPath'   ->  1   (main)
  ```
  
  Control, so the zeros are readings rather than a broken grep: bare `mountPath` appears 14 times at the old pin and 12 on `main`.
  
  `main` is also 30 commits ahead of the pinned base on unrelated corpus content. So the fix is cherry-picked onto the pinned base (`NexusGPT/claude-code-skills-nexus#32`, the pin target, deliberately not merged) exactly as #24/#25 established, and the bundle moves by one file and nothing else.
  
  ## The blast radius, measured rather than asserted
  
  Both payloads were parsed and every bundled file compared by path and content:
  
  - 503 files before, 503 after. Nothing added, nothing removed.
  - **exactly one file differs:** `SKILLS/nexus-deployments/channels/embed.md`.
  - `SKILL_LIST` unchanged.
  
  Residual scan, taken on the regenerated payload's own copy of `channels/embed.md` — the file the comparison above names as the only one that moved:
  
  | needle | before | after |
  |---|---|---|
  | `autoShowInitialMessagePopup` | 4 | **0** |
  | `leadsSettings` | 4 | **0** |
  | `` `format` `` | 2 | **0** |
  | `"format"` | 1 | **0** |
  | `classic` | 1 | **0** |
  | `Bubble format` | 1 | **0** |
  | `primaryColor` *(control)* | 2 | **2** |
  | `embed-config` *(control)* | 6 | **6** |
  | `landingScreenActionButtons` *(control)* | 3 | **3** |
  | `uiBgPattern` *(control)* | 1 | **1** |
  | `securitySettings` *(control)* | 5 | **5** |
  | `bubblePosition` *(control)* | 2 | **2** |
  
  Every control is non-zero and unchanged, so the scan can find things and the edit removed only what it aimed at. The file goes 18,505 → 17,388 bytes.
  
  **The scope is the file, not the payload, and that is deliberate.** `format` and `classic` are ordinary English inside a 9 MB corpus — across the whole payload they read 1312 → 1307 and 8 → 7, deltas that are correct and prove nothing about this file. Worse, `"format"` spelled with literal quotes matches **0** in the raw JSON at both ends, because the payload escapes them as `\"format\"` — a needle that measures nothing returns a zero indistinguishable from success.
  
  `check-skills-lock.ts` passes on the new pair, and its `--self-test` proves all 12 of its cases can still go red.
- 6120bf1: `deployment create --help` stops naming a settings group the API no longer accepts
  
  The `Notes:` block on `deployment create` told you an EMBED deployment needs
  **five** settings objects and named `leadsSettings` as one of them, in three
  places: the count and the list, the worked `--body` shape, and the closing line
  `and leadsSettings is optional throughout`.
  
  That group has been removed from `EmbedDeploymentSettingsSchema`. It was read by
  nothing — no lead-capture form exists in the product — and `z.object` strips what
  it does not declare, so a caller following the old help sends a key that is
  silently dropped. The create still succeeds, which is what makes the stale help
  expensive: nothing tells you the object you were told to send went nowhere.
  
  EMBED now needs four objects — `embedSettings`, `securitySettings`,
  `assistantSettings`, `advancedSettings` — and the printed `--body` example carries
  the same four.
  
  Help text only. No flag, argument, output shape or exit code moves.
- 4699550: **`130` is documented where it is produced, and the first Ctrl-C is not it.**
  
  Four shipped surfaces described this exit code and all four were wrong in the same
  direction. The root `--help` table called it "SIGINT". `COMPATIBILITY.md` called it
  "reserved rather than chosen". The taxonomy's own declaration said it was "never chosen
  as a verdict". And `nexus vibe app logs --help` — the one command that produces it — said
  "Ctrl-C ends one cleanly and exits 0" and stopped there.
  
  Read together they promise a script author two false things: that a Ctrl-C yields `130`,
  and that nothing but a Ctrl-C can.
  
  What actually happens: `nexus vibe app logs --follow` counts signals and exits `130` on
  the SECOND, and it is the second signal of EITHER kind, because ONE counter serves
  `SIGINT` and `SIGTERM`. So the pair that reaches it is usually MIXED — a user presses
  Ctrl-C, a supervisor then sends `SIGTERM` into the same process, which is the ordinary
  shape of a shutdown. The FIRST signal ends the follow cleanly at `0`. A `SIGTERM` pair
  also reports `130` and never `143`: this CLI declares exactly one code in the shell's
  signal band on purpose, so "the caller stopped it" is one category rather than one per
  signal.
  
  **No exit code changed.** Every correction is to text a caller reads.
  
  Also in this release: `nexus admin`'s `handleAdminError` docblock now binds to
  `handleAdminError`. A constant declared between the docblock and the function meant JSDoc
  attached the warning to the constant, so an editor hovering the function showed none of
  it.
- 93a8860: `nexus role create-permission-set --capabilities` accepts `role.create`, and the server refuses it
  
  `--capabilities` on `role create-permission-set` and `role update-permission-set`
  validates against the projected v1 contract, so the server catalog gaining
  `role.create` widens what this CLI accepts by one value. Its `--help` and its
  `--print-contract` output list it too.
  
  **Accepting it is not the same as it working.** `role.create` names no Role — the
  Role does not exist yet when you create one — so it is held org-wide, while a
  permission set's `capabilities` are keyed to ONE Role. Passing it produces
  `400 ORG_SCOPED_ONLY_ROLE_CAPABILITY` from the server rather than a
  client-side refusal. That is deliberate: the flag mirrors the catalog, and the
  catalog is what `nexus role capabilities` answers from.
  
  A script that builds a capability list by reading the catalog and passing it
  straight to `create-permission-set` therefore starts failing on the server where
  it used to be rejected locally. Filter `role.create` out of such a list.
- f91e47b: The update banner names the command that actually upgrades
  
  `Update available: X → Y` told you to run `npm update -g @agent-nexus/cli`. That
  command exits 0, prints `changed 1 package`, and leaves the version where it
  was — so the banner reappears on the next invocation, forever, having just been
  obeyed.
  
  The `update`/`upgrade` verbs resolve within the range a global root already
  recorded, and npm, pnpm and yarn all record `^0.x.y`. A caret on a `0.` major
  does not admit the next minor by semver, so the verb stops one minor short of
  the version the same banner had just said existed. All three arms were wrong,
  not one of them.
  
  Measured against the live registry from 0.34.x with `^0.34.0` recorded, at a
  time when `latest` was 0.35.1 — each manager's own verb, then the tag spelling
  as the control:
  
  | command | reaches | exit |
  | --- | --- | --- |
  | `npm update -g @agent-nexus/cli` | 0.34.2 | 0 |
  | `pnpm update -g @agent-nexus/cli` | 0.34.2 | 0 |
  | `yarn global upgrade @agent-nexus/cli` | 0.34.2 | 0 |
  | `npm install -g @agent-nexus/cli@latest` (control) | 0.35.1 | 0 |
  
  A tag is an exact resolution, so it is not subject to a recorded range at all,
  and it is the only spelling that is right for every manager and every layout.
  
  ## What changes
  
  - **The banner prints `getGlobalInstallCommand`** — byte for byte the command
    `nexus upgrade` already runs, and the same one the auto-update-failed message
    prints. The contract is that this CLI never tells you to run a command it
    would not run itself.
  - **`getGlobalUpdateHint` is deleted, not corrected.** It was the second builder
    of an upgrade string in one file, and the two disagreed from the commit that
    introduced both of them. A corrected duplicate is a duplicate that can drift
    again; there is now one builder, and every caller that tells a user how to
    move versions calls it.
  
  Nothing about when the banner appears changes — same once-per-day check, same
  cache, same opt-outs. Only the command it names is different.
- c8f3d65: `workflow test` on a plugin trigger deploys nothing
  
  `nexus workflow test <wf>` on a workflow whose trigger is a `pluginTrigger`
  performed a **real Pipedream source deployment** on the connected third-party
  account before running anything — a live subscription on a real mailbox or CRM,
  created by a verb named "test", with no dry-run flag and no confirmation. With no
  account connected it did not even get that far: the deploy failed and the caller
  received
  
  ```
  API error (500): Trigger deployment failed (source=PIPEDREAM): Failed to deploy
  Pipedream source for component "gmail-new-email-received": HTTP error! status:
  404, body: {"error":"record not found"}
  ```
  
  — an internal error quoting the provider's own 404 body, for a workflow that had
  sample data sitting on the node ready to run.
  
  The server fix is in `@nexus/backend`: the endpoint now runs the chain from the
  node's `exampleData` and deploys nothing, a missing account is refused as a 400
  naming the parameter and the command that connects one, and a refused deployment
  is a 4xx instead of `INTERNAL_ERROR`.
  
  ## `@agent-nexus/cli`
  
  **`workflow test --help` no longer offers advice that only holds for webhooks.**
  The refusal note told every caller of a refused external-event trigger to "pass
  `--input`". A `pluginTrigger` ignores `--input` entirely — its sample payload is
  the node's own `exampleData` — so the one instruction a plugin caller was given
  was the one that could not work. The per-trigger `--input` table now carries a
  `pluginTrigger` row saying so, and the note splits its advice by type. It also
  states the new guarantee: testing a plugin trigger registers no third-party
  subscription; the source is deployed at `workflow publish`.
  
  No flags, arguments or output shapes changed.

## 0.35.1
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

## 0.35.0
### Minor Changes

- 7dbfba3: `nexus admin vibe-tenant-cluster` gains `force-converge` and `complete-teardown` —
  the two operator recovery levers the admin backend already had with no CLI path
  to reach them. Also fixes `nexus vibe cluster provision`'s advice on an
  already-DEGRADED cluster, which previously claimed unconditionally that it
  "converges on its own" — true for ordinary drift, false for a cluster blocked
  on something outside its control (an AWS account quota, for instance); the new
  text points at `nexus vibe cluster status`'s `Reason:` field instead. And
  `nexus vibe cluster status`'s "no dedicated cluster" copy now correctly scopes
  its shared-infrastructure claim to `--git-url` (bring-your-own-git) projects —
  a Nexus-hosted git project genuinely needs the cluster and stays PENDING
  without one.

## 0.34.2
### Patch Changes

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

## 0.34.1
### Patch Changes

- 683ead5: The bundled skills gain `nexus-tracks`, so Cue can see the Tracks surface it is already authorized for — including the five lifecycle verbs
  
  Cue's base knowledge is baked from `NexusGPT/claude-code-skills-nexus` at the sha in
  `packages/cli/skills-nexus.lock`. Tracks shipped upstream in that repo's PR #27 and the lock
  never moved, so the bundle Cue reads had **zero** mention of it: `nexus tracks` occurred **0**
  times across the payload, against **423** for `nexus workflow` and **125** for `nexus agent`.
  `SKILL_LIST` named 19 skills and `nexus-tracks` was not among them.
  
  The result is an agent authorized for the Tracks routes in production that has never been told
  they exist — it cannot route to them, because nothing it reads says they are there.
  
  After this bump: `nexus tracks` **26**, `SKILL_LIST` **20** with `nexus-tracks` in it, and both
  controls unchanged at **423** and **125** — the payload delta is purely additive.
  
  The lock now also carries upstream PR #30, which documents the five lifecycle verbs the CLI
  shipped in `packages/cli/src/commands/tracks.ts`. Each was absent from the payload and is now
  present: `tracks set-status` **1**, `tracks set-next-owner` **3**, `tracks archive` **3**,
  `tracks list` **5**, `tracks get` **2**. Without those rows a granted, routed, published
  capability stays unused, and the symptom is silence rather than an error.
  
  **The lock points at `5802861`, not at upstream `main`, and that is deliberate.**
  Upstream `main` still carries the registry regression that issue #25 recorded: a sync commit
  overwrote PR #23, so the bundled `nexus-workspaces` runbook and the installed Python hooks
  index `~/.nexus-mcp/workspace-mounts.json` by BARE SLUG again, while this CLI writes
  `<kind>:<id>|<slug>` keys. Bumping to `main` turns
  `src/workspace-registry-skill-compat.test.ts` red with 12 findings — measured, not inferred —
  and shipping it would put a silently-wrong path resolver on every machine that runs
  `nexus claude-code install`: `ws_path()` falls back to `/mnt/workspace/<slug>`, which does not
  exist locally, and the WebDAV recipe PUTs to `null/api/dav/…`.
  
  So `5802861` is upstream PRs #27, #29 and #30, cherry-picked onto the sha the lock already
  pinned — the same remedy #25 used for the branching-operator fix. The `nexus-tracks/SKILL.md`
  git blob is identical to `main`'s (`b5a3b2e`, sha256 `2a7398ae…`), and all three registry
  needles stay at 0 against `main`'s 1, with the `workspace-mounts.json` control non-zero on both
  sides. Upstream issue #28 tracks getting `main` green so the lock can return to it.
  
  The bundler strips one trailing newline from every file it packs, so the payload's copy of a
  skill hashes to `sha256(upstream file with its trailing newline removed)`. Verified across the
  whole bundle: 440 of 443 files equal-after-rstrip, 3 exact (those carry no trailing newline
  upstream), and **zero** real mismatches — which is also the proof that every byte of this
  payload came from the pinned tree.

## 0.34.0
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
- 3f1ddc7: A marketplace tool answers with the page that connects it
  
  `nexus tool get <id>` now returns a **`dashboardUrl`**, the tool's page in the
  dashboard — the same field `nexus external-tool get` has always returned, on the
  command that answers for marketplace tools.
  
  That page is where a *person* connects a credential: it is the browser half of
  `nexus tool connect`, and the only route offering both an OAuth button and an
  API-key form. Before this, the path had to be assembled from a pattern written
  down outside this repository — which is the drift `dashboard-url.ts` exists to
  remove, and it had already bitten: an operator handed the documented
  `{dashboardUrl}/app/my-tools/{toolId}` to a colleague and it did not work
  (NEX-4021).
  
  It did not work because the page itself 404'd for a marketplace tool id, which
  the same change repairs on the server. Two consequences worth stating:
  
  - **The URL this command prints is only openable against a backend carrying that
    fix.** Printed against an older one it resolves to a spinner that never
    settles, which is why the `--help` note says so rather than leaving the caller
    to conclude their id was wrong.
  - **Connecting a credential does not require owning the tool**, so the link is
    the right thing to send to whoever actually holds the key. Editing, publishing
    and deleting still do — those controls stay hidden on a tool the organization
    did not create.
  
  No flag, argument, or output shape changed: `tool get` was already a flat record
  and gains one more field.
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
- 23cc72b: An `outputNode` with nothing to output no longer reports itself ready
  
  The node that produces a workflow's FINAL output is created with
  `{"outputType": "previous", "instructions": ""}` — and `instructions` is the only
  field any of the three `outputType` branches reads. `previous` emits the value
  that field REFERENCES (the incoming edge does not select it), `text` renders it as
  a template, `custom` sends it to the model as the prompt. Empty, the node emits
  `""` and the run finishes `COMPLETED` with the workflow's answer blank.
  
  `configStatus` called that node `complete` with `missingFields: []`, so every
  surface that reports readiness agreed the node was ready while it was guaranteed
  to produce nothing. Measured on production 2026-08-19: **54 published `previous`
  output nodes across 36 workflows in 8 organisations** carry neither a reference
  nor text.
  
  `computeConfigStatus` now reports `missingFields: ["instructions"]` when that
  field is empty, under every `outputType`.
  
  ## `@agent-nexus/cli`
  
  Help text on three commands claimed the opposite and has been corrected:
  
  - **`workflow overview`** said an `outputNode` "has no required fields at all, so
    they ALWAYS report complete". It now reports `missingFields: ["instructions"]`
    when the field is empty; the three genuinely field-free types
    (`webhookTrigger`, `agentInputTrigger`, `loopStart`) are unchanged.
  - **`workflow`** carried the same claim in its shared preamble.
  - **`execution poll` / `execution output`** said "Nothing validates this: publish,
    validate and the node's own status all pass" about a `COMPLETED` run whose
    output came back empty. `workflow validate`, `workflow overview` and the node's
    own `configStatus` all report it now.
  
  ⚠️ **Advisory, not a new refusal.** `outputNode` is deliberately absent from the
  publish gate's blocking map, so `POST /publish` still answers 200 and workflows
  already carrying an unconfigured output node are not refused a re-publish —
  verified on a running stack. `workflow validate` reports `readyToPublish: false`
  for one, which is a report about the graph, not a gate on it. The canvas
  validator is unchanged, so nothing here rejects a graph the dashboard accepts.
  
  The run itself is unchanged: an output node with no instructions still emits `""`.
  Making `previous` fall back to the upstream node's output would change what 36
  live workflows return and is left as a product decision (NEX-4055).
- 2c80c7d: `tracks archive` help states that a track is never deleted, in words
  
  The note opened by naming a delete command in the same quoted form the help uses
  for commands that exist. There is no such command, so the sentence read as a
  pointer to one, and the help-claims gate — which resolves every quoted command in
  help prose against the live command tree and cannot read a negation — reported it
  as an unresolved citation.
  
  The note now says the same thing in words. Nothing else about `archive` changed.
- b4992bf: `tool connect` and `agent-tool create` no longer tell you that the unified credential id is
  the wrong one to put on a plugin node — because it no longer is.
  
  One connected account carries two ids and nothing about either says which it is:
  `nexus tool credentials <toolId>` prints `ToolCredentials.id` under a column headed `ID`, and
  `nexus credential list` prints `Credential.id` under a column headed `ID`. Both are UUIDs.
  Pasting the second into a workflow plugin node's `toolCredentialId`, or into a PLUGIN agent
  tool config, was accepted by `configStatus` and by `workflow validate` and then refused at
  execution — with a message telling you to reconnect an account that was working.
  
  That is fixed on the platform: where a credential is SPENT, both ids now resolve to the same
  connected account, within your own organization. `external-tool execute --credential` already
  did; a workflow plugin node, a smart-action node and an agent PLUGIN config now do too. An id
  that names neither space is still refused, and the refusal names both lists instead of the
  account.
  
  The `--help` text catches up with it:
  
  - `tool connect` said "neither namespace accepts the other's — `external-tool execute
    --credential` is the one place that takes either". Both halves were true when written and
    the second is now wrong, so the note splits the two cases: the ADDRESSING commands
    (`credential`, `access-card`, `tool delete-credential`) still hold you to one namespace,
    while every place a credential is spent takes either.
  - `agent-tool create` still points you at `tool credentials <toolId>` for the id, and now adds
    that the unified id from `credential list` resolves there as well.
  
  The `plugin` and `smart-action` node-type guides — what `nexus workflow node-type` prints, and
  what an agent reads before configuring a node — carried the same rule as a 🚨 gotcha quoting
  the old run-time error verbatim. Both now state that either id is accepted, and keep the part
  that is still true: `credential get` resolves only the unified one.
- 66930dd: `tool create-credential --help` and `tool connection-status --help` now say which of the two
  id spaces each one deals in, and `create-credential` says what it does with a tool it cannot
  serve.
  
  `tool connection-status` answers `COMPLETED` with a `connectionId`, and that is the only id
  the caller holds at that moment. `tool create-credential --account-id` wants a different
  thing entirely: Pipedream's own account id, which looks like `apn_z8hD1b4` and never reaches
  the caller through this CLI. Passing the connectionId was the obvious move, and it used to be
  accepted — the server wrote it straight into the credential row, so the credential listed
  fine and could never execute. The server refuses it by name now, and the help says so before
  you get there:
  
  - `--account-id`'s one-line description names the shape (`apn_...`) and names what it is NOT.
  - The examples stop showing `pd-acct-456`, an id of a shape Pipedream does not issue, and show
    a real `apn_` one.
  - A new note states that a COMPLETED handshake has ALREADY stored its credential — the thing
    `connectionId` names exists, `nexus credential list` shows it, and there is nothing left for
    `create-credential` to record.
  - Another states that the command is Pipedream-only: a tool of any other type answers
    `422 TOOL_NOT_PIPEDREAM` and names the flow that fits it,
    `nexus tool connect <id> --auth-type http --api-key-value <key>`.
  - `connection-status` states that its `connectionId` is a Nexus credential id rather than a
    Pipedream account id, so the reader is warned in the command that produces the id as well as
    in the one that refuses it.
- f9882ee: `document upload` help no longer tells you to ignore mimeType
  
  The CLI sends a file's bytes with no content type declared, and the server used
  to store that multipart default verbatim — so `nexus document download <id>`
  answered `"mimeType": "application/octet-stream"` for a PDF, and this help text
  told you to read `type` and never `mimeType` because of it.
  
  The server now resolves an undeclared content type from the filename before
  storing it: a `.pdf` comes back `application/pdf`, a `.csv` `text/csv`. An
  extension the server does not recognise still lands on
  `application/octet-stream`, so `type` remains the answer to "what kind of
  document is this" — but `mimeType` is no longer a constant.
  
  Help text only; no command, flag or output shape changed.
- 865483f: `workflow branch create` help: a condition `field` that is a bare string is now refused at write (400 `VALIDATION_ERROR`) rather than accepted and failing silently at execution, and the example's `field.type` is corrected from the non-existent `"text"` to `"string"`.
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
- f55a5f3: `workflow node output-format` no longer tells you a `nodeType` schema proves nothing
  
  The note under `nexus workflow node output-format --help` read:
  
  > source "nodeType" — NOTHING HAS RUN. You are reading the static per-type default
  > ({"type":"object"} for most types), which proves nothing about what this node
  > will actually emit.
  
  That was true of every type when it was written, and it is now wrong for the types
  that declare their output. The backend derives a `nodeType` schema from the node
  type's own `runOutputSchema`, so `cueNode` answers its five fixed keys, `loop` and
  `doWhile` answer an array, and `newsMonitorTrigger` answers the `events[]` shape it
  already published on `GET /workflows/node-types/:type` — all before the node has
  ever run.
  
  The help now separates the two cases: a declared shape is real and wirable, and a
  bare `{"type":"object"}` is the one that still proves nothing. No behaviour change
  in the CLI itself; the command sends the same request and prints the same record.
- 60661a9: `nexus tracks --help` states what the routes do
  
  `tracks create --help` said a new track "does not appear in `nexus tracks ready`
  as work until it has tasks". The ready set tests status, archival and dependency
  edges and asks nothing about tasks, and `Track.status` defaults to `PLANNED`, so
  a freshly created track is ready work from the very next call. Sixteen further
  claims across the namespace were resolved to the code that decides them and
  rewritten where they disagreed — among them: an un-tick erases a task's
  evidence rather than preserving it, a non-OPEN agent answers 409 rather than
  404, a task name passed to `--agent` is a 400 rather than a 409, an edge whose
  blocker is already `DONE` removes nothing from the ready set, and a slug or a
  memory key must start with a letter or a digit.

## 0.33.1
### Patch Changes

- 683ead5: The bundled skills gain `nexus-tracks`, so Cue can finally see the Tracks surface it is already authorized for
  
  Cue's base knowledge is baked from `NexusGPT/claude-code-skills-nexus` at the sha in
  `packages/cli/skills-nexus.lock`. Tracks shipped upstream in that repo's PR #27 and the lock
  never moved, so the bundle Cue reads had **zero** mention of it: `nexus tracks` occurred **0**
  times across the payload, against **423** for `nexus workflow` and **125** for `nexus agent`.
  `SKILL_LIST` named 19 skills and `nexus-tracks` was not among them.
  
  The result is an agent authorized for the Tracks routes in production that has never been told
  they exist — it cannot route to them, because nothing it reads says they are there.
  
  After this bump: `nexus tracks` **15**, `SKILL_LIST` **20** with `nexus-tracks` in it, and both
  controls unchanged at **423** and **125** — the payload delta is purely additive.
  
  **The lock points at `a64b45c`, not at upstream `main`, and that is deliberate.**
  Upstream `main` still carries the registry regression that issue #25 recorded: a sync commit
  overwrote PR #23, so the bundled `nexus-workspaces` runbook and the installed Python hooks
  index `~/.nexus-mcp/workspace-mounts.json` by BARE SLUG again, while this CLI writes
  `<kind>:<id>|<slug>` keys. Bumping to `main` turns
  `src/workspace-registry-skill-compat.test.ts` red with 12 findings — measured, not inferred —
  and shipping it would put a silently-wrong path resolver on every machine that runs
  `nexus claude-code install`: `ws_path()` falls back to `/mnt/workspace/<slug>`, which does not
  exist locally, and the WebDAV recipe PUTs to `null/api/dav/…`.
  
  So `a64b45c` is upstream PR #27's two commits plus PR #29's follow-up, cherry-picked onto the sha
  the lock already pinned — the
  same remedy #25 used for the branching-operator fix. The `nexus-tracks/SKILL.md` blob is
  sha256-identical to `main`'s, and all three registry needles stay at 0 against `main`'s 1.
  Upstream issue #28 tracks getting `main` green so the lock can return to it.

## 0.33.0
### Minor Changes

- 2ef56c8: `COMPATIBILITY.md` promised a deprecation cycle — "the old form keeps working, `--help` and the
  changelog say it is going, and it is removed no sooner than the release after the one that
  announced it" — and this package had no way to perform one. A command could be kept or it could be
  deleted. Every removal therefore rested on a reviewer noticing, and the surface manifest added in
  0.26.0 did not change that: deleting a command is a clean regeneration and a green build, and the
  generated file simply describes a smaller CLI with generated authority behind it.
  
  **A command can now be retired, and a removal that skips the cycle fails the build.**
  
  **What you get as a caller.** From the release that announces a deprecation, the command still
  works and tells you it is going — a `DEPRECATED:` line at the top of its own `--help`, and one
  sentence on **stderr** every time you invoke it, naming what is going, what replaces it, and the
  release it goes in. Under `--json`, stdout is byte-identical to what it was before the
  announcement: the notice never touches it, because a notice on stdout would break every consumer
  one release EARLY, which is the opposite of what announcing a removal is for. Nothing is deprecated
  in this release — the declaration is `src/deprecations.ts` and it is empty, which is the ordinary
  state.
  
  **What you get as an author.** A record in `DEPRECATIONS` is keyed by the leaf's `shape` from the
  surface manifest — the rename-stable identity, which excludes the path — so renaming a command
  cannot silently discharge a deprecation of it. `src/cli-surface.baseline.generated.ts` records what
  the last release promised, and every promised path gets one of four verdicts: `present`, `aliased`,
  `moved` or `removed`. **An alias is still the sanctioned rename and owes nothing** — `task-eval`
  keeping `eval` is the shape to copy, and it stays green. A rename with no alias, and a removal, owe
  a cycle on a STABLE leaf. `admin`, `api`, `vibe` and hidden commands owe none, because this document
  promises them nothing.
  
  **The condition that cannot be satisfied in one commit.** A removal is permitted only when the
  deprecation record was captured into the baseline BY A RELEASE, when its `announcedIn` is at or
  before that release, and when the `CHANGELOG.md` entry for that version NAMES THE PATH. A version
  heading is not an announcement — every past release already has one — so the gate reads the entry.
  The baseline generator refuses to advance while the package version has not moved, which is what
  stops an announcement being invented and spent in the same pull request.
  
  **What it cannot do, stated rather than implied.** A hand-edit of the generated baseline walks
  around all of it, and no arrangement of a checked-in file prevents that; what the design buys is
  that the walk-around is a deletion from a file marked GENERATED, in the same commit as the command
  it excuses. A rename that changes a flag or the description at the same time moves the path and the
  identity together and reads as a removal — keep the old name as an alias and the verdict is
  `aliased` whatever the identity did. Two leaves sharing one `shape` cannot be told apart, so neither
  can be deprecated by identity; there are none today and the manifest's header names any that appear.
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
- a34f678: `nexus auth status` verifies the key against the API. It used to exit `0` over a dead one.
  
  **BREAKING: `auth status` now exits non-zero when the credential is bad.** It read local
  config, found that a key was present, and exited `0` — over a key the API had already
  stopped accepting. Measured: a stored key pointing at production reported success, and the
  63 API calls behind that preflight then failed on auth. A verb named `status` that cannot
  fail on the state it reports is worse than no verb at all, because it converts "your key is
  dead" — one command to fix — into "something else is wrong", and the debugging time goes
  somewhere the defect is not.
  
  Its own `--help` disclosed the gap at length ("IT READS LOCAL CONFIG AND MAKES NO NETWORK
  CALL, SO IT IS NOT VERIFICATION"). A warning that survives is a repair that did not happen:
  nothing reads a paragraph before branching on an exit code.
  
  **Five outcomes, five exit codes, because five different things need doing about them.**
  
  | exit | when                                     | what to do         |
  | ---- | ---------------------------------------- | ------------------ |
  | `0`  | the API accepted the key                 | nothing            |
  | `2`  | no profile, or the profile stores no key | `nexus auth login` |
  | `2`  | the server read the key and refused it   | `nexus auth login` |
  | `7`  | the API could not be reached at all      | check your network |
  | `8`  | the check ran out of time                | raise `--timeout`  |
  | `6`  | the server was reached and errored       | try again          |
  
  ⚠️ **`7`, `8` and `6` mean the credential was NOT JUDGED.** They are not a verdict that the
  key is bad. Collapsing an unreachable host into "your key is invalid" would be the same
  defect one layer down — it sends the reader to replace a credential that is fine, when the
  thing to fix is the network. The refusal message names which happened, and names the
  profile and the base URL, because "some key is dead" is not actionable and "the key in
  profile X, against host Y, is dead" is. A key that is dead against production and live
  against staging is the confusion that removes.
  
  **`--no-verify` keeps the old local-only read**, for working offline or inspecting a profile
  for a host you cannot reach. It exits `0` whatever the key's real state is and says so on
  both channels: the human output prints `NOT VERIFIED`, and the `--json` document reports
  `verified: null` rather than `false`. Three values, never two — a check nobody ran is
  neither a pass nor a failure, and `false` would claim the key was judged.
  
  **A script that gated on `nexus auth status` succeeding was being carried by the defect.**
  It kept running against a dead credential and failed later, somewhere else. It now stops at
  the preflight, which is where it should have stopped. A script that genuinely wants the
  local read and no network call adds `--no-verify`.
  
  `auth status --json` gains a `verified` field (`true` when checked and good, `null` under
  `--no-verify`; a failed check is the error document, at a non-zero exit).
  
  **`auth whoami` shares the probe rather than keeping its own copy.** It was the only verb
  that got this right, in a private implementation, while `status` had none — and two copies
  of "is this key good" are two things to drift, silently, in the direction that reads as
  fine. Its behaviour is unchanged with one narrowing its old bare `catch` could not express:
  a TIMEOUT now exits `8` rather than `7`. A timeout may still be completing server-side; an
  unreachable host is not, so a blind retry means different things.
  
  Both verbs now honour the global `--timeout <seconds>`. They pinned a 30-second deadline
  that the flag existing for exactly that purpose could not move.
- 33a04ff: **BREAKING FOR SCRIPTS THAT GATED ON `channel setup`, AND ITS `--help` PUBLISHED THE WORKAROUND.**
  
  `nexus channel setup --type WHATSAPP --json | jq -e '.ready'` was in the shipped help. A
  documented workaround for an exit code is the admission, in the product's own documentation, that
  the exit code cannot be believed: the command printed `ready` and exited `0` whichever way it went.
  
  **Ready exits `0`; not-ready exits non-zero.** So the gate is
  `nexus channel setup --type WHATSAPP && nexus deployment create ...`, and the jq recipe is
  **deleted** from the help rather than corrected. Both branches answer the same way — the plain
  read and `--auto`.
  
  ⚠️ **A `0` STILL MEANS "NOTHING IS KNOWN TO BE MISSING", NEVER "EVERYTHING WAS VERIFIED."** Only
  WHATSAPP, TWILIO_SMS and TWILIO_VOICE have real prerequisite checks; every other `--type` returns
  the single always-action_needed deployment step and reports `ready: true` having checked nothing.
  The help said so and still does. Nothing was added to the success path — only the refusal is new,
  so the `0` makes exactly the claim it made before.
  
  **Under `--json` the not-ready path is now the ERROR document, not a `ready: false` one.** One
  document on stdout is a promise this CLI keeps on every terminal path, and a failure's document is
  the error one — printing the steps and then refusing leaves a document that parses cleanly and
  never says the channel is not ready.
  
  **Nothing actionable is lost with them.** The checklist — every step with its status — is in the
  error document's `message`, and the first blocking step's `action` (method, endpoint and hint
  text) is in its `hint`. That is the one step worth reading: this command stops at the first gap,
  so every step after it reads `pending` whatever its real state is. Run without `--json` for the
  table.
  
  **A script that parsed `.ready` must change**, in one of two directions: branch on `$?`, which is
  what the recipe stood in for, or keep parsing and read `.error` on the not-ready path. The ready
  path is untouched and still answers `{ type, ready, steps }`.
- 1ded4dd: **BREAKING FOR SCRIPTS THAT GATED ON `execution diagnose` OR `execution poll`.**
  Both printed a run's status and exited `0` over every value of it. `poll --watch` was the sharp
  one: it stops at COMPLETED, FAILED **or** CANCELLED and answered `0` on all three, so a wait loop
  written around it could not tell a run that finished from one that failed without re-reading the
  document it had just printed. `diagnose`'s help opens with START HERE, which makes it the first
  thing a debugging script calls and the first thing that told it nothing.
  
  `COMPATIBILITY.md` calls a `0` that becomes non-zero a break in the STABLE tier — it does not move
  a number, it changes what the command CONSIDERS a failure.
  
  **A FAILED run now exits non-zero. A COMPLETED run still exits `0`.** That is both commands, with
  `--watch` and without, and by execution id or by `--token`.
  
  ⚠️ **A CANCELLED RUN DID NOT FAIL, AND IT NO LONGER READS AS A PASS EITHER.** Somebody stopped it,
  so its nodes may have done everything, nothing, or half of it, and the platform never reached a
  verdict. It exits under the `unmeasured` category — an existing member of the taxonomy, no new
  exit code invented — which that category's own declaration describes as "NOT A FAILURE AND … NOT A
  SUCCESS". Reporting it as a failure would send you to debug a workflow that was never given the
  chance to be wrong.
  
  **A run that has not finished is UNMEASURED too.** `PENDING`, `RUNNING`, and any status a future
  platform adds that this build does not know: `diagnose` on a live run, and a one-shot
  `poll` of one, exit under the same category rather than `0`. That makes
  
  ```sh
  until nexus execution poll <id>; do sleep 5; done
  ```
  
  a wait loop whose exit code tells the three outcomes apart, where before every one of them was
  `0`. A terminal state added upstream will not silently read as green here.
  
  **`CANCELLED` and `not finished` share an exit code and never share a `code`.** The document says
  `CLI_RUN_CANCELLED` or `CLI_RUN_UNFINISHED`, because the reader's next move differs: one run is
  over and one is not, and waiting helps for exactly one of them.
  
  **Under `--json` a failure is the error document and nothing else.** Both commands could
  previously print their payload and then refuse, which takes stdout with a document that parses
  cleanly and never says the run failed. On a refusal the error document is now the one document on
  stdout. The success path is untouched — a COMPLETED run prints exactly what it printed before —
  and in prose mode the full diagnosis or poll record is still shown above the error.
  
  **A gate fix rides along.** `json-one-document.scan.ts` decided whether an error `code` was one
  this CLI mints by consulting a hand-written list, and that list had been missing
  `CLI_UPGRADE_NOT_RESOLVED` and `CLI_UPGRADE_NOT_VERIFIED_FOR_YOU` since the day they were added.
  It stayed green only because neither reaches the driven scan. It is derived from the declaration
  now, so the next code cannot be missing from it.
- 151386d: **BREAKING FOR SCRIPTS THAT GATED ON `tool test`, `external-tool test` OR `tool connection-status`.**
  All three printed a verdict and exited `0` whichever way it went.
  
  `COMPATIBILITY.md` calls a `0` that becomes non-zero a break in the STABLE tier — it does not move
  a number, it changes what the command CONSIDERS a failure.
  
  **`nexus tool test` and `nexus external-tool test` exit non-zero when the platform answers
  `status: "error"`.** Both call the same shape as `external-tool test-auth`, which has always done
  this; the two of them were the outliers sitting beside it. `tool test`'s own help calls a pass
  "proof that this agent can run this tool with this credential" — the claim a post-credential-change
  script gates on, and the exit code did not carry it. It does now, and the platform's own reason is
  in the error document's message.
  
  **`nexus tool connection-status` answers all four handshake states in its exit code**, so an OAuth
  poll loop never has to parse the document to decide whether to keep going:
  
  | status | exit | document `code` |
  | --- | --- | --- |
  | `COMPLETED` | `0` | — the record, with `connectionId`, is the document |
  | `PENDING` | non-zero, **UNMEASURED** | `CLI_HANDSHAKE_PENDING` |
  | `FAILED` | non-zero | `CLI_REMOTE_ERROR` |
  | `EXPIRED` | non-zero | `CLI_HANDSHAKE_EXPIRED` |
  
  ⚠️ **PENDING IS NOT A FAILURE, and it is deliberately not the failure code.** This command's own
  help calls PENDING the one state that means keep polling. A loop that read it as a failure would
  abandon a handshake about to succeed; one that read it as a pass would proceed with a
  `connectionId` of `null`. It exits under the `unmeasured` category — an existing member of the
  taxonomy, no new exit code invented — which that category's declaration describes as "NOT A FAILURE
  AND … NOT A SUCCESS".
  
  **`FAILED` and `EXPIRED` share an exit code and never a `code`.** A FAILED handshake is diagnosed
  from its `errorCode` and the same connection can be retried; an EXPIRED one outlived `expiresAt`
  and can only be replaced by a new `nexus tool connect`. `EXPIRED` is deliberately not `timed-out`,
  whose declaration says the server may still be completing the request — an expired handshake
  definitively is not.
  
  **Under `--json` a failure is the error document and nothing else** on all three commands.
  Printing the payload and then refusing takes stdout with a document that parses cleanly and never
  says the thing failed. The success paths are untouched: a passing test still prints its result, and
  a COMPLETED handshake still prints the record carrying `connectionId`. In prose the handshake
  record is still shown above the error.
  
  **What a script should do.** If you were parsing `status` to find out whether the thing worked, you
  can branch on `$?` now and keep the parse for the detail. If you were relying on the `0`, these
  commands were telling you nothing.
- eee632e: **BREAKING FOR SCRIPTS THAT GATED ON `workflow validate`, `workflow test-node` OR `workflow node test`.**
  All three printed an answer and exited `0` whichever way that answer went. A CI step written as
  `nexus workflow validate <id> && nexus workflow publish <id>` passed over a workflow with errors,
  and a node test that FAILED was indistinguishable, to `$?`, from one that passed.
  
  `COMPATIBILITY.md` calls a `0` that becomes non-zero a break in the STABLE tier — it does not
  move a number, it changes what the command CONSIDERS a failure — so here is the old behaviour
  and the new one, per command.
  
  **`nexus workflow validate <id>` now exits non-zero when `isValid` is false.**
  
  `isValid` is exactly "the `errors` list is empty". Nothing else moved:
  
  - **A WARNING IS NOT A FAILURE.** A workflow whose report carries warnings and no errors still
    exits `0`, because a warning does not block `workflow publish` and a `validate` that refused on
    one is a `validate` nobody would run.
  - **`readyToPublish: false` alone still exits `0`.** That field additionally demands a trigger and
    a fully configured graph, and this command's own `--help` records that a workflow failing it
    publishes anyway. Gating on it would refuse work the platform accepts.
  
  **`nexus workflow test-node` and `nexus workflow node test` now exit on the NODE's outcome — not
  on `status`.** They are two spellings of one endpoint and they answer identically; a single module
  decides for both, so they cannot drift apart.
  
  ⚠️ **`status` was already the wrong verdict, and that is the more expensive half of this.** The
  platform catches a failing node, stores it, and returns normally with the failure inside `data` —
  leaving no status on that arm, which the API layer then defaults to `"COMPLETED"`. So the field
  these commands printed read COMPLETED for a run whose node threw. Mapping it to an exit code as it
  stood would have shipped a gate that says PASS on a failure. The outcome is read from `data`
  instead, by the same rule the workflow builder's own test panel uses, so the CLI and the screen
  cannot disagree about whether the same node test failed.
  
  **A node test that goes to the background exits UNMEASURED, which is neither a pass nor a
  failure.** A plugin, an `aiTask`, a `loop`, a `cueNode`, a `firecrawl`, an `exaai`, a `sixtyfour`
  and most `parallelai` actions answer `status: "PENDING"` with `data: null` — the run has been
  dispatched and nothing has been measured. That used to exit `0`, which told a script the node
  works. It now exits with the `unmeasured` category and a distinct `code`
  (`CLI_NODE_TEST_NOT_MEASURED`), kept apart from the failure code on purpose: a caller must not go
  and debug a node that has not run yet.
  
  **Under `--json` a failure is the error document and nothing else.** All three commands used to be
  able to print their payload and then refuse, which takes stdout with a document that parses
  cleanly and never says the thing failed — a consumer reading stdout would see a report and never
  learn the workflow was invalid. On a refusal the error document is now the one document on stdout.
  The success path is untouched: a valid report, and a node test that passed, still print exactly
  what they printed before. In prose mode the record is still shown above the error, because
  `data.errorDetails` has nowhere else to go for a human.
  
  **What a script should do.** If you were parsing the document to find out whether the thing
  passed, you can now branch on `$?` and keep the parse for the detail. If you were relying on the
  `0`, these commands were telling you nothing and the exit code is what changed to say so.
  
  Every `--help` for the three states the new behaviour, in the CLI's own wording: a failure is
  described as NON-ZERO, and `nexus --help` holds the code table.
- 8a66334: **BREAKING FOR SCRIPTS THAT GATED ON `workspace status`.** It printed `live: yes|no` per recorded
  mount and exited `0` either way. Its own help already warns that a mount deleted server-side still
  appears in this list, which makes the exit code the only cheap way a script learns that a drive it
  depends on is GONE — and it always said "fine".
  
  **Any recorded mount reading `live: no` now exits non-zero, and the error names the slugs.** One
  dead row is enough: a script gates on the drive it depends on and cannot know which row that is.
  
  ⚠️ **AN EMPTY REGISTRY STILL EXITS `0`.** "No workspaces mounted." means nothing is recorded, which
  the help is careful to say is not a claim about what the OS has mounted. A machine with no mounts
  is doing exactly what was asked of it.
  
  **The exit code is `local-failed`, and that is deliberate.** No server is involved in this command
  at all — it reads the local mount registry. Nothing about your input is wrong and no retry against
  the API helps, which is that category's own definition. A remote code would name a host that was
  never contacted.
  
  ⚠️ **A `0` STILL MEANS "EVERY RECORDED MOUNT IS MOUNTED", NEVER "THE WORKSPACE IS THERE."** This is
  a PID check for rclone and a mount-table check for the native engine. A row can read live and still
  fail every read when the gateway refuses, the key was revoked, or the workspace was deleted — the
  help said so and still does. Confirm by reading one known file.
  
  **Under `--json` a refusal replaces the rows with the error document**, because one document on
  stdout is a promise this CLI keeps on every terminal path and a failure's document is the error
  one. The dead slugs are named inside it. When every mount is live the rows are exactly what they
  were, and an empty registry still answers `[]`.
  
  This is the last entry in the `status-verdict` ledger. The class is drained.

## 0.32.0
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
- fffae18: Fifteen hidden commands that silently reinstalled the CLI are removed. `nexus update`, `nexus latest` and `nexus up` keep working.
  
  `upgrade.ts` registered eighteen `{ hidden: true }` top-level commands so that "any intuitive word triggers the upgrade". That rule has no stopping point, and it reached words this CLI already uses for something else:
  
  | Word       | What the CLI otherwise means by it                                                  |
  | ---------- | ----------------------------------------------------------------------------------- |
  | `get`      | ends 40 leaves — `agent get`, `role get`, …                                         |
  | `update`   | ends 29 leaves                                                                      |
  | `install`  | a leaf under `mcp` and under `claude-code`, AND a declared alias of `skills update` |
  | `sync`     | a declared alias of `skills update`                                                 |
  | `download` | ends 2 leaves                                                                       |
  | `pull`     | ends 1 leaf                                                                         |
  
  Typed bare, every one of them replaced the running binary instead. They were absent from every `--help` by construction, and they carried no description, no flag and no argument — there was nothing in the CLI you could read to find out. `nexus skills update`'s own help already warns that `nexus skills install` and `nexus claude-code install` are "one word apart and resolve" to different things; a third, invisible meaning for `install` was the CLI arguing with itself.
  
  **Removed:** `get`, `new`, `install`, `sync`, `fetch`, `pull`, `download`, `refresh`, `reinstall`, `patch`, `bump`, `self-update`, `selfupdate`, `self-upgrade`, `selfupgrade`.
  
  **Kept:** `update`, `latest` and `up`, now declared aliases on `upgrade` rather than separate hidden commands. They appear in `--help` as `upgrade|update` and on the generated docs page, which is the first time any of these has been discoverable from the CLI itself. These three are the ones the published documentation already instructs you to type; adding a fourth means writing it down there first.
  
  **What you see if you typed one of the fifteen:** `unknown command`, exit 1, and a pointer to `nexus --help` — the same refusal `nexus get abc-123` already produced, because an alias with an operand was never able to reach the installer. `nexus upgrade` is the command, and it always was.
  
  These were the INTERNAL tier, which promises nothing: "You may rely on nothing here. Any of these names may be reclaimed for a real command, or removed." That is what makes this a removal rather than a deprecation cycle.
- f0f9741: `--json` answered prose at exit 0 on four paths, and on one of them a TYPO read as success
  
  `nexus --help` promises that `--json` prints one JSON document on stdout. Four
  invocations broke it in the direction a script cannot detect — a zero exit beside
  output that does not parse. Measured on the built binary at 0.26.0:
  
  ```
  $ nexus --json zzznope --help
    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗      # 14915 bytes of ROOT HELP
    …
  $ echo $?
  0
  ```
  
  `zzznope` is not a command. The CLI printed the root help and reported success.
  
  | Invocation                    | before                | after                                                   |
  | ----------------------------- | --------------------- | ------------------------------------------------------- |
  | `nexus --json --help`         | prose, exit 0         | `{"help":{"command":"nexus","text":"…"}}`, exit 0       |
  | `nexus --json --version`      | `0.26.0`, exit 0      | `{"version":"0.26.0"}`, exit 0                          |
  | `nexus --json docs`           | prose, exit 0         | `{"docs":{"web":…,"llmsIndex":…,"llmsFull":…}}`, exit 0 |
  | `nexus --json zzznope --help` | root help, exit **0** | the error document, exit **1**                          |
  
  ## Why
  
  JSON mode was decided inside the root program's `preAction` hook, so every path
  that ends BEFORE an action runs never learned about `--json`. The refusal funnel
  could not close it: it returns on `exitCode === 0` by construction, because
  turning `--help` into an error would be worse than the defect.
  
  The typo is a separate mechanism and it was never a `--json` bug. Commander
  renders a requested help screen before it reports an unknown command, so
  `nexus zzznope --help` exited 0 in prose mode too.
  
  ## What changes
  
  JSON mode is now resolved from argv before the parse, and every byte commander
  puts on stdout under `--json` becomes a document. A stray operand on a namespace
  is refused where the help would have rendered, keeping commander's "did you mean"
  suggestion.
  
  Two commands that print their own output are fixed with it:
  
  - **`nexus docs`** printed its links as prose under `--json`. It is the one
    command that is invocable AND a namespace, so the leaf-driven gate never
    reached it.
  - **`nexus vibe deploy`**, refused by the spend soft-limit under `--json`,
    printed the raw `confirmation_required` payload on stdout — a document in the
    shape a SUCCESSFUL deploy uses, for a deploy that did not happen. It now emits
    the error document, with the cost-safety status and the exact
    `--confirm-overage` re-run in the hint.
  
  ## ⚠️ Two behaviour changes a script can see
  
  **`nexus <typo> --help` exits 1 instead of 0**, with or without `--json`. A script
  that ran a misspelled command with `--help` and read the status as success now
  learns it was wrong. That is the point of the change; it is called out here
  because the old behaviour was, technically, a zero exit somebody could have been
  depending on.
  
  **`nexus --json --help` and `nexus --json --version` no longer print bare text.**
  A script that piped either into `grep` gets JSON now. Drop `--json` for the old
  output — prose mode is byte-identical to before on every help screen.
  
  `packages/cli/COMPATIBILITY.md` moves this guarantee into STABLE: `--json` yields
  one parseable document on every terminal path.
- f34b46a: 🔴 **BREAKING — every non-zero exit code `nexus upgrade` documented has moved.** It is the
  one command whose `--help` published an exit-code contract, and this release breaks it:
  
  | Was | Is   | Outcome                                                         |
  | --- | ---- | --------------------------------------------------------------- |
  | `1` | `7`  | the registry was unreachable                                    |
  | `1` | `9`  | the install command failed                                      |
  | `2` | `10` | installed, and your shell still resolves the old copy           |
  | `3` | `11` | installed, and it could not be checked FOR you (ran under sudo) |
  
  If you branch on `1`, `2` or `3` from `nexus upgrade`, update the script. No number
  changed MEANING anywhere else.
  
  `nexus --help` said "EVERY failure exits 1". That was true of one of the four exit maps this
  binary carried, and false of the other three. `handleError` returned 1 on every branch at 467
  call sites; the admin tree mapped HTTP status to 2/3/4/5/6 at 21 call sites; `nexus upgrade`
  published 2 and 3 in its own `--help` meaning "installed but your shell still resolves the old
  copy" and "installed but I could not check it for you" — the same two numbers the admin tree
  spends on "not authenticated" and "permission denied"; and `vibe app-logs --follow` exited 130.
  
  There is now ONE taxonomy, and every exit path in the binary reads it:
  
  | Code  | Meaning                                                                  |
  | ----- | ------------------------------------------------------------------------ |
  | `0`   | the command completed                                                    |
  | `1`   | a failure with no more specific category                                 |
  | `2`   | not authenticated — no usable credential, or one the server rejected     |
  | `3`   | permission denied — the credential is good and is not allowed to do this |
  | `4`   | not found                                                                |
  | `5`   | invalid input — bad flags, or the server refused the payload             |
  | `6`   | the server failed                                                        |
  | `7`   | could not connect. RETRYABLE                                             |
  | `8`   | timed out — THE SERVER MAY STILL BE COMPLETING THE REQUEST               |
  | `9`   | a local operation failed — an install, a config write, a spawn           |
  | `10`  | the operation RAN and the outcome did not happen. Retrying is the trap   |
  | `11`  | the operation ran and its result COULD NOT BE MEASURED                   |
  | `130` | interrupted (SIGINT)                                                     |
  
  **2 through 6 keep the meanings the admin tree already had**, because 21 call sites and a
  published table used them and those five meanings are general enough to be the whole binary's.
  7 through 11 are new. `nexus upgrade`'s two outcomes moved to 10 and 11 — one command's private
  vocabulary does not get to squat on numbers that mean something else everywhere else in the same
  binary — and that is the one break in this release.
  
  **Two other commands' `--help` named an exit code that changed.** `nexus mcp call` on a
  failing tool documented `1` and now exits `6` (or `5` when the input was refused), and
  `nexus admin`'s table said "every other command in this CLI exits 0 or 1 and nothing
  else" — which was true when it was written and is not now. Both help texts are corrected,
  and the admin table's `1  network or malformed response` row is now `7`.
  
  **Most failures now exit something specific instead of 1.** A 404 exits 4, a validation refusal
  exits 5, an unreachable API exits 7, a client-side timeout exits 8. Those 467 sites all said 1
  before, so there was nothing to branch on and nothing to break; `if nexus …; then` is unaffected,
  and a failure that exits non-zero today still exits non-zero. The admin tree's one change is that
  a network failure moved off the generic 1 onto 7, because a network failure is retryable and the
  generic failure is not knowably anything.
  
  **An auth refusal was coded `CLI_UNKNOWN_ERROR`.** "No profiles configured" and "no active profile
  set" — the two most common first-run failures — threw a bare `Error`, so a script could not tell
  "you are not logged in" from a crash, on the one failure with a one-command remedy. Both now carry
  `CLI_NOT_AUTHENTICATED` and exit 2.
  
  `nexus --help` prints the table above instead of the sentence it was breaking, and a test asserts
  the screen and the code agree. `packages/cli/COMPATIBILITY.md` moves exit codes out of UNSTABLE:
  what each number MEANS is now stable, while WHICH category a given failure lands in is evolving
  and moves only from 1 toward something more specific.
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
- 737729c: `agent-tool create/update` now says which prompt-handled parameters `agentInputSchema` has to name
  
  A skill parameter with `handler: "prompt"` is filled by the AGENT, under its own
  name, and the only thing that advertises it is `agentInputSchema` — the flat map
  that becomes the tool's `input_schema.properties` verbatim. A parameter's
  `prompt` is the description the agent reads while filling that one parameter; it
  is never an instruction the platform executes to assemble it out of other inputs.
  
  So a caller-supplied `agentInputSchema` that omits a prompt-handled parameter
  makes it unfillable, and nothing said so: the action ran with the parameter
  empty and still answered `success`. A `supabase-insert-row` skill whose `data`
  object was prompt-handled, attached with a flat schema naming only the scalars
  the prompt referred to, inserted an all-null row and returned HTTP 201.
  
  The API now refuses that at create and at update with a `400` naming the
  parameter. `nexus agent-tool create --help` and `nexus agent-tool update --help`
  carry the rule and both ways to satisfy it — name the parameter in
  `agentInputSchema`, or send `{}` and let the platform compute the schema from
  `config.parameters`. The update note also states that a schema-only update is
  checked against the STORED `config.parameters`: leaving `--config` out does not
  leave the parameter behind, it leaves it unfillable.
  
  No CLI behaviour changes — this is help text plus the API refusal it describes.
  An update that carries no `agentInputSchema` at all (a rename,
  `--no-fire-and-forget`) is never re-checked, so an existing config cannot be
  stranded behind the new error.
- 4213812: `nexus --help` now leads a reader to the stability contract, which nothing in
  the binary pointed at.
  
  `COMPATIBILITY.md` states what a script may rely on — four tiers, and what
  counts as a breaking change for each. No command, no help screen and no error
  named it. The document IS mentioned 30 times inside `packages/cli/src`, and
  every one of those is a comment, a test, or a ledger note only a test reads —
  never a string the program prints. The only pointers a user could reach were two
  links inside `README.md`, a file you open after you already went looking for the
  repository. A contract nobody can find FROM THE TOOL is worse than an absent
  one: the tiers exist, so a maintainer believes scripting expectations are set,
  while the person writing the script has never been shown them.
  
  The root epilogue gains a `WHAT YOU MAY SCRIPT AGAINST` block naming the four
  tiers and linking the document.
  
  The link is an absolute URL rather than `packages/cli/COMPATIBILITY.md`, because
  a repo-relative path names a file that is on no installed copy of this CLI:
  `files` ships `dist` and nothing else, so the document is absent from every
  `npm install -g @agent-nexus/cli`. The public mirror named by `repository.url`
  is the one place a reader can open it, and it is already what `homepage` points
  at.
  
  No behaviour changes.
- e427a8e: `nexus tracks task claim <taskId> --agent <name>` — say you are working on a
  track task, taking it over if another agent already was.
  
  A claim refuses nothing and takes no lock. Claiming a task another agent holds
  SUCCEEDS and overwrites it, because claiming and taking over are the same
  operation — which is why there is no separate take-over verb. The next agent to
  read the task is told who holds it and how long ago that agent was last heard
  from, and decides for itself.
  
  The registration is also the SOURCE of a generated string. Every read of a track
  task carries a banner naming this command, and that string is read off this
  command node rather than typed — the parent chain supplies the words, the
  declared argument and required option supply the placeholders. Renaming the
  command therefore breaks the build rather than the banner: the generator exits
  non-zero naming the action, a build-time test refuses a banner naming a command
  the CLI does not register, and a fifth generated-drift target catches a committed
  map that stopped matching the tree.
- 0bacbb2: `tracks ready` is swept now that its route answers on staging
  
  `GET /public/v1/tracks/ready` shipped after the sweep disposition for
  `tracks ready` was written, so the leaf was parked `registration-only` — the
  sweep asserted the command still existed and never ran it. The route now answers
  `200` on staging, so the leaf is `safe` and the sweep executes it again.
  
  The classified command set moves from 58 `safe` leaves to 59. `COMPATIBILITY.md`
  records the new figure; nothing else about the command tree changed, and no
  command's flags, output or exit codes are affected.
  
  **It is `safe` rather than `safe-with-fixture`, deliberately.** Staging holds no
  ready tracks, so the route answers `{"tracks":[]}` — and `safe-with-fixture`
  additionally asserts a non-empty response, which would score that `EMPTY` and
  fail. An empty list is the correct answer for this leaf: it proves the route is
  alive, authorized and shaped like JSON, and it was never going to prove anything
  about item shape.
  
  The parking rule that governed this leaf is now stated once, in the present
  tense, as a rule carrying its own probe rather than as a note about somebody's
  intention to remember. `cue conversations` sat under the note form and its prose
  went stale — the leaf had already been flipped to `safe` while the comment above
  it still asked a reader to flip it. Both comments now describe what is true.

## 0.31.0
### Minor Changes

- eef5f93: A folder-list `--json` document now carries the agent-to-folder map
  
  **BREAKING for three commands' `--json` envelope.** `folder list`,
  `deployment folder list` and `template folder list` printed a bare array of
  folders. They now print the route's own response object. `jq '.[]'` selects
  nothing against the new shape — use `jq '.folders[]'`.
  
  ## What was wrong
  
  `GET /folders` answers `{folders, assignments}`. The action did
  
  ```ts
  const folders = result.folders ?? result;
  printTable(folders, COLUMNS);
  ```
  
  `printTable` owns the only `if (jsonMode)` branch, so it is the one line that
  knows whether a table or a document is wanted — and the narrowing happened the
  line above it. Both channels lost `assignments`, `--json` included.
  
  That field is the only agent-to-folder map either surface publishes: a folder
  row carries no membership at all. So the flag whose entire purpose is machine
  consumption was the one that could not answer "which folder is this agent in",
  and the command's own `--help` documented the gap and pointed at
  `nexus api GET /folders` instead.
  
  ```bash
  # Now answerable from the command itself
  nexus folder list --json | jq '.assignments[] | select(.agentId=="<id>") | .folderId'
  ```
  
  ## The tables gained a count
  
  Each of the three prints a membership column — `AGENTS`, `DEPLOYMENTS`,
  `TEMPLATES` — folded from the same `assignments[]` the document carries. It is a
  fold of the response beside it, so a reader who distrusts the number can
  re-derive it from the same output rather than from a second call that may
  disagree. Nesting is not rolled up: a parent's count is its own assignments.
  
  ## The class, not the instance
  
  The narrowing-before-the-branch shape is copy-paste — a table takes one array,
  so the action takes one array, and the document inherits the table's taste. Two
  commands had already been cured by hand with an `if (isJsonMode())` early return
  and their own `console.log(JSON.stringify(...))`, which is correct, has to be
  remembered, sits outside the one-document guarantee, and leaves the command
  unclassifiable to the `--json` shape derivation — so neither published a shape
  line in `--help`.
  
  `printEnvelope(envelope, render)` in `src/output.ts` is that split as a
  mechanism: the envelope is the document, the callback runs only when there is a
  terminal to draw for, and a call site cannot narrow the wrong channel because it
  never chooses the channel. `skill-folder list` and
  `permissions access` move onto it with no change to their output, and both now
  carry a `--json` shape line where they carried none.
  
  `envelope` is a sixth `--json` shape, derived and stated in `--help` like the
  other five. 368 of 519 leaves now carry a shape line, up from 366.
  
  ## It cannot come back unnoticed
  
  `src/commands/envelope-narrowing.scan.ts` asks the type checker, for every
  printer handed one key of a response, what happens to that response's other
  keys — counting a key read only into the terminal as still lost. Every surviving
  site is listed in `envelope-narrowing.ledger.ts` with the keys it drops and the
  reason it is still there; a new one fails the build.
- e997cdd: The CLI now tells you when the server answers with a shape the API does not publish
  
  `--json` output is the server's payload, printed verbatim. When a field is
  renamed or retyped on the server, that output changes and nothing tells you —
  your script breaks and the CLI reports success.
  
  The SDK compares each payload against the shape its route publishes in the
  Public API v1 contract. On a mismatch the CLI now prints one warning to
  **stderr**:
  
  ```
  ⚠ the server answered GET /documents/abc with a shape the API does not publish
    size: the route publishes null | number and the payload holds string
    This is a bug in the API, not in your command — the data above is printed unchanged.
    Silence these warnings with NEXUS_CONTRACT_WARNINGS=off
  ```
  
  **Your data is never altered.** The payload is printed exactly as it arrived,
  warning or not — verified byte-for-byte with the warnings on and off. Discarding
  a field the CLI did not recognise is the failure this exists to detect, so it is
  not something it will do to you.
  
  **stdout stays parseable.** The warning goes to stderr, so `nexus … --json | jq`
  is unaffected.
  
  **One warning per distinct problem per command**, not one per row — a drifted
  field is drifted in every element of a list.
  
  **Only real mismatches are reported.** 113 v1 routes publish no response schema;
  those reads are unchecked and silent, because a line on almost every command
  would teach you to stop reading them.
  
  Set `NEXUS_CONTRACT_WARNINGS=off` to silence it. Doing so also skips the
  checking work entirely.

### Patch Changes

- 78680f6: A destructive command can no longer skip its confirmation unnoticed
  
  Six commands parsed `--yes` themselves instead of going through
  `confirmable()` + `confirmDestructive()`. All six refused correctly, which is
  why they lasted — but a correct copy of a rule is still a second place the rule
  can change, and the gate over the tree could only ever prove a `--yes` was
  DECLARED, never that the branch behind it was the shared one.
  
  `phone-number buy`, `phone-number release`, `workspace delete`,
  `vibe app delete`, `vibe app rotate-edge-token` and `vibe git-project delete`
  now use the shared helper. Behaviour is unchanged for the first three: without
  a terminal and without `--yes` they refuse and do nothing.
  
  **Two behaviours change on the three `vibe` verbs**, both toward the rest of
  the CLI:
  
  - Under `--json` at a terminal they now ASK instead of refusing outright. The
    question goes to stderr, so a `--json` run's stdout is still one document.
  - The refusal message is the shared one. It still carries the exact re-run
    command — `confirmDestructive` takes a `rerun` hint now, so a per-command
    line no longer costs a second implementation of the rule.
  
  **`nexus skills update` no longer decides on stdout.** Its location picker — the
  question asking which `.claude` folder to write to — tested
  `process.stdout.isTTY` and printed with `console.log`. A confirmation READS, so
  three invocations were wrong at once:
  
  - `nexus skills update > log` from a real keyboard skipped the picker and wrote
    dozens of files to the detected root with nobody asked which root that was.
  - `echo 2 | nexus skills update` at a terminal asked, and consumed an answer
    arriving from a script rather than a person.
  - `nexus skills update < /dev/null` at a terminal asked against a stdin that had
    already ended, and sat there forever.
  
  It now tests stdin and asks on stderr. The destructive confirmation in that
  command was always the shared one and is unchanged.
  
  **And the gate that lets none of this back in.** Every leaf whose name carries a
  destructive verb, or that declares `--yes`, is now DRIVEN with no terminal and
  no `--yes`, and must be observed reaching `confirmDestructive` and then acting
  on nothing — a call, not a declaration, because a flag can be declared and never
  read. A command in neither the obligation set nor a reasoned exemption fails the
  build by name.
- 68c8bdc: Publish the CLI's whole public surface as one generated manifest, so a change to
  it shows up as a diff.
  
  `src/cli-surface.generated.ts` records every invocable leaf — its path, its
  positionals in order, every flag with its mandatoriness, hiddenness and value
  choices, whether it is destructive and how its `--yes` is wired, its `--json`
  envelope shape, its `COMPATIBILITY.md` tier, and a rename-stable identity. It is
  walked off the real commander tree, never grepped, and a spec recomputes it and
  fails byte-for-byte, so a pull request that moves the surface stays red until its
  author regenerates.
  
  Nothing about the shipped binary changes. `pnpm --filter @agent-nexus/cli run
  gen:cli-surface` writes the file.
- 77738e2: `NEXUS_NO_AUTO_UPDATE` stops the version LOOKUP, not only the self-install
  
  Every non-`--json` invocation made a blocking request to `registry.npmjs.org`
  once per 24 h, and neither documented way to turn the updater off stopped it.
  
  Measured on 0.26.0, built, with `globalThis.fetch` wrapped, against a fresh
  `HOME`, running `nexus auth status`:
  
  | invocation | requests to `registry.npmjs.org` |
  | --- | --- |
  | no variable set | 1 |
  | `NEXUS_NO_AUTO_UPDATE=1` | 1 |
  | `CI=1` | 1 |
  | `--json` | 0 |
  
  `--json` was the only thing that stopped it.
  
  ## Why the escape hatch did not work
  
  `index.ts` decides what to do after each command with one `if`:
  
  ```ts
  if (opts.autoUpdate && !isAutoUpdateDisabled()) {
    await autoUpdate(VERSION);   // install over yourself
  } else {
    await checkForUpdate(VERSION); // ask npm, print a notice
  }
  ```
  
  `isAutoUpdateDisabled()` was a term in the FIRST arm only, and `--auto-update`
  is off by default — so the `else` arm was both the default path and the one
  holding the network call. Setting the variable did not disable the updater; it
  selected the half of it that talks to npm.
  
  **That is the general shape, not a typo:** an opt-out placed in one arm of a
  two-arm decision does not remove the behaviour, it picks which half you get.
  The gate now lives inside `checkForUpdate` and `autoUpdate`, beside the side
  effect each one owns, so a caller cannot route around it.
  
  ## What changes
  
  - **`NEXUS_NO_AUTO_UPDATE`, and `CI`, now suppress the version lookup.** No
    request is made on any invocation while either is set.
  - **The notice is unchanged.** These variables are documented as "ignore
    `--auto-update`, print the notice instead", and they still do: with the
    lookup skipped the notice is served from `~/.nexus-mcp/version-check.json`,
    written by the last permitted check. Removing the notice as well would have
    been a second broken promise rather than a fix.
  - **The cache timestamp is not touched on a skipped check**, so unsetting the
    variable checks immediately rather than staying quiet for the rest of the day.
  - **`0` and `false` are still read as "not set"**, unchanged, so
    `CI=false` turns the updater back on.
  - **`nexus upgrade` is unaffected.** It looks the latest version up directly;
    an explicit upgrade command is the user asking, and the gate is deliberately
    placed above the fetcher rather than inside it.
  
  ## What it is worth
  
  Same build, same command, cold cache, wall clock for the whole invocation:
  
  | | before | after |
  | --- | --- | --- |
  | `NEXUS_NO_AUTO_UPDATE=1` | 378–758 ms | 85–88 ms |
  | no egress (request cannot complete) | 3093 ms | 85–88 ms |
  
  The 3 s figure is the CLI's own abort ceiling: an air-gapped runner, a container
  with no egress, or a proxy that blackholes the registry paid it once a day with
  no way to opt out. `--json` skipped it, which is why scripted use rarely saw it
  and interactive use always did.
  
  Unset, nothing changes: the check still fires at most once per day and still
  prints the same line.
- c7de914: `workflow node-type` help says which half of a field to read
  
  The schema this command prints now carries `values` on every field whose legal
  set is closed, and a write of anything else is refused with
  `400 NODE_FIELD_VALUE_INVALID`. The record already printed the key; nothing said
  what it was for, or that it is the half to act on.
  
  `type` is prose. It reads like a union — `'"hours" | "minutes" | "days"'` — and
  it can name FEWER values than the server accepts: `scheduleTrigger.interval`
  advertised three units while six have always worked. So the Notes now say to read
  `values`, that the empty string is always accepted (it means "not configured
  yet"), and that a field with no `values` is unchecked rather than unconstrained.
  
  Help text only. No command changed behaviour.
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
- d67952d: The daily update check no longer holds the process open
  
  Every command answered the update question from a cache that refreshes once per
  24 hours, and the invocation that happened to be the one refreshing it WAITED on
  `registry.npmjs.org` before it could exit. The refresh now runs in a detached
  child process, so the current invocation never waits, and the number it prints
  is whatever the last run already learned.
  
  ## What it cost, measured on 0.26.0, `nexus auth status`, expired cache
  
  Both columns built from the same tree and run alternately on one machine, five
  invocations each:
  
  | condition                           | before       | after  |
  | ----------------------------------- | ------------ | ------ |
  | warm cache (no refresh due)         | 91 ms        | 89 ms  |
  | refresh due, registry reachable     | 448 ms       | 118 ms |
  | refresh due, registry never answers | **10613 ms** | 94 ms  |
  
  The whole remaining cost of a due refresh is the ~29 ms it takes to start the
  child.
  
  ## The 10-second case is the one that mattered, and it is not a timeout bug
  
  The fetch already had a 3-second `AbortController` ceiling, and that ceiling
  worked exactly as written — the promise rejected at 3.0 s. The process still did
  not exit for another 7.6 s.
  
  Aborting a `fetch` rejects the PROMISE. It does not close the connection the
  request is still trying to open, and an open connection is a handle on Node's
  event loop, so the runtime refuses to exit while one is pending. The remaining
  wait is undici's own 10-second connect timeout. Output was complete at 90 ms; the
  shell prompt came back at 10.6 s.
  
  This is also why the obvious fix — start the fetch and simply not `await` it —
  is not a fix. It moves the wait from before the last line of output to after it
  and changes the total by nothing.
  
  ## The trade
  
  A version published minutes ago is announced one invocation late. Against a
  24-hour check interval that is noise, and it buys every invocation an exit that
  never touches the network. The self-install path (`--auto-update`) makes the same
  trade, and it is the safer half of it: the CLI never installs on the strength of
  a version the user has not already been shown.
  
  ## What it will not do
  
  - **It starts nothing under the opt-outs.** `NEXUS_NO_AUTO_UPDATE` and `CI`
    already stopped the request; they now also stop the child. A detached process
    making an unasked-for registry call is the worse version of the same offence,
    because it outlives the command that started it.
  - **It cannot corrupt the cache, and cannot be corrupted by an interrupted
    write.** The refresher writes a temporary file and renames it over the cache,
    which is atomic within a directory, so a reader sees the whole old file or the
    whole new one. A cache that is unreadable anyway degrades to "no cache" — on
    the synchronous path `--help` uses as well as the asynchronous one.
  - **It does not spawn twenty children for twenty parallel invocations.** A lock
    directory (`mkdir` is create-or-fail in one syscall) admits one refresher; a
    lock left behind by a killed one ages out after a minute.
  - **It cannot fail a command.** A refusal to spawn — a sandbox, a read-only home
    directory, no writable state directory — is swallowed, and nothing is written
    to stdout, so `--json` output stays one parseable document.
  
  `nexus upgrade` is unchanged and still looks the version up directly: an explicit
  upgrade is the user asking, and it has to answer from the registry rather than
  from yesterday's cache.
- 544818e: `nexus version delete --help` said the refusal "LOOKS LIKE AN OUTAGE" and that
  deleting the production version "answers HTTP 500 rather than a 4xx naming the
  reason". Both were true and both stop being true in the same change: the API now
  refuses with HTTP 409 and the code `PRODUCTION_PROMPT_VERSION_IN_USE`, naming the
  version and what to publish instead.
  
  The help text is the stopgap that ticket shipped while the API was wrong. Leaving
  it would have taught every reader to expect a 500 from a path that no longer
  produces one.

## 0.30.0
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
- 5827348: The bundled `nexus-workflow-builder` skill listed `equals`, `not_equals`, `is_empty` and `not_empty` as working on "all types". They do not, and the failure is silent: a real operator on the wrong `field.type` is accepted, stored and read back unchanged, then evaluates to the same value on every run, so the branch takes one path for ever with nothing reporting it. `is_empty` is false for every number and every boolean; `equals` is false for every object and every array. Each row now names the field types the operator is actually meaningful on, and the guide says what happens outside them.

## 0.29.0
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

- 425ec9a: A refusal under `--json` answered NOTHING on stdout, and the gate built to catch that read zero
  
  `nexus --help` promises: *"Under --json an error is a JSON document on STDOUT:
  `{"error":{"message","hint","code"}}`, all three keys ALWAYS present"*. Six ways
  of getting an invocation wrong broke it, and every one of them exited 1 with an
  EMPTY stdout and prose on stderr — the one combination a caller cannot work
  around by output shape OR by status.
  
  Measured on the shipped binary:
  
  ```
  $ nexus agent get --json
  error: missing required argument 'id'          # stderr
                                                 # stdout: 0 bytes
  $ echo $?
  1
  ```
  
  ## Why
  
  JSON mode is decided from `--json` inside the root program's `preAction` hook.
  Commander refuses an invalid invocation **above the hook chain** — before any
  hook runs — so at the instant of the refusal the process did not yet know it was
  in JSON mode, and the error printer took its human branch.
  
  The refusal already reached the right funnel: `installArgumentRefusalReporting`
  turns commander's exit into a typed throw and `handleError` builds the document.
  What was missing was the one fact that decides which channel it goes on.
  
  ## What changes
  
  Every refusal commander decides itself now emits the documented envelope on
  stdout when `--json` is in the invocation:
  
  - a missing required argument (`nexus agent get --json`)
  - an unknown command, at the root or inside a namespace
  - an unknown option
  - a value outside a `.choices()` set
  - too many arguments
  - a root option whose value parser throws (`nexus --timeout abc … --json`)
  
  **Exit codes are unchanged.** A refusal still exits 1, and `--help` / `--version`
  still exit 0 and still print help rather than an error. Without `--json` a
  refusal still prints prose on stderr, exactly as before. Commander's own
  one-line `error: …` stays on stderr in both modes; what is new is the document
  beside it.
  
  ⚠️ **A script that treated an empty stdout as "the CLI itself is broken" now
  gets a parseable document with `"code": "CLI_INVALID_ARGUMENTS"`.** That is the
  code the root epilogue already documents for an invocation refused before
  anything was sent, and it is the field to branch on.
  
  ## And a missing command now says what is missing
  
  Commander answers "no command was given" by printing the help screen and exiting
  with the literal marker `(outputHelp)` as its message. That reached the error
  document as its `message` — a field a machine parses, saying nothing, on the one
  failure with the most obvious remedy in the CLI. Two sentences replace it, the
  same hint and the same exit code beside each, and the help screen still goes to
  stderr:
  
  - `nexus --json` → `"No command given."`
  - `nexus agent --json` → `"No subcommand given for \"nexus agent\"."`
  
  Commander raises one code for both, so a single sentence would have denied a
  command the caller plainly supplied while the hint named that namespace's help.
- 0e33dda: `nexus --help` no longer says scopes are non-hierarchical — a write scope now carries the matching read.
  
  The API's `checkScope` had **no action hierarchy at all**: `<r>:write` did not imply
  `<r>:read`, and only `<r>:*`, `*:<action>` and `*:*` bridged two actions. Twelve destructive
  v1 routes prescribe a pre-flight read in their own descriptions, and that read needed a scope
  the destructive route did not — so the description read as complete, a caller followed it
  exactly, and a `403` was the first thing that said otherwise.
  
  The sharp case is the replace-style `PUT`, where the body is the whole list and every element
  omitted is deleted at `200` — the route's own words are that success and total data loss are
  the same response. The prescribed `GET` was the only safeguard and it was exactly what the
  refusal removed.
  
  **`<r>:write` now satisfies `<r>:read` on the same resource. Nothing else bridges:**
  `:write` does not imply `:delete`, `:delete` implies nothing, `:read` and `:execute` imply
  nothing, and the implication never crosses a resource.
  
  Two help surfaces led with _"Scopes are NOT hierarchical"_, which is now false in one
  direction. Both state the one implication and the things that still do not bridge, so a key is
  minted for what it actually needs rather than for what the old sentence implied:
  
  - `nexus --help`, the `SCOPES AND WHO YOU ARE` section.
  - `nexus workspace --help`, where the sentence introduced the mount's scope note. That note's
    actual point is unchanged and now leads: **deleting needs `workspaces:delete`, which write
    does NOT imply** — a read-write mount whose key lacks it fails every `rm` with a `403` while
    `cp` keeps working. `workspaces:write` does now carry `workspaces:read`.
  
  The other per-command notes that name a specific gap — `conversation delete` needing
  `conversations:delete`, `phone-number delete` needing `phone_numbers:delete`, the
  deployment-folder scopes a `deployments:*` key does not reach — were each re-checked and are
  unchanged, because every one of them is a `delete` or a different resource.
  
  No command, flag, output shape or exit code changes.
- 4bf96d2: `agent create` and `agent update` help now lists the four valid model providers
  
  `--model-provider` documented no values at all. The help printed the flag, and a
  caller had to send one and read the 400 to learn what the server accepts.
  
  It now prints them:
  
  ```
  modelProvider — one of:
      OPEN_AI, ANTHROPIC, GOOGLE_AI, KIMI
  ```
  
  The same four reach `nexus agent create --help`, `nexus agent update --help`,
  `--print-contract`, and the generated docs page for the `agent` namespace. Each
  page's "Not shown: N optional field(s)" count drops by exactly one, because the
  field became documented rather than being omitted from the summary.
  
  ## Why the help changed without the CLI changing
  
  Nothing in this package was edited by hand. `generate-contract-help.ts` reads the
  v1 Zod contract to build each flag's choices, and it can read a `z.enum` while a
  bare `z.string()` gives it nothing to publish — so the flag was emitted as
  `type: "unknown"` with no `enumValues`.
  
  The contract's agent write bodies declared `modelProvider: z.string().max(255)`
  beside a `modelConfig.modelProvider` that was already the four-member
  `ModelProvider` enum. Both land in the same stored key, so the enum was defeated
  by the door next to it: `modelConfig.modelProvider: "MISTRAL"` was refused while
  a flat `modelProvider: "MISTRAL"` on the same body was accepted, on both POST and
  PATCH. Narrowing the flat field to the same schema closed that, and the generator
  then had an enum to read.
  
  ⚠️ **The server now refuses an unrecognised provider with a 400 where it used to
  accept one.** That is the point of the change rather than a side effect: the
  value was never storable in a shape the read contract could describe, and it
  would have been published back against the same four-member enum. Production
  holds zero non-member rows across 1,340 agents, so nothing was relying on it.
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
- 69a1303: CLI startup halves — the bundled skills payload is no longer compiled into every invocation
  
  Every `nexus` command paid to read and compile an 8.4 MB skills payload before it
  did anything, including `nexus --version`, which never reads that data at all.
  
  Measured on the built bundle, same machine, same method:
  
  | | bundle | `nexus --version` |
  |---|---|---|
  | before | 10.40 MB | ~178 ms |
  | after | 1.75 MB | ~81 ms |
  
  **~97 ms saved per invocation, about 54% of startup**, and it is paid back by every
  command that never touches the skills data — which is nearly all of them. Scripts
  that shell out to `nexus` in a loop pay it once per call.
  
  ## What changed
  
  The payload moved out of `skills-content.generated.ts` and into
  `skills-content.generated.json` beside it, read with `readFileSync` +
  `JSON.parse` on FIRST USE and cached for the rest of the process. Only
  `skills`, `claude-code` and the installer ever load it.
  
  `tsup` copies the asset into `dist/`, and the package already ships
  `files: ["dist"]`, so it travels in the published tarball. `splitting: false` is
  unchanged — this is two files, not a chunk graph.
  
  ## Why it was not the obvious win
  
  A first attempt to attribute the cost was WRONG and a control caught it. An 8.2 MB
  synthetic module of flat string literals loads in ~39 ms, which suggested the
  payload was cheap. The real payload is a deep object graph of `{ path, content }`
  entries built from template literals that V8 must CONSTRUCT at module scope, not
  merely parse — so it cost ~2.4× the prediction. Cheap to load is not the same as
  cheap to have in the bundle, and only the real before/after showed it.
  
  ## Safety
  
  The bundle is now TWO files that ship and can be replaced separately, so both
  halves carry the source commit and are checked against each other:
  
  - `SKILLS_NEXUS_SHA` and the `// Source:` header stay INLINE in the module, so the
    `Skills bundle pinned` gate needs no network and no parse of the asset.
  - The asset carries its own `sha`. `check-skills-lock.ts` asserts it equals the
    lockfile, and the CLI asserts the same at runtime — a payload from a different
    generator run cannot sit silently beside the module.
  - Four new self-test cases cover the asset going missing, unparseable, sha-less
    and stale. Verified against the real tree, not just the fixture: deleting the
    asset takes the checker from exit 0 to **exit 1** naming `ASSET_MISSING` and the
    path, and restoring it returns exit 0.
  
  A missing payload is reported as a named install error identifying the file, never
  a bare `ENOENT` from inside an unrelated command.
- d77b4cf: `--help` now states each command's own `--json` shape, `--json` carries a `dashboardUrl`, and `nexus api` refuses a doubled path prefix
  
  Three per-command facts a caller previously had to discover by running the
  command, or by reading a document kept outside this repository.
  
  ## Each command's own `--json` shape
  
  `--json` is not uniformly wrapped, and the wrapping is not derivable from a
  command's name: `agent list` answers `{data, meta}`, `task list` answers a bare
  array, `agent create` answers `{success, …}` and `agent get` answers the resource
  flat. The cost of guessing is SILENT — a `jq` path against the wrong pattern
  returns `null`, which reads as an empty field rather than as a wrong parse — so
  the pipeline succeeds and the value is simply gone.
  
  362 of the 507 leaf commands now print one line naming which shape they return
  and how to iterate it:
  
  ```
  OUTPUT --json: A BARE ARRAY — the rows ARE the document. No envelope, no
    meta, [] when empty. jq '.data[]' selects nothing here; use jq '.[]'.
  ```
  
  **Nothing here is authored.** The five shapes are five functions in `output.ts`,
  each with one `if (_jsonMode)` branch, so "which shape does this command print"
  is the same question as "which of the five does its action reach" — read off the
  code, projected into a generated map, and re-derived by a spec that fails on any
  difference. A command whose printer changes turns the build red instead of
  shipping a line describing the old shape.
  
  **The 145 commands with no line are the honest half.** An action that composes
  its own document — itself, or through a helper that branches between a printer
  and a hand-built document — cannot be answered syntactically, and a default
  would be a claim nobody measured. The generated file records the shadow by
  reason rather than leaving it as an absence.
  
  Three commands proved that the hard way, and each was CLASSIFIED by an earlier
  version of this scan. `workspace search` opens with
  `if (isJsonMode()) { …; return; }` and only then falls through to `printTable`.
  `role automation-settings` reaches `printStatedOrNothing`, a helper that prints
  a record OR the literal document `null`. `workflow test` prints a record without
  `--follow` and streams NDJSON through `runFollow` with it, so the printer and
  the writer sit on different branches. Each would have shipped a confident
  sentence contradicting the command's own help; each is a named control now.
  
  ## `dashboardUrl` in the payload
  
  `create`, `get`, `update` and `duplicate` on agent, workflow, deployment, AI
  task, external tool and document template now return a `dashboardUrl` — the page
  for the resource — in `--json` and as a `Dashboard` line in the human output.
  
  The alternative was printing the URL PATTERN into `--help`. That moves the copy
  without fixing the class: the patterns live in the SPA's router, one package
  away, so a rename leaves a confident sentence pointing at a 404 that reads as
  "the resource was not created". A returned field cannot drift for the caller, and
  it puts every pattern in one file, which a gate can hold — that gate reads
  `apps/frontend/src/routes.tsx` and fails when a pattern stops matching a declared
  route.
  
  The field is this CLI's own, not an API field, and each help screen says so. An
  absent id yields no key at all rather than `/app/workflows/undefined`, which
  renders an error page at 200 and looks openable.
  
  ## `nexus api` refuses a doubled prefix
  
  `nexus api <method> <path>` prepends `/api/public/v1`, so a full path pasted from
  a doc page sent it twice and came back 404 — indistinguishable, from this command,
  from "no such route at this version". The four redundant spellings are now refused
  locally, naming the path you meant, before anything leaves the process.
  
  ## Two node-shape facts in `workflow` help
  
  A workflow node's configuration lives under the node's own `data` key, so the
  label is `.nodes[].data.label` and never `.nodes[].label`. `workflow get --help`
  previously explained the WORKFLOW's unrelated top-level `data` blob and nothing
  else, which made the collision worse rather than better. Both `workflow get` and
  `workflow node get` now state the nesting with the `jq` line that reads it.
- 83302b5: `user-group --help` no longer sends you to a command that does not exist
  
  `nexus user-group update` documents the one thing about it that surprises people
  — a name is required on every update, so passing `--user-ids` alone is not
  expressible and guessing a name RENAMES the group. Its remedy was a copy-paste
  line built on `nexus user-group get <id>`:
  
  ```bash
  nexus user-group update <id> --name "$(nexus user-group get <id> --json | jq -r .name)" --user-ids user_abc
  ```
  
  **There is no `user-group get`.** Not in the CLI, not in the SDK, and not in the
  API: `v1-user-groups.controller.ts` declares `GET /user-groups`, `POST`, `PUT`,
  `DELETE` and the two membership verbs, and no per-group read. Pasting that line
  answers `error: too many arguments for 'user-group'`, and the reader hits it at
  the exact moment the help had just told them a careless update renames the group.
  
  `user-group list --json` already carries what the recipe wanted — `memberUserIds`
  and `name` come back for every group in the one call — so the note now takes the
  name from there:
  
  ```bash
  name=$(nexus user-group list --json | jq -r --arg id <id> '.data[] | select(.id == $id) | .name')
  nexus user-group update <id> --name "$name" --user-ids user_abc
  ```
  
  `user-group list`'s own Notes made the same claim from the other side ("the
  member ids come back from … `user-group get`") and now says where they really
  come from. The absent per-group read is a real gap in the v1 surface; it is not
  closed here, and no help text pretends otherwise.
  
  ## The gate that let it ship, and what it sees now
  
  NEX-3714 reported `task create --help`'s `--body` example as unrunnable on CLI
  0.22.1. It runs on 0.24.0 and later — `--body` has satisfied a required flag
  since that release, and `help-truth`'s R1 rule (commander is the real parser;
  what it refuses, a reader cannot run) gates the class. Verified by mutation:
  deleting `"name"` from that example's body reddens R1 with
  `commander.missingMandatoryOptionValue --name`.
  
  The issue's second half — *audit the other namespaces for the same omission* —
  found the gate's own blind spot. R1's population was collected with
  `line.startsWith("$ nexus ")`, so an invocation that is not the first word of its
  line was never handed to commander. That excluded **22 printed invocations**,
  measured across the tree, and the exclusion was not random:
  
  - **12 were the `-`-stdin forms** — `--body -`, `--prompt -`, `--content -`,
    `--input -`, `--file -`, `--message -` — because a document piped into a
    command puts the pipe on the same line. They are the examples a caller copies
    rather than reads, the body shape being the hard part, which is the whole of
    what NEX-3714 is about.
  - The rest were command substitutions: `eval "$(nexus auth switch …)"`,
    `cfg=$(nexus agent-tool get …)`.
  
  `task create`'s FIRST example is `$ cat task-prompt.md | nexus task create …`,
  so the command the issue was filed against had an unparsed example the whole
  time.
  
  The population is now every `$ …` line that invokes `nexus`, and `invocationsIn`
  extracts the command from a pipeline or a `$( … )`. One line may hold two
  invocations and both are judged; a line that merely names the string — `$ rm
  ~/nexus/support-docs/notes/probe.md` — yields none, because the match is on a
  `nexus` TOKEN rather than a substring. The `user-group get` defect is what the
  widened population found on its first run; the ledger is back to zero with it
  fixed.
  
  Two mechanisms keep a parse honest now that piped examples reach it:
  
  - **stdin is supplied, never inherited.** `applyBodySatisfiesRequired` resolves
    `--body` in a pre-action hook, so a `--body -` example reads standard input
    while commander is still deciding whether to run. Inheriting the test runner's
    stdin there is a hang. Each parse gets the document the example states
    (`echo '<doc>' | nexus …`) or an already-ended empty one, and an example whose
    document is genuinely unknowable (`cat batch.json | nexus … --body -`) is
    counted as an abstention rather than judged on bytes nobody wrote.
  - **the `--body` memo is cleared between parses.** It is keyed on the raw flag
    value, and the raw value for every piped body in the package is the identical
    `"-"` — so the first document read would otherwise answer for all of them, and
    an example would pass or fail on another example's bytes. `resetResolvedBodies`
    exists for that one caller; nothing in `src/` calls it.
  - **R2 judges the stated document, not the `-` that stands for it.** R1 parses a
    piped example with the bytes the line states; R2 was still `JSON.parse`-ing the
    RAW flag value, which for every one of those examples is the literal `"-"`, so
    it threw and continued and no field of any stated payload reached a route's
    `Body`. A skipped population and a clean one produce the identical empty
    violation list, so `stdinBodiesJudged` floors it — 2 today, `role create` and
    `workflow node update`.
  - **an `xargs` replacement is not a literal id.** `prompt-assistant delete-thread`'s
    Notes print the one-call-per-id loop that stands in for the bulk delete the
    namespace does not have, and its `{}` is rewritten by xargs per input line. Read
    as an operand it is a UUID slot holding `{}` — the shell's own syntax reported
    as a defect in a line that runs exactly as printed — so `invocationsIn` records
    the replacement token and R4/R6 exempt it, on the same ground as an argument the
    CLI resolves client-side.
- 9794d31: `workflow node update` and `workflow batch` help now state the real merge semantics
  
  Both commands promised "data is MERGED into the stored data, so send only what
  changes". That held for a sibling key of `data` and broke one level down: writing
  one entry of `parametersSetup`, or one parameter of an `agentInputTrigger`,
  replaced the whole map at 200 with no warning.
  
  The backend now merges recursively, so the documented promise holds at every
  depth. The help text says so, and states the three rules a caller needs: send a
  nested entry as `null` to remove it, a `null` at the top level of `data` stores
  null instead, and an array always replaces wholesale. It also documents the new
  refusal — a partial write over a stored value that cannot be merged fails and
  writes nothing, rather than destroying the drifted value.
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
- 462334f: Every subcommand's `--help` now names the global flags, and five more commands
  state a shape a caller previously had to discover by running them.
  
  `--json`, `--profile`, `--api-key`, `--base-url` and `--timeout` are declared
  once, on the program. Commander therefore lists them in the root's Options block
  and in no subcommand's — while `--json` appears in the Examples of nearly every
  subcommand. A reader on a leaf saw the flag used and never saw it documented,
  which reads as undocumented rather than as inherited. One `afterAll` handler on
  the root reaches every leaf at every depth (the mechanism the scope footer
  already uses), suppressed on the root itself, whose epilogue spells all five out
  with their resolution order.
  
  `agent-tool create` states that `TASK` and `DOCUMENT_TEMPLATE` have no config key
  of their own. The config schema is `.strict()` and declares six keys; `taskId`
  and `documentTemplateId` are not among them, so the obvious spelling is a 400
  naming the key. `WORKFLOW` is the only type with a renamed public field
  (`workflowId`); every other type puts its target id in the generic `toolId`. Read
  off the converter in both directions rather than off the enum.
  
  `auth list` states that `--json` is a bare array and that the active profile is
  flagged by a GLYPH rather than a boolean. `marker` is the table's arrow, and a
  single SPACE on every other row — so a truthiness test matches every row, because
  `" "` is a non-empty string. It has to be compared against the arrow.
  
  `phone-number search` states that `price` is the STRING `"1.15"`, with the unit
  in a separate `currency` field. A script that parses the row, reads `price` as a
  number and re-serialises it sends `1.10` back as `"1.1"`, and the buy is refused
  for a price that no longer matches the quote. Both fields can be null, which is
  Twilio declining to quote rather than a free number.
  
  `html-template list` states that 100 is both the default and the ceiling, so
  `--limit` can only ever REDUCE what comes back. The adapter reads
  `take: params.limit ?? 100` and the params schema caps `limit` at 100, and there
  is no `--page`, no `--offset`, no cursor and no total anywhere — `--json` carries
  no `meta`, the route returns an items array and nothing else. An organization
  holding more than 100 templates therefore cannot reach the rest from this command
  at any spelling, and the 100 rows it returns look exactly like a complete list.
  `--deployment-id` and `--search` are the only levers that reach past the cap,
  because they change WHICH templates are considered rather than how many are
  returned.
  
  `claude-code install` states that naming one skill narrows the SKILLS and nothing
  else. The whole posture — `shared/`, `CLAUDE.md`, `settings.json`, `hooks/`,
  `agents/` — still lands, so "install one skill" writes dozens of files rather
  than the handful the skill contains.
  
  No behaviour changes. Three rows of the `--help` audit were retired rather than
  written, because the tree already answers them: `asset` has the namespace Notes
  block whose absence the row reported, `credential get` explains `source`
  including what `credential delete` tears down, and `skill-folder assign` already
  names both source commands and the two different JSON shapes they answer in.
- e50ef31: Thirteen namespaces gain the facts a caller previously had to discover by running
  the command, and three `--help` texts stop pointing at a command that does not
  exist.
  
  `user-group list --help` and `user-group update --help` both told the reader to
  run `nexus user-group get`. There is no such verb and no route behind one — the
  namespace has `list`, `create`, `update`, `add-member`, `remove-member` and
  `delete`. One of the two citations sat inside a command substitution:
  
  ```
  --name "$(nexus user-group get <id> --json | jq -r .name)"
  ```
  
  which resolves to an unknown-command error, an empty substitution, and a rename
  to the empty string — in the one command whose own notes warn that a guessed name
  renames the group as a side effect. Both now read the name out of
  `user-group list --json`, which is the namespace's whole read surface and carries
  the `memberUserIds` the table never prints.
  
  `skills where` and `skills update` state how auto-detection actually chooses a
  project root. Both said it "walks up and picks the first of" a `.claude/` folder,
  a `CLAUDE.md` or the git root. It does not: it records the nearest ancestor
  holding each of the three and then ranks them BY KIND, so a `.claude/` six levels
  up beats a `CLAUDE.md` in the directory you are standing in. That is the
  stray-`.claude` case the wording was there to warn about, described backwards.
  The bound at `$HOME` and the fall back to the current directory are stated too.
  
  `execution diagnose` stops implying `outputSummary` can be parsed. It is the
  node's output run through `JSON.stringify` and cut to 100 characters with an
  ellipsis — a string at every length, and not valid JSON once cut. Anything a
  script reads needs `--verbose`, which adds `input` and `output`; without it those
  keys are ABSENT rather than null, so testing for `null` cannot tell "produced
  nothing" from "you did not ask".
  
  The rest are notes for facts that were true and unwritten: the twelve fields a
  `model list` row carries and the total absence of filter flags; the `model`
  namespace as a read-only dead end whose two ids are spent in `agent` and `task`,
  against the same-spelled `custom-model --model-name` that means something else;
  `executionType`, which is what `.type` is called in `--json`; the four `channel`
  lists that answer empty when no messaging connection exists at all; that no route
  renders a WhatsApp template without delivering it, with the local substitution
  that costs nothing; `supportsRefreshToken`, false for Notion, absent from the
  providers table and decisive for anything unattended; `--color` as an unvalidated
  free string behind a description that reads like an enum; the two `admin` verbs
  its own prose block omitted, both state-machine drivers, and its exit-code table
  scoped to that namespace; a zero-risk read that answers whether
  `CONVERSATION_EVAL` is enabled; and a complete inline `run.json`.
  
  `cloud-import`'s namespace help no longer claims the per-provider commands
  "behave identically" to the provider-agnostic ones: `browse` requires
  `--folder-id` and `google-drive list-files` defaults it to `root`.
  
  No behaviour changes. Six rows of the `--help` audit were retired rather than
  written, because the tree already answers them — two of those would have shipped
  false sentences, since `agent-skill delete` is wrapped in `confirmable()` and
  answers `{success,message}`, not the unguarded `{success,id}` the audit recorded.
- a96d367: `prompt-assistant get-thread --help` no longer tells an agent-mode caller that its
  prompt is ordinary markdown, and `task`, `conversation` and `prompt-assistant`
  gain the facts a caller previously had to discover by running the command.
  
  `promptResult.prompt` is built by two different generators. Under `--mode agent`
  it is `serializeToMarkdown(promptJson)`, which opens on a
  `::: section: name="…" :::` directive and is the Nexus agent-prompt format; under
  `--mode ai-task` it is the model's `system_prompt` verbatim, with no directive at
  all. The help said "A MARKDOWN STRING. Use it verbatim" over both, which reads,
  in agent mode, as permission to strip the directives — and stripping them
  flattens every section and tab into one blob that `agent update --prompt` then
  stores. The two modes also return different fields (`agentFields` and
  `promptJson` against `input` and `output`), so a caller reading for one gets
  `undefined` rather than an error. Both are now stated separately.
  
  `list-threads` states what `summary` actually is. It reads as an
  assistant-written title; it is `promptResult.name` once one is stored, and
  otherwise the caller's own first message with whitespace collapsed and cut at 140
  characters. Which one you are looking at is a fact about the thread's progress,
  so the column is now documented in both branches rather than as one of them.
  
  The rest are notes for facts that were true and unwritten: `--prompt` takes
  literal text despite its `<file-or-->` label, and silently prefers a file when
  the value happens to name one; `task create` echoes back only `id` and `name`, so
  `task get` is the only confirmation a write landed; `task list --json` is a bare
  array whose route pages and reports a total that this command does not expose;
  `conversation list`, `messages` and `search` return three different `meta` shapes;
  `conversation assign` takes Clerk user ids from a namespace that lists none;
  `conversation assigned-users` answers `responseHandling` beside the ids; the
  emulator session `chatId` is the conversation id and the only bridge into the
  inbox; and `prompt-assistant delete-thread` is one call per id.
  
  Every published `jq` path was checked against the printer that emits it —
  `printRecord` writes the record bare and `printList` wraps it in `data`, so
  `emulator session get --json` is `.chatId` while `emulator session list --json`
  is `.data[].chatId`.
  
  No behaviour changes. Two rows of the `--help` audit were retired instead of
  written, because the CLI they describe no longer exists: `--body` alone now
  satisfies `task create` and `task execute` through the deferred-requirement seam,
  which was verified by parsing the shipped examples against the real command tree
  rather than by reading the action.
- 10a19ee: Two `branching` operators in the bundled skills content do not exist, and an unknown operator returns `false` silently
  
  The CLI ships the `claude-code-skills-nexus` content compiled into its binary. That content named `is_not_empty` and `does_not_contain` as `branching` condition operators. Neither is accepted — the executor's real names are `not_empty` and `not_contains`.
  
  **That is worse than two typos.** `evaluateCondition` ends in a `default` arm that warns to the *server* log and returns `false`, so a misspelt operator does not fail the node, does not fail the run, and surfaces nowhere the caller can see. A workflow built from our own shipped guidance takes the wrong branch and reports success.
  
  Worse still, neither correct name appeared anywhere in the bundle: `not_empty` and `not_contains` were each present **zero** times, so a reader had no way to discover the real names from the content they were given.
  
  Fixed upstream (`NexusGPT/claude-code-skills-nexus#24`) and pulled in by moving `skills-nexus.lock` to `d7c08e8` — that fix cherry-picked onto the SHA the lock already pinned, so the bundle moves by 40 lines and nothing else.
  
  **Bumping to upstream `main` was refused, and the CLI's own gate is why.** `src/workspace-registry-skill-compat.test.ts` goes red with 12 findings at `main`: the bundled skills index `workspace-mounts.json` by bare slug again, while this CLI writes `<kind>:<id>|<slug>` keys. `git show <sha>:skills/nexus-workspaces/SKILL.md | grep -c '\.\[\$s\]\.mountPath'` answers 0 at the old pin and 1 at `main`, and the commit between them is `1744d52 sync: close long-standing primary→mirror drift (primary is source of truth)` — a mirror sync that overwrote the fix PR #23 landed. That is upstream's to repair in its primary, and it is filed as `NexusGPT/claude-code-skills-nexus#25`; re-fixing the mirror alone regresses on the next sync.
  
  The branching guide now carries the complete accepted set — all 19 members of `ConditionOperators` in `packages/types/src/shared/domain/tools/workflow.types.ts`, which the executor's switch is `never`-exhaustive against, so the two cannot drift. It previously listed 10 and omitted 9 real ones, including every numeric comparison and every array-length check.
  
  `documentation-plan.md` carried the same class and is corrected in this repo: it named `greater_than_or_equal`, `less_than_or_equal`, `is_not_empty` and `not_has_key`, where the accepted spellings are `greater_equal`, `less_equal`, `not_empty` and `has_not_key`.
  
  Four spellings that read correctly and are refused are now named as refused in both places, because being right about the names is not enough when the wrong ones are what a reader would guess.
  
  ## The class sweep
  
  Every skill document was swept for the same defect — an enum value **asserted** beside its true siblings that no code accepts. Vocabulary built from 1,142 distinct accepted values: the 756 contract enum members the CLI generates from the real Zod schemas, the types package's `z.enum`s and string-literal unions, and every backend `switch` case label.
  
  **Before: 2 findings, both of them these operators. After: 0, over 114 examined runs.** The `documentation-plan.md` line is a third finding on its own rule.
  
  The sweep judges a run only when two or more of its tokens are real accepted values — a token alone is a field name, a file or a shell word, not an assertion about a vocabulary — and skips a run whose line teaches a name as *wrong*, or it would force the deletion of the warnings this change adds.
- 6a259f1: `nexus upgrade` under `sudo` no longer reports an upgrade it verified for root
  
  `sudo nexus upgrade` reported a successful upgrade and the version never moved — run it again and it repeats, forever.
  
  The version check itself was fixed in 0.25.0: the command re-reads the PATH after installing and refuses to print a success it did not observe. **Under `sudo` that verification reads the wrong machine.** The install runs as root and writes root's global prefix; `resolve()` then reads the ROOT process's PATH. A match there is a statement about root's shell, and whether it is also the invoking user's depends on how sudo is configured — `secure_path`, `env_keep`, `always_set_home` — none of which this command can read.
  
  So the elevated run could still print "Upgraded to 0.25.0." about an environment the user never types into.
  
  **Nothing here claims sudo changes PATH on any particular machine.** That depends on sudoers. The fix is not a new diagnosis — it is the refusal of one that was never established.
  
  - A warning before the install, while the reader can still cancel, naming who the install actually runs as.
  - A verified resolution under sudo is now **exit 3** with the one command that settles it (`nexus --version`, without sudo) rather than a success. Exit 3 is new and deliberate: **2 is a finding, 3 is the absence of one.** Exit 2 says a specific file wins on your PATH and here it is; reporting the sudo case as 2 would name a PATH problem that may not exist, and reporting it as 0 is the defect the whole file exists to prevent. Retrying does not help either way, but for different reasons — the same sudo produces the same non-answer forever.
  - The other three outcomes now say **whose** PATH they read. The empty-resolution message previously told the reader their own PATH had no `nexus` on it and to add their global bin directory — a repair for a PATH that is very likely fine, since the empty list is root's and sudo commonly replaces PATH with a fixed `secure_path` carrying no per-user global bin directory at all.
  
  `elevatedBy` sits on the injectable `UpgradeEnvironment` seam rather than being read inline, because a spec cannot re-enter `sudo` — the elevated outcomes would otherwise be unreachable and therefore untested. Six cases, two of them controls that run the identical resolution with `elevatedBy: null` and assert the ordinary success and the ordinary PATH advice, so the sudo cases cannot pass against a build that simply stopped printing successes. Proven to fail on the pre-fix behaviour.
  
  The `upgrade --help` exit-code table is corrected from three codes to four, and states the sudo hazard.
- 48f60e3: `nexus workflow --help` told every reader that the API's named error codes never
  reach this CLI. They do, and they have since `code` became a required field of
  the error document.
  
  The paragraph said: *"THE API'S NAMED ERROR CODES DO NOT REACH THIS CLI … under
  `--json` the payload is `{"error":{"message":…}}` with no code. Error handling
  written against the code names matches nothing here. Match on the message."*
  
  Every refusal carries one. `nexus workflow node create <id> --type loopStart
  --json` answers `code: "NODE_LOOP_START_DIRECT_CREATE"`; `node delete` on a
  do-while start answers `NODE_DO_WHILE_START_DELETE_FORBIDDEN`. So does
  `EDGE_SCOPE_VIOLATION`, `EDGE_INVALID_SOURCE_HANDLE`,
  `NODE_TRIGGER_DELETE_FORBIDDEN`, `PARAMETERS_SETUP_INVALID` and
  `WORKFLOW_ALREADY_PUBLISHED`.
  
  **This is worse than an undocumented field.** A caller reading that help
  deliberately ignored the one field that was present and machine-readable, and
  was steered onto matching the message — prose, which gets rewritten.
  
  ## What the help says now
  
  - **`nexus workflow --help`** states that the code comes through unchanged, that
    it is the field to branch on, and what an unrecognised value means:
    `HTTP_<status>` when the API sent no name of its own, and a `CLI_` prefix when
    the failure never reached the server at all.
  - **The root epilogue (`nexus --help`)** spelled the document with two keys,
    `{"error":{"message","hint"}}`, which is the same understatement one level up
    and is where the workflow paragraph took its cue. It now spells all three —
    `{"error":{"message","hint","code"}}`, every key always present, `hint` null
    when there is none — and says the code is printed dim in brackets after the
    message when `--json` is not passed.
  
  No behaviour changes. The document has carried three keys since `code` was made
  required; only the prose was behind.
  
  ## The class, not the instance
  
  Eleven places in the package describe this envelope and exactly one emits it.
  Five of the eleven had drifted, each reading as a checked fact, because nothing
  compared prose to behaviour.
  
  `error-envelope-help-is-true.test.ts` now does. It DRIVES a real refusal under
  `--json`, reads the key set off what lands on stdout, and requires every
  `{"error":{…}}` fragment in the package either to elide its keys or to name
  exactly that set. The expectation is derived from the emitter rather than written
  down, so adding a fourth key fails the gate until the prose follows.

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
