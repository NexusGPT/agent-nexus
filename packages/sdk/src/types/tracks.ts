/**
 * Tracks — the unit of work an autonomous caller drives.
 *
 * A track has a dependency graph, a section tree, a task tree, the agents working
 * it, an append-only log and a byte-budgeted memory. Seven scope resources, so a
 * key can read the ready set and append to the log without being able to
 * restructure a plan.
 *
 * ## Timestamps are STRINGS, everywhere
 *
 * The server ISOs every one of them before the object leaves the backend, so
 * these types describe exactly what the wire carries. Parse them yourself if you
 * want a `Date`; this package does not, because a client that rehydrates some
 * fields and not others is worse than one that hands back what arrived.
 */

/** Who a track is waiting on. */
export type TrackNextOwner = "CUE" | "USER" | "EVENT";

/**
 * Where a track is in its life.
 *
 * 🔴 `DONE` AND `BLOCKED` ARE THE TWO THAT LEAVE THE READY SET. `IN_REVIEW` does
 * not — work waiting on a reviewer is still work somebody can pick up.
 */
export type TrackStatus = "PLANNED" | "IN_PROGRESS" | "BLOCKED" | "IN_REVIEW" | "DONE";

/**
 * Create one track.
 *
 * 🔴 `number` IS NOT A FIELD HERE AND MAY NEVER BE SENT. The server allocates it
 * from a per-organization sequence inside the creating transaction, which is what
 * makes it gapless and collision-free. A caller-supplied number would be handed
 * out again later and refused on somebody else's create.
 *
 * `status` is absent too: a track is created `PLANNED`. So is `nextOwnerRef` —
 * the watcher reference is written by whatever wires the watcher.
 */
export interface CreateTrackBody {
  /** Unique per organization. 1-64 chars of `[a-z0-9-]`. A duplicate is a 409. */
  slug: string;
  title: string;
  /** What happens next, one line, at most 400 characters. */
  currentStep?: string | null;
  /** Who is waited on. `USER` when omitted. */
  nextOwner?: TrackNextOwner;
}

/**
 * The track that was created.
 *
 * `number` is the field worth keeping: it is minted during the write, so it
 * cannot be computed and cannot be asked for again cheaply.
 */
export interface CreateTrackResponse {
  id: string;
  number: number;
  slug: string;
  title: string;
  currentStep: string | null;
  nextOwner: TrackNextOwner;
}

/**
 * Set — or clear — the one line that says what is happening on a track now.
 *
 * 🔴 `currentStep` IS REQUIRED AND NULLABLE, NEVER OPTIONAL. `null` clears it;
 * an optional field would have no spelling for that, because an omitted key and
 * an explicit `null` arrive the same way.
 */
export interface UpdateTrackCurrentStepBody {
  /** One line. `null` clears it. */
  currentStep: string | null;
}

/** What the track now says, echoed back so you need no second read. */
export interface UpdateTrackCurrentStepResponse {
  trackId: string;
  currentStep: string | null;
}

/**
 * Move a track to a status — this is how a track FINISHES.
 *
 * There is no delete. A track that is over is `DONE`; its diary, its events and
 * its memory are the record of how the work went, and all three are children of
 * the row under `ON DELETE CASCADE`.
 *
 * ⚠️ EVERY STATUS IS REACHABLE FROM EVERY OTHER ONE. There is no transition
 * table, because work genuinely goes backwards — a track marked `DONE` that
 * turns out not to be needs one call, not an escape hatch.
 */
export interface SetTrackStatusBody {
  status: TrackStatus;
}

/** What the track now says, echoed back so you need no second read. */
export interface SetTrackStatusResponse {
  trackId: string;
  status: TrackStatus;
}

/**
 * Put a track away, or bring it back. THE ANSWER TO "DELETE A TRACK".
 *
 * 🔴 THERE IS NO DELETE, AND ARCHIVING IS NOT A SOFTER ONE — IT IS THE POINT. A
 * track's diary, events and memory are children of the row under
 * `ON DELETE CASCADE`, so deleting it destroys the record of how the work went.
 * Archiving takes it out of `listReady()` and out of the default page of
 * `list()`, and leaves the journal readable.
 *
 * 🔴 REVERSIBLE. `archived: false` brings it back, and `list({ archived: "only" })`
 * is how you find what was put away. An archive nobody can undo is a delete whose
 * damage is only harder to see.
 *
 * ⚠️ IT DOES NOT TOUCH `status`. `DONE` says the work finished; archived says the
 * track was put away, which a `PLANNED` mistake also is.
 */
