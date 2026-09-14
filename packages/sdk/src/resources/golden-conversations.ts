import type {
  AcceptGoldenCandidateBody,
  AddGoldenUserTurnBody,
  CreateGoldenConversationBody,
  DeleteGoldenConversationResult,
  GenerateGoldenCandidateResult,
  GoldenConversation,
  GoldenConversationDetail,
  GoldenTurn,
  ListGoldenConversationsParams,
  SetGoldenCheckpointBody,
  SetGoldenTurnContentBody
} from "../types/golden-conversations";
import { BaseResource } from "./base-resource";

/**
 * GOLDEN CONVERSATIONS — authoring. Accessed via `client.goldenConversations`.
 * Feature-flag gated (PROMPT_EVAL, whitelist): orgs without the flag get 403.
 *
 * ## The authoring loop
 *
 * `create` (optionally naming a variant — its tip becomes the authoring
 * version) → `addUserTurn` → `generate` → `accept` (or `accept` with content =
 * accept-with-edit; or `generate` again to regenerate). Then curate:
 * `setTurnContent`, `setCheckpoint`, and `ready` once at least one checkpoint
 * exists.
 *
 * ## 🔴 `generate` runs the real agent
 *
 * A fresh ephemeral emulator session per call, seeded with the golden prefix;
 * tools execute LIVE, and the call blocks for the full agent turn — budget
 * your HTTP timeout accordingly (a tool-augmented turn can exceed 30s).
 */
export class GoldenConversationsResource extends BaseResource {
  /** Create an empty DRAFT conversation bound to one agent+deployment pair. */
  async create(body: CreateGoldenConversationBody): Promise<GoldenConversation> {
    return this.http.request<GoldenConversation>("POST", "/prompt-eval/golden-conversations", {
      body
    });
  }

  /** The org's golden conversations, newest first. */
  async list(params?: ListGoldenConversationsParams): Promise<GoldenConversation[]> {
    return this.http.request<GoldenConversation[]>("GET", "/prompt-eval/golden-conversations", {
      query: params?.agentId === undefined ? {} : { agentId: params.agentId }
    });
  }

  /** One conversation with its full turn list, ordered by index. */
  async get(conversationId: string): Promise<GoldenConversationDetail> {
    return this.http.request<GoldenConversationDetail>(
      "GET",
      `/prompt-eval/golden-conversations/${encodeURIComponent(conversationId)}`
    );
  }

  /** Hard-delete a conversation; its turns cascade. */
  async delete(conversationId: string): Promise<DeleteGoldenConversationResult> {
    return this.http.request<DeleteGoldenConversationResult>(
      "DELETE",
      `/prompt-eval/golden-conversations/${encodeURIComponent(conversationId)}`
    );
  }

  /** Append a USER turn. Clears any pending candidate (it is stale now). */
  async addUserTurn(conversationId: string, body: AddGoldenUserTurnBody): Promise<GoldenTurn> {
    return this.http.request<GoldenTurn>(
      "POST",
      `/prompt-eval/golden-conversations/${encodeURIComponent(conversationId)}/turns/user`,
      { body }
    );
  }

  /**
   * Replay-then-generate a candidate for the last user message. Calling it
   * again regenerates in a NEW session — no state carries over.
   */
  async generate(conversationId: string): Promise<GenerateGoldenCandidateResult> {
    return this.http.request<GenerateGoldenCandidateResult>(
      "POST",
      `/prompt-eval/golden-conversations/${encodeURIComponent(conversationId)}/generate`
    );
  }

  /**
   * Accept the pending candidate as a golden AGENT turn (checkpoint ON by
   * default). With `content`, your text is stored and the turn flagged edited.
   */
  async accept(conversationId: string, body?: AcceptGoldenCandidateBody): Promise<GoldenTurn> {
    return this.http.request<GoldenTurn>(
      "POST",
      `/prompt-eval/golden-conversations/${encodeURIComponent(conversationId)}/accept`,
      body === undefined || body.content === undefined ? {} : { body }
    );
  }

  /** Replace an existing AGENT turn's golden content (flags it edited). */
  async setTurnContent(
    conversationId: string,
    index: number,
    body: SetGoldenTurnContentBody
  ): Promise<GoldenTurn> {
    return this.http.request<GoldenTurn>(
      "PUT",
      `/prompt-eval/golden-conversations/${encodeURIComponent(conversationId)}/turns/${index}/content`,
      { body }
    );
  }

  /** Toggle an AGENT turn's checkpoint flag; optionally attach criteria. */
  async setCheckpoint(
    conversationId: string,
    index: number,
    body: SetGoldenCheckpointBody
  ): Promise<GoldenTurn> {
    return this.http.request<GoldenTurn>(
      "PUT",
      `/prompt-eval/golden-conversations/${encodeURIComponent(conversationId)}/turns/${index}/checkpoint`,
      { body }
    );
  }

  /** DRAFT → READY. Requires at least one checkpoint. */
  async ready(conversationId: string): Promise<GoldenConversation> {
    return this.http.request<GoldenConversation>(
      "POST",
      `/prompt-eval/golden-conversations/${encodeURIComponent(conversationId)}/ready`
    );
  }
}
