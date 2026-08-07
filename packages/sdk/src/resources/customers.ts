import type {
  AddCustomerNoteBody,
  CreateCustomerBody,
  CustomerDetail,
  CustomerNote,
  CustomerSummary,
  ListCustomersParams,
  ListCustomersResponse,
  UpdateCustomerBody
} from "../types/customers";
import { BaseResource } from "./base-resource";

export class CustomersResource extends BaseResource {
  async list(params?: ListCustomersParams): Promise<ListCustomersResponse> {
    return this.http.requestPage<CustomerSummary>("GET", "/customers", {
      query: params as Record<string, string | number | undefined>
    });
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

  async addNote(customerId: string, body: AddCustomerNoteBody): Promise<CustomerNote> {
    return this.http.request<CustomerNote>("POST", `/customers/${customerId}/notes`, { body });
  }
}
