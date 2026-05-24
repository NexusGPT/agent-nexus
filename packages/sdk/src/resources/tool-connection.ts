import type {
  ConnectToolBody,
  ConnectToolHttpResponse,
  ConnectToolOAuthResponse,
  HandshakeStatusResponse
} from "../types/tool-connection";
import { BaseResource } from "./base-resource";

/**
 * Tool connection resource. Accessed via `client.toolConnection`.
 *
 * Provides endpoints to connect marketplace tools via OAuth or HTTP
 * credentials, poll OAuth handshake status, and delete credentials.
 *
 * ```
 * // OAuth flow
 * const result = await client.toolConnection.connect(toolId, { authType: "oauth", service: "GOOGLE_SHEETS" });
 * console.log("Open:", result.authorizationUrl);
 * const status = await client.toolConnection.waitForConnection(result.handshakeId);
 *
 * // HTTP credential
 * const cred = await client.toolConnection.connect(toolId, { authType: "http", apiKey: "sk-..." });
 * ```
 */
export class ToolConnectionResource extends BaseResource {
  /**
   * Initiate a tool connection via OAuth or create an HTTP credential directly.
   *
   * For OAuth, returns an `authorizationUrl` the user must visit, plus a
   * `handshakeId` for polling. For HTTP, creates the credential immediately.
   *
   * @param toolId - Marketplace tool ID.
   * @param body - Connection type and parameters.
   * @returns OAuth authorization details or the created HTTP credential.
   */
  async connect(
    toolId: string,
    body: ConnectToolBody
  ): Promise<ConnectToolOAuthResponse | ConnectToolHttpResponse> {
    return this.http.request<ConnectToolOAuthResponse | ConnectToolHttpResponse>(
      "POST",
      `/tools/${toolId}/connect`,
      { body }
    );
  }

  /**
   * Poll the status of an OAuth handshake.
   *
   * @param handshakeId - Handshake UUID returned by `connect()`.
   * @returns Current handshake status and connection ID if completed.
   */
  async pollStatus(handshakeId: string): Promise<HandshakeStatusResponse> {
    return this.http.request<HandshakeStatusResponse>(
      "GET",
      `/tools/connect/${handshakeId}/status`
    );
  }

  /**
   * Wait for an OAuth handshake to complete by polling at regular intervals.
   *
   * Resolves when the status changes from `PENDING` to any terminal state
   * (`COMPLETED`, `FAILED`, or `EXPIRED`), or when the timeout is reached.
   *
   * @param handshakeId - Handshake UUID returned by `connect()`.
   * @param opts - Optional timeout (default 5 min) and polling interval (default 2 s).
   * @returns Final handshake status.
   */
  async waitForConnection(
    handshakeId: string,
    opts?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<HandshakeStatusResponse> {
    const timeout = opts?.timeoutMs ?? 5 * 60 * 1000; // 5 minutes
    const interval = opts?.intervalMs ?? 2000; // 2 seconds
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const status = await this.pollStatus(handshakeId);
      if (status.status !== "PENDING") return status;
      await new Promise((r) => setTimeout(r, interval));
    }

    return {
      status: "EXPIRED",
      connectionId: null,
      errorMessage: "Polling timed out",
      expiresAt: null
    };
  }

  /**
   * Delete a credential (connected account) from a tool.
   *
   * @param toolId - Marketplace tool ID.
   * @param credentialId - Credential UUID to delete.
   */
  async deleteCredential(toolId: string, credentialId: string): Promise<void> {
    await this.http.request("DELETE", `/tools/${toolId}/credentials/${credentialId}`);
  }
}
