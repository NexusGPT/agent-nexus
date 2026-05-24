import type {
  AccessCard,
  AvailableActionsResponse,
  CreateAccessCardBody,
  DeleteAccessCardResponse,
  UpdateAccessCardBody
} from "../types/access-cards";
import { BaseResource } from "./base-resource";

export class AccessCardsResource extends BaseResource {
  async listByCredential(credentialId: string): Promise<{ accessCards: AccessCard[] }> {
    return this.http.request<{ accessCards: AccessCard[] }>(
      "GET",
      `/credentials/${credentialId}/cards`
    );
  }

  async create(credentialId: string, body: CreateAccessCardBody): Promise<AccessCard> {
    return this.http.request<AccessCard>("POST", `/credentials/${credentialId}/cards`, { body });
  }

  async get(accessCardId: string): Promise<AccessCard> {
    return this.http.request<AccessCard>("GET", `/access-cards/${accessCardId}`);
  }

  async update(accessCardId: string, body: UpdateAccessCardBody): Promise<AccessCard> {
    return this.http.request<AccessCard>("PATCH", `/access-cards/${accessCardId}`, { body });
  }

  async delete(accessCardId: string): Promise<DeleteAccessCardResponse> {
    return this.http.request<DeleteAccessCardResponse>("DELETE", `/access-cards/${accessCardId}`);
  }

  async availableActions(credentialId: string): Promise<AvailableActionsResponse> {
    return this.http.request<AvailableActionsResponse>("GET", "/access-cards/available-actions", {
      query: { credentialId }
    });
  }
}
