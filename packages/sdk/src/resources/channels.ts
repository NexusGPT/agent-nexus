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

  async searchAvailablePhoneNumbers(params: {
    country: string;
    areaCode?: string;
    type?: "mobile" | "local";
    sms?: boolean;
    mms?: boolean;
    voice?: boolean;
  }): Promise<any[]> {
    return this.http.request<any[]>("GET", "/channels/phone-numbers/available", {
      query: params as Record<string, string | number | boolean | undefined>
    });
  }

  async buyPhoneNumber(body: {
    phoneNumber: string;
    country: string;
    price: string;
    connectionId?: string;
  }): Promise<any> {
    return this.http.request<any>("POST", "/channels/phone-numbers/buy", { body });
  }

  async listPhoneNumbers(): Promise<any[]> {
    return this.http.request<any[]>("GET", "/channels/phone-numbers");
  }

  async getPhoneNumber(phoneNumberId: string): Promise<any> {
    return this.http.request<any>("GET", `/channels/phone-numbers/${phoneNumberId}`);
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

  async getTestSendStatus(
    templateId: string,
    messageSid: string,
    params: { connectionId: string }
  ): Promise<GetTestSendStatusResponse> {
    return this.http.request<GetTestSendStatusResponse>(
      "GET",
      `/channels/whatsapp-templates/${templateId}/test-send/${messageSid}/status`,
      { query: params as Record<string, string> }
    );
  }
}
