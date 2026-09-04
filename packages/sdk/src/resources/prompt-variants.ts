import type {
  ComparePromptParams,
  ComparePromptResult,
  CreatePromptVariantBody,
  ForkPromptVariantBody,
  ListPromptVariantsParams,
  PromotePromptVariantBody,
  PromotePromptVariantResult,
  PromptGraph,
  PromptVariant,
  PromptVariantVersion,
  RenamePromptVariantBody,
  SavePromptVariantVersionBody
} from "../types/prompt-variants";
import { BaseResource } from "./base-resource";

/**
 * PROMPT VARIANTS — branch-based prompt versioning. Accessed via
 * `client.promptVariants`.
 *
 * ## The model in one paragraph
 *
 * Every agent has exactly one **Main** variant (the production lineage) and
 * any number of named variants forked from a version. `saveVersion` appends to
 * a variant's tip; `promote` copies a variant's tip into a NEW Main version —
 * history is never rewritten, on any variant. `archive` hides a variant and
 * refuses further writes; nothing is deleted, which is why the only delete
 * verb here archives.
 *
 * ## 🔴 `variantRef` accepts three spellings
 *
 * A variant id, a variant name, or `"main"` — names case-insensitively. In
 * `compare`, a ref may ALSO be a bare version id, so any point in history can
 * be diffed against any other.
 *
 * ## A save never publishes
 *
 * Publishing goes through `promote({ publish: true })` and nothing else. Even
 * a save aimed at Main leaves the production pointer untouched.
 */
export class PromptVariantsResource extends BaseResource {
  /**
   * The agent's variants, Main first.
   *
   * @param agentId - Agent to list variants for.
   * @param params - `includeArchived: true` to include archived variants.
   * @returns Bare array of variants (no pagination — the set is small).
   */
  async list(agentId: string, params?: ListPromptVariantsParams): Promise<PromptVariant[]> {
    return this.http.request<PromptVariant[]>("GET", `/agents/${agentId}/prompt-variants`, {
      query:
        params?.includeArchived === undefined ? {} : { includeArchived: params.includeArchived }
    });
  }

  /**
   * Fork a new variant. Its first version copies `fromVersionId` — or the Main
   * tip when omitted (falling back to the agent's draft on a fresh agent).
   *
   * @param agentId - Agent to fork on.
   * @param body - New name (never "Main") and optional source version.
   * @returns The created variant, tip and count included.
   */
  async create(agentId: string, body: CreatePromptVariantBody): Promise<PromptVariant> {
    return this.http.request<PromptVariant>("POST", `/agents/${agentId}/prompt-variants`, { body });
  }

  /**
   * Rename a variant. Main cannot be renamed and no name may collide
   * (case-insensitively) with another variant's.
   */
  async rename(
    agentId: string,
    variantRef: string,
    body: RenamePromptVariantBody
  ): Promise<PromptVariant> {
    return this.http.request<PromptVariant>(
      "PATCH",
      `/agents/${agentId}/prompt-variants/${encodeURIComponent(variantRef)}`,
      { body }
    );
  }

  /**
   * Archive a variant: hidden from default lists, refuses further writes.
   * Nothing is deleted — versions and graph edges survive.
   */
  async archive(agentId: string, variantRef: string): Promise<PromptVariant> {
    return this.http.request<PromptVariant>(
      "DELETE",
      `/agents/${agentId}/prompt-variants/${encodeURIComponent(variantRef)}`
    );
  }

  /** Fork a new variant from THIS variant's tip. */
  async fork(
    agentId: string,
    variantRef: string,
    body: ForkPromptVariantBody
  ): Promise<PromptVariant> {
    return this.http.request<PromptVariant>(
      "POST",
      `/agents/${agentId}/prompt-variants/${encodeURIComponent(variantRef)}/fork`,
      { body }
    );
  }

  /**
   * Copy the variant's tip into a NEW version appended to Main.
   *
   * @param body - `{ publish: true }` also makes it the production prompt.
   * @returns The new Main version's coordinates — the variant is untouched.
   */
  async promote(
    agentId: string,
    variantRef: string,
    body?: PromotePromptVariantBody
  ): Promise<PromotePromptVariantResult> {
    return this.http.request<PromotePromptVariantResult>(
      "POST",
      `/agents/${agentId}/prompt-variants/${encodeURIComponent(variantRef)}/promote`,
      { body: body ?? {} }
    );
  }

  /**
   * Append a version (markdown prompt) to the variant's tip. Refused on an
   * archived variant. Never publishes — see the class docblock.
   */
  async saveVersion(
    agentId: string,
    variantRef: string,
    body: SavePromptVariantVersionBody
  ): Promise<PromptVariantVersion> {
    return this.http.request<PromptVariantVersion>(
      "POST",
      `/agents/${agentId}/prompt-variants/${encodeURIComponent(variantRef)}/versions`,
      { body }
    );
  }

  /** The variant's versions, ascending by ordinal — the last element is the tip. */
  async listVersions(agentId: string, variantRef: string): Promise<PromptVariantVersion[]> {
    return this.http.request<PromptVariantVersion[]>(
      "GET",
      `/agents/${agentId}/prompt-variants/${encodeURIComponent(variantRef)}/versions`
    );
  }

  /** Every version as a node, fork and promote edges between them. */
  async graph(agentId: string): Promise<PromptGraph> {
    return this.http.request<PromptGraph>("GET", `/agents/${agentId}/prompt-graph`);
  }

  /**
   * Server-side line diff between two refs. Identical content answers
   * `changes: []` — that emptiness is the "fork copies exactly" proof.
   */
  async compare(agentId: string, params: ComparePromptParams): Promise<ComparePromptResult> {
    return this.http.request<ComparePromptResult>("GET", `/agents/${agentId}/prompt-compare`, {
      query: { a: params.a, b: params.b }
    });
  }
}
