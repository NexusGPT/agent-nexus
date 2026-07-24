import type { PageResponse } from "../types/common";
import type {
  AvailablePhoneNumber,
  ListPhoneNumbersParams,
  PhoneNumber,
  SearchAvailablePhoneNumbersParams
} from "../types/phone-numbers";
import { BaseResource } from "./base-resource";

export class PhoneNumbersResource extends BaseResource {
  /**
   * Search numbers available to purchase.
   *
   * `limit` defaults to 5 — raise it when filtering by area code, or the filter
   * has very few candidates to choose from.
   */
  async searchAvailable(
    params: SearchAvailablePhoneNumbersParams
  ): Promise<AvailablePhoneNumber[]> {
    return this.http.request<AvailablePhoneNumber[]>("GET", "/phone-numbers/available", {
      query: params as Record<string, string | number | boolean | undefined>
    });
  }

  async buy(body: {
    phoneNumber: string;
    country: string;
    price: string;
    connectionId?: string;
  }): Promise<any> {
    return this.http.request<any>("POST", "/phone-numbers/buy", { body });
  }

  /**
   * List the organization's phone numbers, one page at a time.
   *
   * The result is paginated — read `meta.totalPages` and request further pages
   * rather than assuming a single call returns every number.
   */
  async list(params?: ListPhoneNumbersParams): Promise<PageResponse<PhoneNumber>> {
    const { data, meta } = await this.http.requestWithMeta<PhoneNumber[]>("GET", "/phone-numbers", {
      query: params as Record<string, string | number | undefined>
    });
    return { data, meta: meta! };
  }

  async get(phoneNumberId: string): Promise<any> {
    return this.http.request<any>("GET", `/phone-numbers/${phoneNumberId}`);
  }

  async release(phoneNumberId: string): Promise<any> {
    return this.http.request<any>("DELETE", `/phone-numbers/${phoneNumberId}`);
  }
}
