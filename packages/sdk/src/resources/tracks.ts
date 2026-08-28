import type {
  AppendTrackDiaryEntryBody,
  AppendTrackEventBody,
  ArchiveTrackBody,
  ArchiveTrackResponse,
  ClaimTrackTaskBody,
  ClaimTrackTaskResponse,
  CloseTrackAgentBody,
  CreateTrackBody,
  CreateTrackDependencyEdgeBody,
  CreateTrackResponse,
  CreateTrackSectionBody,
  CreateTrackTaskEdgeBody,
  DeleteTrackMemoryEntryResponse,
  ImportTrackPlanBody,
  ImportTrackPlanResponse,
  ListOrganizationTrackEventsParams,
  ListOrganizationTrackEventsResponse,
  ListReadyTracksResponse,
  ListReadyTrackTasksResponse,
  ListTrackAgentsParams,
  ListTrackAgentsResponse,
  ListTrackDiaryEntriesParams,
  ListTrackDiaryEntriesResponse,
  ListTrackEventsParams,
  ListTrackEventsResponse,
  ListTrackMemoryEntriesResponse,
  ListTrackRollupsResponse,
  ListTracksParams,
  ListTracksResponse,
  OpenTrackAgentBody,
  PutTrackMemoryEntryBody,
  PutTrackMemoryEntryResponse,
  ReadySetParams,
  RenameTrackSectionBody,
  RenameTrackSectionResponse,
  SetTrackNextOwnerBody,
  SetTrackNextOwnerResponse,
  SetTrackStatusBody,
  SetTrackStatusResponse,
  ToggleTrackTaskBody,
  ToggleTrackTaskResponse,
  Track,
  TrackAgent,
  TrackDiaryEntry,
  TrackEdgeCreated,
  TrackEvent,
  TrackRollup,
  TrackSection,
  TrackTask,
  UpdateTrackCurrentStepBody,
  UpdateTrackCurrentStepResponse
} from "../types/tracks";
import { BaseResource } from "./base-resource";

/**
 * TRACKS — the unit of work an autonomous caller drives.
 *
 * ## The loop is four calls
 *
 * `listReady()` -> `listReadyTasks(trackId)` -> `readTask(taskId)` ->
 * `claimTask(taskId, …)`, then `toggleTask` when it is done and
 * `appendDiaryEntry` for what happened. `beatAgent` in between says the agent is
 * still alive, and that heartbeat is what every collision banner's staleness is
 * measured from.
 *
 * ## 🔴 Read `banner` on every task you read
 *
 * Nothing in this domain reserves a region of a track or refuses a second worker.
 * Collision avoidance is a LIVE INSTRUCTION riding in the task payload, and it is
 * the FIRST field on the wire so an agent acting top-down sees it before it acts.
 * A claim on a task another agent holds SUCCEEDS and overwrites — claiming and
 * taking over are one operation, which is why there is no take-over method here
 * to look for.
 *
 * ## The ready set is derived on every read
 *
 * There is nothing to invalidate and nothing to refresh. Marking a blocker done
 * makes its dependents appear in the very next call.
 */
export class TracksResource extends BaseResource {
  /**
   * Create one track.
   *
   * 🔴 THE `number` COMES BACK, IT IS NEVER SENT. It is allocated from a
   * per-organization sequence inside the creating transaction — gapless, from 1,
   * and impossible for two concurrent creates to share.
   *
   * A slug already taken in this organization answers 409.
   */
  async create(body: CreateTrackBody): Promise<CreateTrackResponse> {
    return this.http.request<CreateTrackResponse>("POST", `/tracks`, { body });
  }

  /**
   * Set — or clear — the one line that says what is happening on this track.
   *
   * `currentStep` is what every row of the ready set carries and what a person
   * scanning a board reads first. Send `null` to clear it. A track that does not
   * resolve in your organization answers 404.
   */
  async updateCurrentStep(
    trackId: string,
    body: UpdateTrackCurrentStepBody
  ): Promise<UpdateTrackCurrentStepResponse> {
    return this.http.request<UpdateTrackCurrentStepResponse>(
      "POST",
      `/tracks/${trackId}/current-step`,
      { body }
    );
  }

