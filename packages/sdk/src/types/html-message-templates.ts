// ============================================================================
// HTML MESSAGE TEMPLATES
// ============================================================================

/**
 * A `ParameterSetup` document — the typed, agent-fillable input schema for a
 * template (supports lists, objects and nesting). Stored as opaque JSON; keep
 * it loosely typed on the client.
 */
export type HtmlMessageTemplateInputSchema = Record<string, unknown>;

/** List/summary view of an HTML message template (omits `htmlContent`). */
export interface HtmlMessageTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  inputSchema: HtmlMessageTemplateInputSchema | null;
  /** The EMBED deployment this template belongs to. */
  deploymentId: string;
  createdAt: string;
  updatedAt: string | null;
}

/** Full HTML message template including its Handlebars source. */
export interface HtmlMessageTemplate extends HtmlMessageTemplateSummary {
  htmlContent: string;
}

export interface ListHtmlMessageTemplatesParams {
  search?: string;
  limit?: number;
  /** Filter templates by their EMBED deployment. */
  deploymentId?: string;
}

export interface ListHtmlMessageTemplatesResponse {
  items: HtmlMessageTemplateSummary[];
}

export interface CreateHtmlMessageTemplateBody {
  name: string;
  description?: string;
  htmlContent: string;
  inputSchema?: HtmlMessageTemplateInputSchema;
  /** The EMBED deployment the template belongs to. */
  deploymentId: string;
}

export interface UpdateHtmlMessageTemplateBody {
  name?: string;
  description?: string | null;
  htmlContent?: string;
  inputSchema?: HtmlMessageTemplateInputSchema | null;
}

export interface DeleteHtmlMessageTemplateResponse {
  id: string;
  deleted: true;
}

export interface RenderHtmlMessageTemplateBody {
  /** Structured data to fill the template's placeholders. */
  data?: Record<string, unknown>;
}

export interface RenderHtmlMessageTemplateResponse {
  html: string;
}

export interface FillHtmlMessageTemplateBody {
  /** Natural-language context the agent uses to fill the input schema. */
  context: string;
  /** Optional model override. */
  model?: string;
}

export interface FillHtmlMessageTemplateResponse {
  html: string;
  data: Record<string, unknown>;
}
