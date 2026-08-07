import { type HttpClient, withDerivedHasMore } from "../http-client";
import type { PageResponse } from "../types/common";
import type {
  Credential,
  DeleteCredentialResponse,
  ListCredentialsParams,
  UpdateCredentialBody
} from "../types/credentials";
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
    const { data, meta } = await this.http.requestWithMeta<Credential[]>("GET", "/credentials", {
      query: params as Record<string, string | number | undefined>
    });
    return {
      data,
      meta: meta ? withDerivedHasMore(meta) : { total: data.length, page: 1, hasMore: false }
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
