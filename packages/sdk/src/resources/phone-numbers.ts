import { BaseResource } from "./base-resource";

export class PhoneNumbersResource extends BaseResource {
  async searchAvailable(params: {
    country: string;
    areaCode?: string;
    type?: "mobile" | "local";
    sms?: boolean;
    mms?: boolean;
    voice?: boolean;
  }): Promise<any[]> {
    return this.http.request<any[]>("GET", "/phone-numbers/available", {
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

  async list(): Promise<any[]> {
    return this.http.request<any[]>("GET", "/phone-numbers");
  }

  async get(phoneNumberId: string): Promise<any> {
    return this.http.request<any>("GET", `/phone-numbers/${phoneNumberId}`);
  }

  async release(phoneNumberId: string): Promise<any> {
    return this.http.request<any>("DELETE", `/phone-numbers/${phoneNumberId}`);
  }
}
