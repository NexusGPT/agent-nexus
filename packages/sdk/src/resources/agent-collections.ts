import { BaseResource } from "./base-resource";

export class AgentCollectionsResource extends BaseResource {
  async list(agentId: string): Promise<any[]> {
    return this.http.request<any[]>("GET", `/agents/${agentId}/collections`);
  }

  async attach(agentId: string, body: { collectionIds: string[] }): Promise<any> {
    return this.http.request<any>("POST", `/agents/${agentId}/collections`, { body });
  }

  async detach(agentId: string, body: { collectionIds: string[] }): Promise<any> {
    return this.http.request<any>("DELETE", `/agents/${agentId}/collections`, { body });
  }
}
