import type {
  CreateHtmlMessageTemplateBody,
  DeleteHtmlMessageTemplateResponse,
  FillHtmlMessageTemplateBody,
  FillHtmlMessageTemplateResponse,
  HtmlMessageTemplate,
  ListHtmlMessageTemplatesParams,
  ListHtmlMessageTemplatesResponse,
  RenderHtmlMessageTemplateBody,
  RenderHtmlMessageTemplateResponse,
  UpdateHtmlMessageTemplateBody
} from "../types/html-message-templates";
import { BaseResource } from "./base-resource";

/**
 * HTML message templates: org-owned HTML + Handlebars templates, filled by the
 * agent at runtime and rendered as rich messages in the embed deployment.
 */
export class HtmlMessageTemplatesResource extends BaseResource {
  /** List the organization's HTML message templates (summary view). */
  async list(params?: ListHtmlMessageTemplatesParams): Promise<ListHtmlMessageTemplatesResponse> {
    return this.http.request<ListHtmlMessageTemplatesResponse>("GET", "/html-message-templates", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /** Get a single template including its Handlebars source. */
  async get(templateId: string): Promise<HtmlMessageTemplate> {
    return this.http.request<HtmlMessageTemplate>("GET", `/html-message-templates/${templateId}`);
  }

  /** Create an HTML message template. */
  async create(body: CreateHtmlMessageTemplateBody): Promise<HtmlMessageTemplate> {
    return this.http.request<HtmlMessageTemplate>("POST", "/html-message-templates", { body });
  }

  /** Update an existing HTML message template. */
  async update(
    templateId: string,
    body: UpdateHtmlMessageTemplateBody
  ): Promise<HtmlMessageTemplate> {
    return this.http.request<HtmlMessageTemplate>(
      "PATCH",
      `/html-message-templates/${templateId}`,
      { body }
    );
  }

  /** Delete an HTML message template. */
  async delete(templateId: string): Promise<DeleteHtmlMessageTemplateResponse> {
    return this.http.request<DeleteHtmlMessageTemplateResponse>(
      "DELETE",
      `/html-message-templates/${templateId}`
    );
  }

  /** Render the template with caller-provided data; returns sanitized HTML. */
  async render(
    templateId: string,
    body: RenderHtmlMessageTemplateBody = {}
  ): Promise<RenderHtmlMessageTemplateResponse> {
    return this.http.request<RenderHtmlMessageTemplateResponse>(
      "POST",
      `/html-message-templates/${templateId}/render`,
      { body }
    );
  }

  /** Let the agent fill the template's input schema from context, then render. */
  async fill(
    templateId: string,
    body: FillHtmlMessageTemplateBody
  ): Promise<FillHtmlMessageTemplateResponse> {
    return this.http.request<FillHtmlMessageTemplateResponse>(
      "POST",
      `/html-message-templates/${templateId}/fill`,
      { body }
    );
  }
}
