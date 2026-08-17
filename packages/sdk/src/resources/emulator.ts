import type {
  CreateEmulatorSessionBody,
  EmulatorScenario,
  EmulatorScenarioDetail,
  EmulatorSendMessageResult,
  EmulatorSession,
  EmulatorSessionDetail,
  EmulatorStreamEvent,
  ListEmulatorScenariosParams,
  ReplayEmulatorScenarioBody,
  ReplayScenarioResponse,
  SaveEmulatorScenarioBody,
  SendEmulatorMessageBody
} from "../types/emulator";
import { BaseResource } from "./base-resource";

/**
 * Emulator resource. Accessed via `client.emulator`.
 *
 * Test deployments without real external channels by creating emulator sessions,
 * sending messages, and managing replayable scenarios.
 */
export class EmulatorResource extends BaseResource {
  // ─── Sessions ───────────────────────────────────────────────────────────────

  /** Create a new emulator session for a deployment. */
  async createSession(
    deploymentId: string,
    body?: CreateEmulatorSessionBody
  ): Promise<EmulatorSession> {
    return this.http.request<EmulatorSession>("POST", `/emulator/${deploymentId}/sessions`, {
      body
    });
  }

  /** List emulator sessions for a deployment. */
  async listSessions(deploymentId: string): Promise<EmulatorSession[]> {
    return this.http.request<EmulatorSession[]>("GET", `/emulator/${deploymentId}/sessions`);
  }

  /** Get detailed information about an emulator session, including messages. */
  async getSession(deploymentId: string, sessionId: string): Promise<EmulatorSessionDetail> {
    return this.http.request<EmulatorSessionDetail>(
      "GET",
      `/emulator/${deploymentId}/sessions/${sessionId}`
    );
  }

  /**
   * Send a message in an emulator session. Returns debug info about agent
   * execution when the turn completes within the server's sync wait window;
   * slow turns return `status: "processing"` and finish in the background —
   * poll getSession() for the answer.
   */
  async sendMessage(
    deploymentId: string,
    sessionId: string,
    body: SendEmulatorMessageBody
  ): Promise<EmulatorSendMessageResult> {
    return this.http.request<EmulatorSendMessageResult>(
      "POST",
      `/emulator/${deploymentId}/sessions/${sessionId}/messages`,
      { body }
    );
  }

  /**
   * Send a message and stream the agent turn as it happens.
   *
   * The streaming twin of {@link sendMessage}: same body, same effect on the
   * conversation, but it yields token deltas, reasoning, tool start/finish and
   * the final message instead of waiting for the turn and returning a summary.
   * Use it to build a chat UI that shows progress rather than a spinner.
   *
   * The stream opens with `start` (carrying `chatId` / `messageId`, which the
   * blocking send only reveals at the end) and closes with `done`. Leaving the
   * loop early cancels the connection; the turn keeps running server-side and
   * its result is still persisted, so `getSession()` can read it afterwards.
   *
   * @example
   * ```ts
   * for await (const event of client.emulator.streamMessage(depId, sessionId, { content: "hi" })) {
   *   if (event.type === "token") process.stdout.write(event.delta);
   *   if (event.type === "done") console.log(`\n[${event.status}]`);
   * }
   * ```
   */
  streamMessage(
    deploymentId: string,
    sessionId: string,
    body: SendEmulatorMessageBody
  ): AsyncGenerator<EmulatorStreamEvent, void, undefined> {
    return this.http.requestSSE<EmulatorStreamEvent>(
      "POST",
      `/emulator/${deploymentId}/sessions/${sessionId}/messages/stream`,
      { body }
    );
  }

  /** Delete an emulator session. */
  async deleteSession(deploymentId: string, sessionId: string): Promise<void> {
    await this.http.request<void>("DELETE", `/emulator/${deploymentId}/sessions/${sessionId}`);
  }

  // ─── Scenarios ──────────────────────────────────────────────────────────────

  /** Save a scenario from an existing emulator session. */
  async saveScenario(body: SaveEmulatorScenarioBody): Promise<EmulatorScenario> {
    return this.http.request<EmulatorScenario>("POST", "/emulator/scenarios", {
      body
    });
  }

  /** List scenarios, optionally filtered by deployment. */
  async listScenarios(params?: ListEmulatorScenariosParams): Promise<EmulatorScenario[]> {
    return this.http.request<EmulatorScenario[]>("GET", "/emulator/scenarios", {
      query: params as Record<string, string | undefined>
    });
  }

  /** Get detailed information about a scenario, including its messages. */
  async getScenario(scenarioId: string): Promise<EmulatorScenarioDetail> {
    return this.http.request<EmulatorScenarioDetail>("GET", `/emulator/scenarios/${scenarioId}`);
  }

  /** Replay a scenario against a deployment. Runs asynchronously. */
  async replayScenario(
    scenarioId: string,
    body: ReplayEmulatorScenarioBody
  ): Promise<ReplayScenarioResponse> {
    return this.http.request<ReplayScenarioResponse>(
      "POST",
      `/emulator/scenarios/${scenarioId}/replay`,
      { body }
    );
  }

  /** Delete a scenario. */
  async deleteScenario(scenarioId: string): Promise<void> {
    await this.http.request<void>("DELETE", `/emulator/scenarios/${scenarioId}`);
  }
}
