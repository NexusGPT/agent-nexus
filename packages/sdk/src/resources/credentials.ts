import type { HttpClient } from "../http-client";
import type { PageResponse } from "../types/common";
import type {
  ConnectCredentialBody,
  ConnectCredentialResult,
  Credential,
  DeleteCredentialResponse,
  ListCredentialsParams,
  UpdateCredentialBody
} from "../types/credentials";
import type { HandshakeStatusResponse } from "../types/tool-connection";
import { AccessCardsResource } from "./access-cards";
import { BaseResource } from "./base-resource";

export class CredentialsResource extends BaseResource {
  /** Access card operations scoped under credentials. */
  public readonly cards: AccessCardsResource;

  constructor(http: HttpClient) {
    super(http);
    this.cards = new AccessCardsResource(http);
  }

  async list(params?: ListCredentialsParams): Promise<PageResponse<Credential>> {
    return this.http.requestPage<Credential>("GET", "/credentials", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Connect an external app — the standalone entry point.
   *
   * No workflow, no agent, and on the OAuth arm no tool id: `service` names the
   * account to authorize. The API-key arm carries `toolId` in the BODY, because
   * the key is stored against that tool's auth block.
   *
   * ```
   * const started = await client.credentials.connect({ authType: "oauth", service: "GMAIL" });
   * // started.authType === "oauth" -> open started.authorizationUrl, then:
   * const done = await client.credentials.waitForConnection(started.handshakeId);
   * ```
   *
   * @param body - OAuth service, or tool id + API key.
   * @returns The authorization details to open, or the credential just created.
   */
  async connect(body: ConnectCredentialBody): Promise<ConnectCredentialResult> {
    return this.http.request<ConnectCredentialResult>("POST", "/credentials/connect", { body });
  }

  /**
   * Poll a connection started by {@link connect}.
   *
   * @param handshakeId - The `handshakeId` from the OAuth arm of `connect()`.
   *   Not always a UUID — a Pipedream connection's is its `ctok_…` connect token.
   */
  async connectStatus(handshakeId: string): Promise<HandshakeStatusResponse> {
    return this.http.request<HandshakeStatusResponse>("GET", `/credentials/connect/${handshakeId}`);
  }

  /**
   * Poll {@link connectStatus} until the handshake leaves `PENDING`.
   *
   * Resolves on any terminal state (`COMPLETED`, `FAILED`, `EXPIRED`) or when
   * the timeout is reached, in which case it reports `EXPIRED` with a
   * `Polling timed out` message rather than throwing — a timeout is a fact
   * about this call, not proof the user abandoned the flow.
   *
   * @param handshakeId - The `handshakeId` from the OAuth arm of `connect()`.
   * @param opts - Optional timeout (default 5 min) and interval (default 2 s).
   */
  async waitForConnection(
    handshakeId: string,
    opts?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<HandshakeStatusResponse> {
    const timeout = opts?.timeoutMs ?? 5 * 60 * 1000;
    const interval = opts?.intervalMs ?? 2000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const status = await this.connectStatus(handshakeId);
      if (status.status !== "PENDING") return status;
      await new Promise((r) => setTimeout(r, interval));
    }

    return {
      status: "EXPIRED",
      connectionId: null,
      errorMessage: "Polling timed out",
      errorCode: null,
      expiresAt: null
    };
  }

  async get(credentialId: string): Promise<Credential> {
    return this.http.request<Credential>("GET", `/credentials/${credentialId}`);
  }

  async update(credentialId: string, body: UpdateCredentialBody): Promise<Credential> {
    return this.http.request<Credential>("PATCH", `/credentials/${credentialId}`, { body });
  }

  async delete(credentialId: string): Promise<DeleteCredentialResponse> {
    return this.http.request<DeleteCredentialResponse>("DELETE", `/credentials/${credentialId}`);
  }
}
