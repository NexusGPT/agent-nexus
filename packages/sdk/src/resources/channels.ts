import type {
  AutoProvisionBody,
  ChannelSetupResponse,
  Connection,
  CreateConnectionBody,
  CreateWhatsAppSenderBody,
  CreateWhatsAppTemplateBody,
  GetTestSendStatusResponse,
  SubmitTemplateApprovalBody,
  SubmitTemplateApprovalResponse,
  TemplateApproval,
  TestSendWhatsAppTemplateBody,
  TestSendWhatsAppTemplateResponse,
  WhatsAppSender,
  WhatsAppTemplate
} from "../types/channels";
import type { PageResponse } from "../types/common";
import type {
  AvailablePhoneNumber,
  BuyPhoneNumberBody,
  ListPhoneNumbersParams,
  PhoneNumber,
  SearchAvailablePhoneNumbersParams
} from "../types/phone-numbers";
import { BaseResource } from "./base-resource";

export class ChannelsResource extends BaseResource {
  // ===========================================================================
  // Setup Orchestrator
  // ===========================================================================

  async getSetupStatus(type: string): Promise<ChannelSetupResponse> {
    return this.http.request<ChannelSetupResponse>("GET", "/channels/setup", {
      query: { type }
    });
  }

  async autoProvision(body: AutoProvisionBody): Promise<ChannelSetupResponse> {
    return this.http.request<ChannelSetupResponse>("POST", "/channels/setup", { body });
  }

  // ===========================================================================
  // Connections
  // ===========================================================================

  async listConnections(): Promise<Connection[]> {
    return this.http.request<Connection[]>("GET", "/channels/connections");
  }

  async createConnection(body?: CreateConnectionBody): Promise<Connection> {
    return this.http.request<Connection>("POST", "/channels/connections", { body: body ?? {} });
  }

  async getConnection(connectionId: string): Promise<Connection> {
    return this.http.request<Connection>("GET", `/channels/connections/${connectionId}`);
  }

  // ===========================================================================
  // Phone Numbers (mirrors /phone-numbers under /channels/)
  // ===========================================================================

  /** Mirrors `phoneNumbers.searchAvailable`, including its `limit` default of 5. */
  async searchAvailablePhoneNumbers(
    params: SearchAvailablePhoneNumbersParams
  ): Promise<AvailablePhoneNumber[]> {
    return this.http.request<AvailablePhoneNumber[]>("GET", "/channels/phone-numbers/available", {
      query: params as Record<string, string | number | boolean | undefined>
    });
  }

  /** Mirrors `phoneNumbers.buy`. Returns the purchased number in its stored form. */
  async buyPhoneNumber(body: BuyPhoneNumberBody): Promise<PhoneNumber> {
    return this.http.request<PhoneNumber>("POST", "/channels/phone-numbers/buy", { body });
  }

  /**
   * List the organization's phone numbers, one page at a time. Mirrors
   * `phoneNumbers.list` and is paginated the same way.
   */
  async listPhoneNumbers(params?: ListPhoneNumbersParams): Promise<PageResponse<PhoneNumber>> {
    return this.http.requestPage<PhoneNumber>("GET", "/channels/phone-numbers", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /** Mirrors `phoneNumbers.get`. */
  async getPhoneNumber(phoneNumberId: string): Promise<PhoneNumber> {
    return this.http.request<PhoneNumber>("GET", `/channels/phone-numbers/${phoneNumberId}`);
  }

  // ===========================================================================
  // WhatsApp Senders
  // ===========================================================================

  async listWhatsAppSenders(): Promise<WhatsAppSender[]> {
    return this.http.request<WhatsAppSender[]>("GET", "/channels/whatsapp-senders");
  }

  async createWhatsAppSender(body: CreateWhatsAppSenderBody): Promise<WhatsAppSender> {
    return this.http.request<WhatsAppSender>("POST", "/channels/whatsapp-senders", { body });
  }

  async getWhatsAppSender(senderId: string): Promise<WhatsAppSender> {
    return this.http.request<WhatsAppSender>("GET", `/channels/whatsapp-senders/${senderId}`);
  }

  // ===========================================================================
  // WhatsApp Templates
  // ===========================================================================

  async listWhatsAppTemplates(params?: { connectionId?: string }): Promise<WhatsAppTemplate[]> {
    return this.http.request<WhatsAppTemplate[]>("GET", "/channels/whatsapp-templates", {
      query: params as Record<string, string | undefined>
    });
  }

  async createWhatsAppTemplate(body: CreateWhatsAppTemplateBody): Promise<WhatsAppTemplate> {
    return this.http.request<WhatsAppTemplate>("POST", "/channels/whatsapp-templates", { body });
  }

  async getWhatsAppTemplate(templateId: string): Promise<WhatsAppTemplate> {
    return this.http.request<WhatsAppTemplate>("GET", `/channels/whatsapp-templates/${templateId}`);
  }

  async deleteWhatsAppTemplate(templateId: string): Promise<{ deleted: boolean }> {
    return this.http.request<{ deleted: boolean }>(
      "DELETE",
      `/channels/whatsapp-templates/${templateId}`
    );
  }

  async listTemplateApprovals(params?: { connectionId?: string }): Promise<TemplateApproval[]> {
    return this.http.request<TemplateApproval[]>("GET", "/channels/whatsapp-templates/approvals", {
      query: params as Record<string, string | undefined>
    });
  }

  async submitTemplateApproval(
    body: SubmitTemplateApprovalBody
  ): Promise<SubmitTemplateApprovalResponse> {
    return this.http.request<SubmitTemplateApprovalResponse>(
      "POST",
      "/channels/whatsapp-templates/approvals",
      { body }
    );
  }

  // ===========================================================================
  // WhatsApp Template Test-Send
  // ===========================================================================

  async testSendWhatsAppTemplate(
    templateId: string,
    body: TestSendWhatsAppTemplateBody
  ): Promise<TestSendWhatsAppTemplateResponse> {
    return this.http.request<TestSendWhatsAppTemplateResponse>(
      "POST",
      `/channels/whatsapp-templates/${templateId}/test-send`,
      { body }
    );
  }

  /**
   * Poll the delivery status of a test-sent template message.
   *
   * Takes no template id. A test-send status is `(connection, messageSid)`; the
   * template id was a path segment the server never read and it was removed
   * under NEX-3860. Callers on the previous signature drop the first argument.
   */
  async getTestSendStatus(
    messageSid: string,
    params: { connectionId: string }
  ): Promise<GetTestSendStatusResponse> {
    return this.http.request<GetTestSendStatusResponse>(
      "GET",
      `/channels/whatsapp-templates/test-send/${messageSid}/status`,
      { query: params as Record<string, string> }
    );
  }
}