export interface ArchiveTrackBody {
  /** `true` puts it away, `false` brings it back. */
  archived: boolean;
}

/** The timestamp the track now carries, or `null` once it is back. */
export interface ArchiveTrackResponse {
  trackId: string;
  archivedAt: string | null;
}

/**
 * Say who acts next on a track — the per-turn handover.
 *
 * 🔴 `nextOwnerRef` IS WRITTEN ON EVERY CALL, NEVER MERGED. Omit it and the
 * watcher reference is cleared. That is what keeps the pair legal: the server
 * admits a ref only alongside `EVENT`, so a partial update that left an old ref
 * behind while moving to `USER` would be refused for a field you did not send.
 *
 * A ref sent with `CUE` or `USER` is a 400 that says so.
 */
export interface SetTrackNextOwnerBody {
  nextOwner: TrackNextOwner;
  /** Only with `EVENT`. Omitted or `null` clears it. */
  nextOwnerRef?: string | null;
}

/** Both columns, echoed back — including the ref this call may have cleared. */
export interface SetTrackNextOwnerResponse {
  trackId: string;
  nextOwner: TrackNextOwner;
  nextOwnerRef: string | null;
}

/**
 * One track, in full.
 *
 * A projection, never the stored row: `memoryBytes` and `createdByUserId` are
 * absent from it and from the ready-set row, so a column added to the table later
 * cannot join this response without somebody deciding it should.
 */
