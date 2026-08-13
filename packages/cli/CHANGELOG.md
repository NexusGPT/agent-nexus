# @agent-nexus/cli

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
  
  The identity is the ARM — `person:<userId>` or `<resourceType>:<resourceId>` — which is
  what `@@unique([taskId, userId])` and `@@unique([taskId, resourceType, resourceId])`
  already enforce. The help now says that.
  
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
  
  The search `query` is now trimmed before it is used, and a blank one is refused with a
  400. This changes existing Google Drive and Notion callers too: `" T1 "` and `"T1"` were
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
