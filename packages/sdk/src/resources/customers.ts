import type {
  AddCustomerNoteBody,
  CreateCustomerBody,
  CustomerDetail,
  CustomerSummary,
  ListCustomersParams,
  ListCustomersResponse,
  UpdateCustomerBody
} from "../types/customers";
import { BaseResource } from "./base-resource";

export class CustomersResource extends BaseResource {
  async list(params?: ListCustomersParams): Promise<ListCustomersResponse> {
    const { data, meta } = await this.http.requestWithMeta<CustomerSummary[]>("GET", "/customers", {
      query: params as Record<string, string | number | undefined>
    });
    return { data, meta: meta! };
  }

  async get(customerId: string): Promise<CustomerDetail> {
    return this.http.request<CustomerDetail>("GET", `/customers/${customerId}`);
  }

  async getByExternalId(externalUserId: string): Promise<CustomerDetail | null> {
    return this.http.request<CustomerDetail | null>(
      "GET",
      `/customers/by-external-id/${encodeURIComponent(externalUserId)}`
    );
  }

  async create(body: CreateCustomerBody): Promise<CustomerSummary> {
    return this.http.request<CustomerSummary>("POST", "/customers", { body });
  }

  async update(customerId: string, body: UpdateCustomerBody): Promise<CustomerSummary> {
    return this.http.request<CustomerSummary>("PATCH", `/customers/${customerId}`, { body });
  }

  async delete(customerId: string): Promise<{ deleted: boolean }> {
    return this.http.request<{ deleted: boolean }>("DELETE", `/customers/${customerId}`);
  }

  async addNote(customerId: string, body: AddCustomerNoteBody): Promise<unknown> {
    return this.http.request("POST", `/customers/${customerId}/notes`, { body });
  }
}