export interface Track {
  id: string;
  /** Per-organization, from 1, gapless. Allocated by the server. */
  number: number;
  slug: string;
  title: string;
  status: TrackStatus;
  /** One line, at most 400 characters. `null` until somebody sets one. */
  currentStep: string | null;
  nextOwner: TrackNextOwner;
  /** Only ever set with `nextOwner: "EVENT"`. */
  nextOwnerRef: string | null;
  /** When the track was put away, or `null` while it is live. */
  archivedAt: string | null;
  /**
   * When the track entered its current `DONE` state, `null` at every other
   * status. A non-null value always travels with `status: "DONE"` — the database
   * refuses the other combination.
   *
   * 🔴 CURRENT STATE, NOT HISTORY. Re-opening a track clears this, so a track
   * counted as finished last week leaves that window retroactively and nothing
   * records that it was ever in it.
   *
   * ⚠️ `null` on a `DONE` track is legal, not an error: tracks that finished
   * before this field existed carry no completion time. Treat it as absent —
   * never as zero, and never as epoch.
   */
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Every track in the organization — what EXISTS, not what is ready.
 *
 * 🔴 THIS IS NOT THE READY SET. `listReady()` answers "what can be worked on";
 * a `DONE` track is absent from it and present here, which is the only way a
 * caller that finished a track can see it again.
 */
export interface ListTracksParams {
  /** How many rows, 1-200. */
  limit?: number;
  /**
   * Resume after a previous page. Pass `nextCursor` back VERBATIM.
   *
   * 🔴 IT IS SERVER-ISSUED AND ITS SHAPE IS NOT PART OF THE PROMISE. Do not
   * build one from a track's `number`: the token carries the filters it was
   * issued under, and a cursor used with a different `status` or `archived` is
   * REFUSED rather than quietly resuming inside a different list.
   */
  cursor?: string;
  /** Narrow the page to one status. Every status when omitted. */
  status?: TrackStatus;
  /**
   * What to do about archived tracks. `"exclude"` when omitted.
   *
   * 🔴 `"only"` IS THE RECOVERY PATH. An archived track is absent from
   * `listReady()` AND from this list's default page, so this is how you find one
   * to hand back to `archive(id, { archived: false })`.
   */
  archived?: "exclude" | "only" | "include";
}

export interface ListTracksResponse {
  tracks: Track[];
  /**
   * Every track matching `status` and `archived`, ignoring `limit` and `cursor`.
   *
   * Not the size of this page — `tracks.length` is that. The page and this count
   * are built from one filter expression on the server, so a total you cannot
   * page to is not a state this API can reach.
   */
  total: number;
  /** `true` when a further page exists under the same filters. */
  hasMore: boolean;
  /** Pass back as `cursor`. `null` when `hasMore` is false. */
  nextCursor: string | null;
}

/**
 * A track's progress: leaves done, leaves total.
 *
 * 🔴 COUNTS, NEVER A PERCENTAGE. Rounding is a display decision and a caller
 * handed a percentage cannot recover the counts. Divide them yourself.
 *
 * ⚠️ LEAVES ONLY, at any nesting depth. A parent task is structure rather than
 * work, so it is in neither number — one parent with three children reads
 * `0/3`, never `0/4`.
 *
 * ⚠️ A TRACK THAT IS NOT YOURS READS `0/0`, NOT a refusal. The same answer a
 * real track with no tasks gives.
 */
export interface TrackRollup {
  done: number;
  total: number;
}

/** One track's progress inside a batched answer. */
export interface TrackRollupEntry extends TrackRollup {
  trackId: string;
}

/**
 * Progress for several tracks in ONE call.
 *
 * 🔴 `rollups` HOLDS ONE ENTRY PER ID YOU ASKED FOR, IN THE ORDER YOU ASKED, so
 * you can zip it against your own list. A track that does not resolve in your
 * organization is PRESENT with `0/0` rather than omitted — the same answer
 * `readRollup()` gives it, and for the same reason: a missing key would tell you
 * which ids exist in somebody else's organization.
 */
export interface ListTrackRollupsResponse {
  rollups: TrackRollupEntry[];
}

/**
 * One row of the TRACK-level ready set.
 *
 * A projection, never the stored row. `ready` is the whole agent loop in one
 * call, so this shape is what an autonomous caller reads on every iteration —
 * publishing the full row would put the archival columns into that loop and every
 * column added later would join them silently.
 */
export interface ReadyTrack {
  id: string;
  number: number;
  /** The name a person types and reads. The number means nothing outside your org. */
  slug: string;
  title: string;
  /** One line, at most 400 characters. `null` until somebody sets one. */
  currentStep: string | null;
  nextOwner: TrackNextOwner;
}

export interface ListReadyTracksResponse {
  tracks: ReadyTrack[];
}

/**
 * One row of the TASK-level ready set.
 *
 * `gate` travels with the row on purpose: a caller deciding what to pick up needs
 * to know a task will refuse its own completion without evidence BEFORE it
 * starts, not at the moment it ticks the box.
 */
export interface ReadyTrackTask {
  id: string;
  title: string;
  acceptance: string | null;
  /** `true` when ticking this task requires evidence. */
  gate: boolean;
}

export interface ListReadyTrackTasksResponse {
  tasks: ReadyTrackTask[];
}

/** Both edge routes answer with the id of the row they inserted. */
export interface TrackEdgeCreated {
  id: string;
}

export interface TrackSection {
  id: string;
  trackId: string;
  parentSectionId: string | null;
  slug: string;
  /** The materialised path, `parent/child`. Every resolution reads this. */
  path: string;
  title: string;
  position: number;
}

export interface RenameTrackSectionResponse {
  oldPath: string;
  newPath: string;
  /** The renamed node plus every descendant. `1` when it is a leaf. */
  rowsRewritten: number;
}

/**
 * A task, with its collision banner FIRST.
 *
 * 🔴 READ `banner` BEFORE ANYTHING ELSE. Nothing in this domain reserves a region
 * of a track or refuses a second worker — collision avoidance is a live
 * instruction riding in this payload, and it names the exact command to run. A
 * claim held by an agent that is no longer OPEN reads as nobody on it.
 */
export interface TrackTask {
  banner: string;
  id: string;
  trackId: string;
  parentTaskId: string | null;
  title: string;
  acceptance: string | null;
  /** `true` when ticking this task requires evidence. */
  gate: boolean;
  evidence: string | null;
  /** ISO-8601, or `null` while the task is open. */
  doneAt: string | null;
  /**
   * Who ticked it, or `null`.
   *
   * ⚠️ `null` FOR EVERY MACHINE CALLER. Ticking a task is reachable with an org
   * API key that resolves no owning human, and this API writes `null` rather
   * than a fabricated author — so an absence means "nobody is attributed", never
   * "a person is missing".
   */
  doneByUserId: string | null;
  claimedByAgentId: string | null;
}

export interface ClaimTrackTaskResponse {
  taskId: string;
  claimedByAgentId: string;
}

export interface ToggleTrackTaskResponse {
  taskId: string;
  done: boolean;
}

export interface ImportTrackPlanResponse {
  /** One id per entry of the plan's depth-first pre-order flattening, in order. */
  taskIdsByIndex: string[];
  edgeIds: string[];
}

export type TrackAgentState = "OPEN" | "CLOSED" | "DEAD" | "RETIRED";

export interface TrackAgent {
  id: string;
  trackId: string;
  name: string;
  state: TrackAgentState;
  /** Other agents' NAMES in this track — a column, not a join. */
  dependsOn: string[];
  acceptance: string | null;
  /** Opaque by design: whatever a dispatcher handed the agent. */
  inputs: unknown;
  outputPath: string | null;
  model: string | null;
  reason: string | null;
  /** ISO-8601. */
  openedAt: string;
  /**
   * ISO-8601. The ONE heartbeat clock in this domain — every collision banner's
   * staleness is derived from it, and so is the stale-agent sweep.
   */
  lastHeardAt: string;
  /** ISO-8601, or `null` while the agent is OPEN. */
  closedAt: string | null;
}

export interface ListTrackAgentsResponse {
  agents: TrackAgent[];
}

export type TrackDiaryKind =
  | "PROGRESS"
  | "FINDING"
  | "DECISION"
  | "PROOF"
  | "BLOCKER"
  | "QUESTION"
  | "KILLED"
  | "NOTE";

export interface TrackDiaryEntry {
  id: string;
  trackId: string;
  kind: TrackDiaryKind;
  body: string;
  taskId: string | null;
  agentId: string | null;
  workspaceId: string | null;
  artifactPath: string | null;
  /** The API key's owning user, or `null` when the credential resolves none. */
  authorUserId: string | null;
  /** ISO-8601. */
  createdAt: string;
}

export interface ListTrackDiaryEntriesResponse {
  entries: TrackDiaryEntry[];
}

export interface TrackMemoryEntry {
  id: string;
  trackId: string;
  key: string;
  value: string;
  /** UTF-8 BYTES. Not characters, and not UTF-16 code units. */
  valueBytes: number;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. */
  updatedAt: string;
}

export interface ListTrackMemoryEntriesResponse {
  entries: TrackMemoryEntry[];
  /**
   * Summed from the rows THIS read returned rather than from the counter column,
   * so a divergence between the two is visible here instead of hidden behind the
   * counter that is supposed to track it.
   */
  trackMemoryBytes: number;
  budgetBytes: number;
}

export interface PutTrackMemoryEntryResponse {
  entry: TrackMemoryEntry;
  trackMemoryBytes: number;
}

export interface DeleteTrackMemoryEntryResponse {
  /** Idempotent — `false` when the key was already absent. */
  deleted: boolean;
  trackMemoryBytes: number;
}

export interface TrackEvent {
  id: string;
  /** `null` for an organisation-level event with no track. */
  trackId: string | null;
  type: string;
  payload: unknown;
  actorUserId: string | null;
  actorAgentId: string | null;
  /** ISO-8601. */
  createdAt: string;
}

export interface ListTrackEventsResponse {
  events: TrackEvent[];
}

export interface ListOrganizationTrackEventsResponse {
  events: TrackEvent[];
  /**
   * Feed back as `cursor` for the next page. `null` at the end of the stream.
   *
   * ⚠️ A FULL PAGE ALWAYS CARRIES ONE, EVEN WHEN IT WAS THE LAST — "full" and
   * "full and final" are indistinguishable without counting, so a caller walking
   * to the end makes one extra call that returns no events. Loop until this is
   * `null`; do not stop on a short page, and do not stop on a full one.
   */
  nextCursor: string | null;
}

// ═══════════════════════════════════════════════════════════════
// What a caller SENDS
// ═══════════════════════════════════════════════════════════════

export interface ReadySetParams {
  /** 1-200. The server clamps and defaults; the ceiling is what bounds the query's cost. */
  limit?: number;
}

export interface CreateTrackDependencyEdgeBody {
  /** The track that must finish first. */
  blockerTrackId: string;
  /** The track that waits. */
  blockedTrackId: string;
}

export interface CreateTrackTaskEdgeBody {
  /** The task that must finish first. */
  blockerTaskId: string;
  /** The task that waits. */
  blockedTaskId: string;
}

export interface CreateTrackSectionBody {
  /** Omit, or `null`, to create at the ROOT of the track. */
  parentSectionId?: string | null;
  /** 1-64 chars of `[a-z0-9-]`. It becomes the last segment of the path. */
  slug: string;
  title: string;
  body?: string;
  /** Where among its siblings. Omitted appends; out of range clamps. */
  position?: number;
}

export interface RenameTrackSectionBody {
  newSlug: string;
}

export interface ClaimTrackTaskBody {
  /** The id of an OPEN agent on the same track. A NAME is a 409. */
  agentId: string;
}

export interface ToggleTrackTaskBody {
  /** `true` ticks it, `false` un-ticks it. */
  done: boolean;
  /** Required when the task itself is a gate. Ignored on an un-tick. */
  evidence?: string | null;
}

/**
 * One task as the plan author wrote it.
 *
 * The server's schema declares four explicit levels rather than an unbounded
 * recursion, because a plan arrives over HTTP and a deep one would otherwise
 * overflow the parser's stack. This type is recursive because it parses nothing;
 * a plan nested deeper than four levels is imported as several plans.
 */
export interface TrackPlanNode {
  title: string;
  /** One line. The server refuses more than 400 characters. */
  acceptance?: string | null;
  /** A gate blocks its whole ancestry from being ticked until it carries evidence. */
  gate?: boolean;
  children?: TrackPlanNode[];
}

/**
 * One dependency, by INDEX into the plan's depth-first pre-order flattening.
 *
 * 🔴 THE ORDER IS THE COORDINATE SYSTEM, AND GETTING IT WRONG FAILS SILENTLY. A
 * node, then its whole subtree, then its next sibling: `[A [A1, A2 [A2a]], B]`
 * numbers `0:A 1:A1 2:A2 3:A2a 4:B`. Shift one entry and every edge still
 * inserts, every count still matches, and the dependencies land on the wrong
 * tasks with no error to read. Breadth-first is what you get by reaching for a
 * queue.
 */
export interface TrackPlanEdge {
  blockerIndex: number;
  blockedIndex: number;
}

export interface ImportTrackPlanBody {
  /** Hang the plan's roots under this task, or under the track when omitted. */
  parentTaskId?: string | null;
  tasks: TrackPlanNode[];
  edges?: TrackPlanEdge[];
}

export interface ListTrackAgentsParams {
  state?: TrackAgentState;
}

export interface OpenTrackAgentBody {
  /** Unique among the track's OPEN agents. Closing an agent frees its name. */
  name: string;
  /** Other agents in this track, BY NAME. */
  dependsOn?: string[];
  acceptance?: string | null;
  /**
   * An open JSON object: whatever you want the agent to carry. The VALUES are
   * unconstrained; the top level is an object because that is what the contract
   * declares, so an MCP client is told what shape to send.
   */
  inputs?: Record<string, unknown> | null;
  outputPath?: string | null;
  model?: string | null;
}

export interface CloseTrackAgentBody {
  state: "CLOSED" | "DEAD" | "RETIRED";
  /**
   * At least 15 characters after trimming for `DEAD` and `RETIRED` — the reason
   * is the whole content of those two states. `CLOSED` is an ordinary completion
   * and owes nothing.
   */
  reason?: string | null;
}

export interface ListTrackDiaryEntriesParams {
  kind?: TrackDiaryKind;
  limit?: number;
}

export interface AppendTrackDiaryEntryBody {
  kind: TrackDiaryKind;
  body: string;
  taskId?: string | null;
  agentId?: string | null;
  workspaceId?: string | null;
  artifactPath?: string | null;
}

export interface PutTrackMemoryEntryBody {
  /** 1-128 chars of `[A-Za-z0-9._-]`. The delete route addresses it as a path segment. */
  key: string;
  value: string;
}

export interface ListTrackEventsParams {
  limit?: number;
}

export interface ListOrganizationTrackEventsParams {
  /** 1-200, default 50. */
  limit?: number;
  /**
   * A page boundary the SERVER issued — round-trip `nextCursor`, never build one.
   *
   * 🔴 IT CARRIES THE FILTERS IT WAS ISSUED UNDER, and replaying it with a
   * different `since` or `type` is a 400. That is deliberate: a cursor is a
   * position inside a filtered set, so honouring it across a filter change would
   * return a correctly-scoped page that STARTS IN THE MIDDLE, with nothing for a
   * caller to notice. Changing filters means starting from the first page.
   *
   * `limit` is NOT bound into it — a bigger page mid-walk is legitimate.
   */
  cursor?: string;
  /**
   * Inclusive lower bound on `createdAt`. A FULL ISO-8601 instant
   * (`2026-08-01T10:00:00.000Z`), not a date — the server refuses anything
   * ambiguous rather than guessing a window.
   */
  since?: string;
  /** Exact event `type`. Omitted returns every type. */
  type?: string;
}

export interface AppendTrackEventBody {
  type: string;
  /** An open JSON object, for the reason `OpenTrackAgentBody.inputs` gives. */
  payload?: Record<string, unknown> | null;
  /**
   * REQUIRED on this surface. An event needs a user OR an agent, and an API key
   * may resolve no owning user — so the agent is what makes the actorless event
   * unrepresentable rather than a 500 from a database CHECK.
   */
  actorAgentId: string;
}
