# @agent-nexus/sdk

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
  store one. There is no assignment id on this contract to store: the arm IS the
  identity — `person:<userId>` or `<resourceType>:<resourceId>` — unique within a
  task by database constraint. Comment-only; no shape changes.

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
