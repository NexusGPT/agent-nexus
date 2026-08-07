import type { PageResponse } from "../types/common";
import type {
  AvailablePhoneNumber,
  BuyPhoneNumberBody,
  ListPhoneNumbersParams,
  PhoneNumber,
  ReleasePhoneNumberResponse,
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

  /**
   * Buy a number found by `searchAvailable`.
   *
   * @param body - The number, its country and the quoted price. Pass
   *   `connectionId` to buy on a Twilio subaccount rather than the shared pool.
   * @returns The purchased number in its stored form.
   */
  async buy(body: BuyPhoneNumberBody): Promise<PhoneNumber> {
    return this.http.request<PhoneNumber>("POST", "/phone-numbers/buy", { body });
  }

  /**
   * List the organization's phone numbers, one page at a time.
   *
   * The result is paginated — read `meta.totalPages` and request further pages
   * rather than assuming a single call returns every number.
   */
  async list(params?: ListPhoneNumbersParams): Promise<PageResponse<PhoneNumber>> {
    return this.http.requestPage<PhoneNumber>("GET", "/phone-numbers", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * Get one of the organization's numbers.
   *
   * @param phoneNumberId - Phone number UUID.
   * @returns The number.
   */
  async get(phoneNumberId: string): Promise<PhoneNumber> {
    return this.http.request<PhoneNumber>("GET", `/phone-numbers/${phoneNumberId}`);
  }

  /**
   * Release a number back to Twilio.
   *
   * @param phoneNumberId - Phone number UUID.
   * @returns What the release did — deployments detached, WhatsApp senders
   *   deregistered, and whether Twilio accepted it. Check `twilioReleased`:
   *   `false` means the number is gone in Nexus but may still be billed.
   */
  async release(phoneNumberId: string): Promise<ReleasePhoneNumberResponse> {
    return this.http.request<ReleasePhoneNumberResponse>(
      "DELETE",
      `/phone-numbers/${phoneNumberId}`
    );
  }
}