  /**
   * Move a track to a status. THIS IS HOW A TRACK FINISHES.
   *
   * 🔴 `DONE` TAKES IT OUT OF `listReady()` ON THE VERY NEXT CALL, through the
   * one predicate the ready query already runs. There is nothing to invalidate
   * and no second rule anywhere.
   *
   * There is no delete, deliberately: the track's diary, events and memory ARE
   * the record of how the work went, and all three are children of the row under
   * `ON DELETE CASCADE`. A track that does not resolve in your organization
   * answers 404.
   */
  async setStatus(trackId: string, body: SetTrackStatusBody): Promise<SetTrackStatusResponse> {
    return this.http.request<SetTrackStatusResponse>("POST", `/tracks/${trackId}/status`, { body });
  }

  /**
   * Put a track away, or bring it back. THE ANSWER TO "DELETE A TRACK".
   *
   * 🔴 THERE IS NO DELETE METHOD ON THIS RESOURCE AND THAT IS DELIBERATE. The
   * track's diary, events and memory are children of the row under
   * `ON DELETE CASCADE`; deleting it destroys the record of how the work went.
   * Archiving removes it from `listReady()` and from the default page of
   * `list()`, and leaves all of it readable.
   *
   * Reversible: send `archived: false`. Find what was put away with
   * `list({ archived: "only" })`. A track that does not resolve in your
   * organization answers 404.
   */
  async archive(trackId: string, body: ArchiveTrackBody): Promise<ArchiveTrackResponse> {
    return this.http.request<ArchiveTrackResponse>("POST", `/tracks/${trackId}/archive`, {
      body
    });
  }

  /**
   * Say who acts next on this track — the per-turn handover.
   *
   * 🔴 `nextOwnerRef` IS WRITTEN ON EVERY CALL, NEVER MERGED. Omit it and the
   * watcher reference is cleared in the same statement, which is what keeps the
   * pair legal — the server admits a ref only alongside `EVENT`. Sending one with
   * `CUE` or `USER` is a 400 that says so, rather than a constraint violation.
   *
   * A track that does not resolve in your organization answers 404.
   */
  async setNextOwner(
    trackId: string,
    body: SetTrackNextOwnerBody
  ): Promise<SetTrackNextOwnerResponse> {
    return this.http.request<SetTrackNextOwnerResponse>("POST", `/tracks/${trackId}/next-owner`, {
      body
    });
  }

