import type { ChatSession, ChatStreamChunk } from "@agent-nexus/sdk";

import { color, emitDocument, isJsonMode } from "../../../output";
import { renderTurnChunk } from "./render-turn-chunk";
import type { StreamCursor } from "./stream-cursor";
import { applyChunkFailure, createTurnLineWriter, type TurnFailure } from "./turn-line-writer";

/**
 * Renders a live turn.
 *
 * Two output modes, and the split is the root epilogue's promise rather than a
 * preference: `--json` must print ONE document on stdout, so the frames are
 * collected and emitted when the turn ends. Without it the point is to WATCH, so
 * text deltas go out as they arrive and everything else is a labelled line
 * around them.
 *
 * `process.stdout.write`, not `console.log`, for the deltas: a delta is a
 * fragment of a sentence and a newline per fragment would print the answer one
 * word per line.
 *
 * @returns what went wrong, or `null` when the turn finished normally. The
 * CALLER reports it: a failure has to reach `reportFailure`, which is the one
 * funnel that emits an error document instead of prose on stderr, and a helper
 * that both printed the prose AND set the exit code would be the exact shape
 * `json-error-document.static-scan` exists to refuse.
 *
 * @param cursor - filled by the SDK as frames arrive, read here once the turn
 *   ends. A box rather than a return value because the caller has to hand the
 *   same sink to `chat.stream` before this function is called.
 */
export async function renderTurn(
  session: ChatSession,
  chunks: AsyncIterable<ChatStreamChunk>,
  cursor: StreamCursor
): Promise<TurnFailure | null> {
  const collected: ChatStreamChunk[] = [];
  const json = isJsonMode();
  let failure: TurnFailure | null = null;
  const writer = createTurnLineWriter();

  if (!json) {
    console.log(color.dim(`conversation ${session.chatId} · session ${session.sessionId}`));
  }

  for await (const chunk of chunks) {
    if (json) {
      collected.push(chunk);
      // The failure arms still have to be RECORDED, even when nothing is
      // printed as it happens — a turn that errored must not exit 0 under
      // --json just because the document was emitted successfully.
      failure = applyChunkFailure(failure, chunk);
      continue;
    }

    renderTurnChunk(chunk, writer);
    failure = applyChunkFailure(failure, chunk);
  }

  writer.closeLine();

  if (json) {
    emitDocument({
      session: {
        chatId: session.chatId,
        sessionId: session.sessionId,
        expiresInSeconds: session.expiresInSeconds
      },
      // The cursor of the last frame RECEIVED HERE — never what the server has
      // recorded since. That distinction is the whole of "resume": reattaching
      // from a position ahead of what you rendered drops the text in between.
      lastEventId: cursor.lastEventId,
      chunks: collected
    });
  } else if (cursor.lastEventId !== null) {
    console.log(color.dim(`last-event-id ${cursor.lastEventId}`));
  }

  return failure;
}
