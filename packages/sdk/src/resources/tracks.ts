import type {
  AppendTrackDiaryEntryBody,
  AppendTrackEventBody,
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
  ListReadyTracksResponse,
  ListReadyTrackTasksResponse,
  ListTrackAgentsParams,
  ListTrackAgentsResponse,
  ListTrackDiaryEntriesParams,
  ListTrackDiaryEntriesResponse,
  ListTrackEventsParams,
  ListTrackEventsResponse,
  ListTrackMemoryEntriesResponse,
  OpenTrackAgentBody,
  PutTrackMemoryEntryBody,
  PutTrackMemoryEntryResponse,
  ReadySetParams,
  RenameTrackSectionBody,
  RenameTrackSectionResponse,
  ToggleTrackTaskBody,
  ToggleTrackTaskResponse,
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
   * The track's progress: leaves done, leaves total.
   *
   * 🔴 COUNTS, NEVER A PERCENTAGE — divide them yourself. LEAVES ONLY, so a
   * parent task is in neither number. A track that is not yours reads `0/0`.
   */
  async readRollup(trackId: string): Promise<TrackRollup> {
    return this.http.request<TrackRollup>("GET", `/tracks/${trackId}/rollup`);
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

  /** Append one event. `actorAgentId` is required — see the body type. */
  async appendEvent(trackId: string, body: AppendTrackEventBody): Promise<TrackEvent> {
    return this.http.request<TrackEvent>("POST", `/tracks/${trackId}/events`, { body });
  }
}
