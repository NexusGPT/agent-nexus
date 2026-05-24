import type {
  CreateEmulatorSessionBody,
  EmulatorScenario,
  EmulatorScenarioDetail,
  EmulatorSendMessageResult,
  EmulatorSession,
  EmulatorSessionDetail,
  ListEmulatorScenariosParams,
  ReplayEmulatorScenarioBody,
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

  /** Send a message in an emulator session. Returns debug info about agent execution. */
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
  async replayScenario(scenarioId: string, body: ReplayEmulatorScenarioBody): Promise<unknown> {
    return this.http.request<unknown>("POST", `/emulator/scenarios/${scenarioId}/replay`, { body });
  }

  /** Delete a scenario. */
  async deleteScenario(scenarioId: string): Promise<void> {
    await this.http.request<void>("DELETE", `/emulator/scenarios/${scenarioId}`);
  }
}
