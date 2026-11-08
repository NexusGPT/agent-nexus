import type { ChatStreamProviderMetadata } from "./chat";

/**
 * The transcript read of the browser chat surface —
 * `GET /public/v1/deployments/:deploymentId/chat/messages`, reached by
 * `ChatResource.history`.
 *
 * Its own module because the contract keeps it in its own module
 * (`chat-history.schemas.ts`): what a reload RESTORES is a projection of the
 * stored conversation, and what `./chat.ts` holds is what a live turn STREAMS.
 * The parts are the same parts, so a restored message and the same message
 * received live render alike; the shapes around them are not.
 */

/**
 * Which page of the transcript {@link ChatResource.history} reads.
 *
 * 🔴 THE CONVERSATION IS NOT IN IT AND CANNOT BE. It is the session token's own
 * `chatId` claim — the same reason it is absent from `StopChatTurnBody`.
 */
export interface ChatHistoryQuery {
  /**
   * Return the messages OLDER than this message id. Omitted: the newest page.
   *
   * To walk backwards, pass the FIRST message id of the page you already hold —
   * a page is oldest-first, so its first message is the oldest one you have.
   */
  before?: string;
  /** How many messages, 1-50. Omitted: the server's default of 20. */
  limit?: number;
}

/**
 * One renderable part of a transcript message — the SAME part a live turn
 * leaves on a message, in the AI SDK `UIMessage` part shape.
 *
 * Each `data-nexus-*` arm's `data` is exactly what the matching live
 * `data-nexus-*` `ChatStreamChunk` carries, so a renderer written for the
 * live frame renders the restored part unchanged.
 *
 * ⚠️ **What a live turn streams and this does NOT carry:** `tool-*` parts (a
 * tool's input and raw output are the model's working memory; a card it sent
 * arrives as its card part), `source-url` / `source-document` (stored nowhere),
 * `reasoning` (never stored for a visitor), and every transient frame.
 *
 * A hand-written mirror of the contract's `ChatHistoryPartSchema`, tied to it by
 * `v1-response-types-match-the-contract.test.ts` through `client.chat.history()`.
 */
export type ChatHistoryPart =
  | {
      /** The message's prose, markdown. */
      type: "text";
      text: string;
    }
  | {
      /**
       * An attachment: an image or a file the message carried.
       *
       * Read the name from `providerMetadata.nexus.filename` — the spelling the
       * live `file` frame uses. `filename` is set as well on a file stored as the
       * message's own attachment, and predates `providerMetadata` here.
       */
      type: "file";
      url: string;
      mediaType: string;
      filename?: string;
      providerMetadata?: ChatStreamProviderMetadata;
    }
  | {
      /** A rendered HTML card — quick-reply buttons, a stored HTML template. */
      type: "data-nexus-html-template";
      /** The card's own message id. */
      id: string;
      data: { messageId: string; html: string; text: string };
    }
  | {
      /**
       * Code-interpreter blocks. A `text` block carries `content: ""` and
       * `streamedAsText: true`, exactly as on the live frame: the prose is the
       * message's `text` part, so render both and the answer still shows once.
       * `blocks` is opaque on purpose — the block union is not published.
       */
      type: "data-nexus-code-block";
      id: string;
      data: { messageId: string; blocks: unknown[] };
    }
  | {
      /** Why the turn failed — what the live `data-nexus-error` frame carried. */
      type: "data-nexus-error";
      data: {
        code: string;
        message: string;
        category?: string;
        action?: string;
        retryAfterMs?: number;
        correlationId?: string;
        docUrl?: string;
      };
    };

/**
 * One message of a transcript, as a visitor's client renders it.
 *
 * A deliberately narrow PROJECTION of the stored row: tool calls, the model's
 * reasoning, delivery status and the operator who wrote a human reply are not
 * the visitor's and never appear. Render `parts`; `text` is the message as one
 * plain string for a client that does not render parts.
 */
export interface ChatHistoryMessage {
  id: string;
  /** `user` for the visitor's own message; `assistant` for everything from the agent's side. */
  role: "user" | "assistant";
  /** The message as one plain string, markdown. A card's text fallback; `""` when it has none. */
  text: string;
  /** What to render, in order: prose, then attachments, then cards, code blocks and an error. */
  parts: ChatHistoryPart[];
  createdAt: string;
}

/** One page of the transcript, as {@link ChatResource.history} hands it back. */
export interface ChatHistoryPage {
  /** OLDEST first within the page, so a client appends a page as it reads it. */
  messages: ChatHistoryMessage[];
  /**
   * `true` when older messages exist. Pass the FIRST message's id as
   * {@link ChatHistoryQuery.before} to fetch them. Never `true` over an empty
   * page.
   */
  hasMore: boolean;
}
