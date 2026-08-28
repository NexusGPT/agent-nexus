import type {
  AgentEvalTemplate,
  AttachAgentEvalTemplateBody,
  CloneAgentEvalTemplateBody,
  CreateAgentEvalTemplateBody,
  ListAgentEvalTemplatesParams,
  ListImportableAgentEvalTemplatesParams,
  UpdateAgentEvalTemplateBody
} from "../types/agent-evals";
import type { DeleteResponse, PageResponse } from "../types/common";
import { BaseResource } from "./base-resource";

/**
 * Templates. Accessed via `client.agentEvals.templates`.
 *
 * A template is a reusable tester persona, judge rubric, or summary prompt.
 * Templates are AGENT-SCOPED — {@link create} requires the agent that will own
 * one — with platform seeds sitting at `scope: "GLOBAL"` alongside them.
 *
 * ## Reuse has two spellings and they are not interchangeable
 *
 * - {@link attach} LINKS one existing template to a second agent. One template,
 *   two owners; editing it changes what both agents see.
 * - {@link clone} COPIES it. Two templates; editing one leaves the other alone.
 *
 * {@link detach} undoes an attach. It removes the LINK, never the template — and
 * the acknowledgement it returns carries the template's id, not the agent's.
 *
 * {@link listImportable} is the picker behind attach: it answers "which other
 * agents' templates could this agent take", so its `agentId` is required.
 */
export class AgentEvalTemplatesResource extends BaseResource {
  /**
   * List templates.
   *
   * @param params - Optional filters and pagination. With `agentId`, the listing
   *   is the global seeds PLUS the templates attached to that agent.
   * @returns One page of templates.
   */
  async list(params?: ListAgentEvalTemplatesParams): Promise<PageResponse<AgentEvalTemplate>> {
    return this.http.requestPage<AgentEvalTemplate>("GET", "/agent-evals/templates", {
      query: params as Record<string, string | number | undefined>
    });
  }

  /**
   * List the templates an agent could import — other agents' templates, minus
   * the ones already attached to it.
   *
   * @param params - `agentId` is required; the question has no agent-less form.
   * @returns One page of importable templates.
   */
  async listImportable(
    params: ListImportableAgentEvalTemplatesParams
  ): Promise<PageResponse<AgentEvalTemplate>> {
    // Spelled out rather than asserted. The sibling methods take an ALL-OPTIONAL
    // params object, which overlaps `Record<string, string | number | undefined>`
    // enough for a single `as` — this one's `agentId` is required, so the same
    // assertion is a compile error and the only way to keep it would be the
    // `as unknown as` double hop, which asserts over a gap nothing checks.
    return this.http.requestPage<AgentEvalTemplate>("GET", "/agent-evals/templates/importable", {
      query: {
        agentId: params.agentId,
        page: params.page,
        limit: params.limit,
        kind: params.kind
      }
    });
  }

  /**
   * Create a template owned by one agent.
   *
   * @param body - `agentId`, `kind`, `name` and `systemPrompt` are required.
   * @returns The created template at `version: 1`.
   */
  async create(body: CreateAgentEvalTemplateBody): Promise<AgentEvalTemplate> {
    return this.http.request<AgentEvalTemplate>("POST", "/agent-evals/templates", { body });
  }

  /**
   * Get one template.
   *
   * @param templateId - Template UUID.
   * @returns The template.
   */
  async get(templateId: string): Promise<AgentEvalTemplate> {
    return this.http.request<AgentEvalTemplate>("GET", `/agent-evals/templates/${templateId}`);
  }

  /**
   * Update a template. Only the fields you send are written, and `version` bumps.
   *
   * ⚠️ `endConversationSchema` and `outputJsonSchema` treat `null` and absent
   * differently: `null` CLEARS the stored value, omitting the key leaves it
   * untouched.
   *
   * ⚠️ Editing a template does NOT change any run already created from it — a
   * run freezes its resolved text at create, which is what makes it reproducible.
   *
   * @param templateId - Template UUID.
   * @param body - Fields to write.
   * @returns The updated template.
   */
  async update(templateId: string, body: UpdateAgentEvalTemplateBody): Promise<AgentEvalTemplate> {
    return this.http.request<AgentEvalTemplate>("PATCH", `/agent-evals/templates/${templateId}`, {
      body
    });
  }

  /**
   * Permanently delete a template.
   *
   * @param templateId - Template UUID.
   * @returns Confirmation carrying the deleted template's id.
   */
  async delete(templateId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>("DELETE", `/agent-evals/templates/${templateId}`);
  }

  /**
   * COPY a template onto another agent. The copy is independent of the original.
   *
   * @param templateId - The template to copy.
   * @param body - The agent that will own the copy, and an optional new name.
   * @returns The new template, carrying `clonedFromId`.
   */
  async clone(templateId: string, body: CloneAgentEvalTemplateBody): Promise<AgentEvalTemplate> {
    return this.http.request<AgentEvalTemplate>(
      "POST",
      `/agent-evals/templates/${templateId}/clone`,
      { body }
    );
  }

  /**
   * LINK an existing template to another agent. Both agents then see one
   * template — use {@link clone} when they should diverge.
   *
   * @param templateId - The template to link.
   * @param body - The agent to link it to.
   * @returns The template that was linked.
   */
  async attach(templateId: string, body: AttachAgentEvalTemplateBody): Promise<AgentEvalTemplate> {
    return this.http.request<AgentEvalTemplate>(
      "POST",
      `/agent-evals/templates/${templateId}/attach`,
      { body }
    );
  }

  /**
   * Remove the link {@link attach} created. The template itself survives.
   *
   * @param templateId - The linked template.
   * @param agentId - The agent to unlink it from.
   * @returns Confirmation carrying the TEMPLATE's id — not the agent's.
   */
  async detach(templateId: string, agentId: string): Promise<DeleteResponse> {
    return this.http.request<DeleteResponse>(
      "DELETE",
      `/agent-evals/templates/${templateId}/agents/${agentId}`
    );
  }
}
