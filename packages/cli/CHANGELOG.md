# @agent-nexus/cli

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
