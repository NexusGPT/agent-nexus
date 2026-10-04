import type { ChatSession, SendChatMessageBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, reportFailure } from "../../errors";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { resolveInputValue } from "../../util/stdin";
import { renderTurn } from "./_shared/render-turn";
import type { StreamCursor } from "./_shared/stream-cursor";

/** Everything `nexus chat send` reads off the command line. */
export interface ChatSendOptions {
  message?: string;
  sessionToken?: string;
  chatId?: string;
  externalUserId?: string;
  identityHash?: string;
  knowledgeId?: string[];
  image?: string[];
  body?: string;
}

/** The `nexus chat send` action — mint, then stream with the TOKEN. */
export async function runChatSend(
  program: Command,
  deploymentId: string,
  opts: ChatSendOptions
): Promise<void> {
  try {
    const client = createClient(program.optsWithGlobals());
    const base = await resolveBody(opts.body);
    const content =
      typeof opts.message === "string" ? await resolveInputValue(opts.message) : undefined;

    const body = asRequestBody<SendChatMessageBody>(
      mergeBodyWithFlags(base, {
        content,
        knowledgeIds: opts.knowledgeId,
        images: opts.image
      })
    );

    // A supplied token is a session this command did not mint, so its
    // conversation and expiry are not ours to report. The placeholders are
    // labelled rather than invented: printing a chatId we never received
    // would be a value a script could believe.
    const session: ChatSession =
      typeof opts.sessionToken === "string"
        ? {
            token: opts.sessionToken,
            sessionId: "(supplied)",
            chatId: "(supplied)",
            expiresInSeconds: 0
          }
        : await client.chat.createSession(deploymentId, {
            chatId: opts.chatId,
            externalUserId: opts.externalUserId,
            identityHash: opts.identityHash
          });

    const cursor: StreamCursor = { lastEventId: null };
    const failure = await renderTurn(
      session,
      client.chat.stream(
        deploymentId,
        body,
        { token: session.token },
        {
          onEventId: (eventId) => {
            cursor.lastEventId = eventId;
          }
        }
      ),
      cursor
    );
    if (failure !== null) {
      // `reportFailure`, never `console.error` + a hand-set code: it is the
      // funnel that puts an error DOCUMENT on stdout under `--json`, and it
      // decides the exit code from the cause rather than inventing one.
      process.exitCode = reportFailure(
        "remote-error",
        failure.message,
        "The stream opened and the turn itself failed. Read the frames with --json."
      );
    }
  } catch (err) {
    process.exitCode = handleError(err);
  }
}
