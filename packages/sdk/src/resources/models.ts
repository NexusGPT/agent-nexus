import type { HttpClient } from "../http-client";
import type { ModelSummary } from "../types/models";
import { BaseResource } from "./base-resource";

/**
 * Models resource. Accessed via `client.models`.
 *
 * Provides read-only access to the available AI models that can be
 * used when creating or updating agents.
 */
export class ModelsResource extends BaseResource {
  constructor(http: HttpClient) {
    super(http);
  }

  /**
   * List all enabled AI models available for agents.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * 🚨 THE RESPONSE IS A FLAT ARRAY. IT IS NOT `{ models: [...] }`.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * This method was DECLARED as `Promise<{ models: ModelSummary[] }>` while the
   * route returned `createApiSuccess([...])` — a flat array, which the HTTP
   * client unwraps to the array itself. The wrapper key was deliberately removed
   * from `ListModelsUseCase` ("the previous `{ models: [...] }` wrapper key
   * violated the SDK contract"); this signature was not moved with it.
   *
   * A wrong RETURN TYPE cannot fail a typecheck, because nothing here compares
   * the declaration to the wire. It fails in the CONSUMER, silently: the CLI's
   * `const { models } = await client.models.list()` destructured a key that does
   * not exist, so `nexus model list --json` printed `{}` — zero of 45 models,
   * shaped exactly like an empty account — and the table path threw
   * "Cannot read properties of undefined (reading 'length')".
   *
   * `packages/cli/src/commands/model.ts` is the only consumer, and the fixed
   * signature is what makes a wrong read there a compile error.
   *
   * @returns Model summaries with identifiers, providers, and capabilities.
   */
  async list(): Promise<ModelSummary[]> {
    return this.http.request<ModelSummary[]>("GET", "/models");
  }
}