  /**
   * Every track in the organization, in `number` order.
   *
   * 🔴 THIS IS NOT `listReady()`. That one answers "what can be worked on" and
   * hides everything `DONE` or `BLOCKED`; this answers "what exists". A caller
   * that finished a track has no other way to see it again.
   */
  async list(params?: ListTracksParams): Promise<ListTracksResponse> {
    return this.http.request<ListTracksResponse>("GET", `/tracks`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * One track by id.
   *
   * A track in another organization answers 404 — the same answer an absent id
   * gives, and deliberately indistinguishable from it.
   */
  async get(trackId: string): Promise<Track> {
    return this.http.request<Track>("GET", `/tracks/${trackId}`);
  }

  /**
   * The track's progress: leaves done, leaves total.
   *
   * 🔴 COUNTS, NEVER A PERCENTAGE — divide them yourself. LEAVES ONLY, so a
   * parent task is in neither number. A track that is not yours reads `0/0`.
   */
  async readRollup(trackId: string): Promise<TrackRollup> {
    return this.http.request<TrackRollup>("GET", `/tracks/${trackId}/rollup`);
  }

  /**
   * Progress for several tracks in ONE request.
   *
   * 🔴 USE THIS FOR A BOARD. Reading `readRollup()` once per track is `1 + N`
   * round trips AND `1 + N` queries; this is one of each, because the server
   * reads every named track's tasks in a single statement.
   *
   * At most 100 ids per call — the bound is the URL length, not the work. A full
   * 200-track page from `list()` is therefore two calls.
   *
   * One entry per id ASKED FOR, in the order asked. A track that is not yours is
   * present with `0/0`; see {@link ListTrackRollupsResponse}.
   */
  async readRollups(trackIds: readonly string[]): Promise<ListTrackRollupsResponse> {
    return this.http.request<ListTrackRollupsResponse>("GET", `/tracks/rollup`, {
      query: { trackIds: trackIds.join(",") }
    });
  }

  /** The tracks whose blockers are all done. */
  async listReady(params?: ReadySetParams): Promise<ListReadyTracksResponse> {
    return this.http.request<ListReadyTracksResponse>("GET", `/tracks/ready`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * The tasks inside one track that can be picked up right now.
   *
   * ⚠️ A track in another organization answers with an EMPTY SET, not a refusal.
   * The read is anchored on the key's organization, so a foreign id matches no
   * candidate row — the same answer a real track with nothing ready gives.
   */
  async listReadyTasks(
    trackId: string,
    params?: ReadySetParams
  ): Promise<ListReadyTrackTasksResponse> {
    return this.http.request<ListReadyTrackTasksResponse>("GET", `/tracks/${trackId}/tasks/ready`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /** Declare that one track blocks another. An edge closing a circle is refused. */
  async createDependencyEdge(body: CreateTrackDependencyEdgeBody): Promise<TrackEdgeCreated> {
    return this.http.request<TrackEdgeCreated>("POST", `/tracks/dependencies`, { body });
  }

  /** Create one section, at a chosen index among its siblings. */
  async createSection(trackId: string, body: CreateTrackSectionBody): Promise<TrackSection> {
    return this.http.request<TrackSection>("POST", `/tracks/${trackId}/sections`, { body });
  }

  /** Re-slug one section; its whole subtree follows, in ONE statement. */
  async renameSection(
    trackId: string,
    sectionId: string,
    body: RenameTrackSectionBody
  ): Promise<RenameTrackSectionResponse> {
    return this.http.request<RenameTrackSectionResponse>(
      "POST",
      `/tracks/${trackId}/sections/${sectionId}/rename`,
      { body }
    );
  }

  /** One task, with its collision banner first. */
  async readTask(taskId: string): Promise<TrackTask> {
    return this.http.request<TrackTask>("GET", `/tracks/tasks/${taskId}`);
  }

  /**
   * Say you are working on a task, taking it over if somebody already was.
   *
   * 🔴 THIS REFUSES NOTHING AND TAKES NO LOCK. `claimedByAgentId` is coordination,
   * not access control: one credential per organization and no per-agent identity,
   * so a refusal would enforce nothing and would have to be recovered from.
   */
  async claimTask(taskId: string, body: ClaimTrackTaskBody): Promise<ClaimTrackTaskResponse> {
    return this.http.request<ClaimTrackTaskResponse>("POST", `/tracks/tasks/${taskId}/claim`, {
      body
    });
  }

  /**
   * Tick or un-tick one task.
   *
   * A task marked as a GATE refuses its own completion without evidence, and so
   * does every task above an unevidenced gate.
   */
  async toggleTask(taskId: string, body: ToggleTrackTaskBody): Promise<ToggleTrackTaskResponse> {
    return this.http.request<ToggleTrackTaskResponse>("POST", `/tracks/tasks/${taskId}/toggle`, {
      body
    });
  }

  /** Declare that one task blocks another, inside one track. */
  async createTaskEdge(trackId: string, body: CreateTrackTaskEdgeBody): Promise<TrackEdgeCreated> {
    return this.http.request<TrackEdgeCreated>("POST", `/tracks/${trackId}/task-edges`, { body });
  }

  /**
   * Import a whole plan — tasks and their dependencies — as ONE atomic write.
   *
   * Any refusal rolls the entire import back, so a half-imported plan is not a
   * state this call can leave behind.
   */
  async importPlan(trackId: string, body: ImportTrackPlanBody): Promise<ImportTrackPlanResponse> {
    return this.http.request<ImportTrackPlanResponse>("POST", `/tracks/${trackId}/import-plan`, {
      body
    });
  }

  /** The agents on this track, most recently heard from first. */
  async listAgents(
    trackId: string,
    params?: ListTrackAgentsParams
  ): Promise<ListTrackAgentsResponse> {
    return this.http.request<ListTrackAgentsResponse>("GET", `/tracks/${trackId}/agents`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /** Open one agent. The name is unique among the track's OPEN agents. */
  async openAgent(trackId: string, body: OpenTrackAgentBody): Promise<TrackAgent> {
    return this.http.request<TrackAgent>("POST", `/tracks/${trackId}/agents`, { body });
  }

  /**
   * The heartbeat. Writes `lastHeardAt` and nothing else.
   *
   * It is the ONE last-heard clock in this domain: every collision banner's
   * staleness is derived from it, and so is the stale-agent sweep.
   */
  async beatAgent(trackId: string, agentId: string): Promise<TrackAgent> {
    return this.http.request<TrackAgent>("POST", `/tracks/${trackId}/agents/${agentId}/beat`);
  }

  /** Close, retire or kill an agent. The last two need a reason. */
  async closeAgent(
    trackId: string,
    agentId: string,
    body: CloseTrackAgentBody
  ): Promise<TrackAgent> {
    return this.http.request<TrackAgent>("POST", `/tracks/${trackId}/agents/${agentId}/close`, {
      body
    });
  }

  /** The track's log, newest first. */
  async listDiaryEntries(
    trackId: string,
    params?: ListTrackDiaryEntriesParams
  ): Promise<ListTrackDiaryEntriesResponse> {
    return this.http.request<ListTrackDiaryEntriesResponse>("GET", `/tracks/${trackId}/diary`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Append one entry to the track's log.
   *
   * 🔴 THIS IS THE LOG'S ONLY WRITE, AND THERE IS NO UPDATE AND NO DELETE — not a
   * guarded one, an absent one. A wrong entry is superseded by a later entry.
   */
  async appendDiaryEntry(
    trackId: string,
    body: AppendTrackDiaryEntryBody
  ): Promise<TrackDiaryEntry> {
    return this.http.request<TrackDiaryEntry>("POST", `/tracks/${trackId}/diary`, { body });
  }

  /** Every memory entry on the track, with the byte budget. */
  async listMemoryEntries(trackId: string): Promise<ListTrackMemoryEntriesResponse> {
    return this.http.request<ListTrackMemoryEntriesResponse>("GET", `/tracks/${trackId}/memory`);
  }

  /**
   * Create or replace one memory entry, within the track's byte budget.
   *
   * The budget is BYTES, so a short string of CJK can cost three times its
   * length. A write with no room answers 409.
   */
  async putMemoryEntry(
    trackId: string,
    body: PutTrackMemoryEntryBody
  ): Promise<PutTrackMemoryEntryResponse> {
    return this.http.request<PutTrackMemoryEntryResponse>("PUT", `/tracks/${trackId}/memory`, {
      body
    });
  }

  /** Remove one memory entry and refund its bytes. Idempotent. */
  async deleteMemoryEntry(trackId: string, key: string): Promise<DeleteTrackMemoryEntryResponse> {
    return this.http.request<DeleteTrackMemoryEntryResponse>(
      "DELETE",
      `/tracks/${trackId}/memory/${key}`
    );
  }

  /** The track's event stream, newest first. */
  async listEvents(
    trackId: string,
    params?: ListTrackEventsParams
  ): Promise<ListTrackEventsResponse> {
    return this.http.request<ListTrackEventsResponse>("GET", `/tracks/${trackId}/events`, {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * The ORGANISATION'S event stream — every track at once, plus the events that
   * name no track. Newest first, one keyset page at a time.
   *
   * Its own resource path (`/track-events`), not a segment under `/tracks`,
   * because it names no track — and `tracks/events` would collide with
   * `tracks/:trackId` on the server's router.
   *
   * ⚠️ WALK IT WITH `nextCursor`, AND STOP ONLY WHEN IT IS `null`. An offset would
   * be wrong here rather than merely slower: the stream is append-only and read
   * newest-first, so events landing between two calls shift an offset window —
   * re-serving rows and silently skipping others.
   */
  async listOrganizationEvents(
    params?: ListOrganizationTrackEventsParams
  ): Promise<ListOrganizationTrackEventsResponse> {
    return this.http.request<ListOrganizationTrackEventsResponse>("GET", "/track-events", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /** Append one event. `actorAgentId` is required — see the body type. */
  async appendEvent(trackId: string, body: AppendTrackEventBody): Promise<TrackEvent> {
    return this.http.request<TrackEvent>("POST", `/tracks/${trackId}/events`, { body });
  }
}
