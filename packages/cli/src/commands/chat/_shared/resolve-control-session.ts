import type { ChatSession, NexusClient } from "@agent-nexus/sdk";

/**
 * A session for a control verb — supplied, or minted for a NAMED conversation.
 *
 * @returns `null` when neither was given. The CALLER refuses, for the same
 * reason `renderTurn` returns its failure: `refuse` has to appear in the action
 * itself, where `json-error-document.static-scan` can see the exit code and the
 * document emitted together. A helper that returned an already-emitted code
 * hides the emitter from the one check that reads for it.
 */
export async function resolveControlSession(
  client: NexusClient,
  deploymentId: string,
  opts: { sessionToken?: string; chatId?: string }
): Promise<ChatSession | null> {
  if (typeof opts.sessionToken === "string") {
    // A supplied token is a session this command did not mint, so its
    // conversation and expiry are not ours to report. The placeholders are
    // labelled rather than invented.
    return {
      token: opts.sessionToken,
      sessionId: "(supplied)",
      chatId: "(supplied)",
      expiresInSeconds: 0
    };
  }

  if (typeof opts.chatId !== "string") return null;

  return client.chat.createSession(deploymentId, { chatId: opts.chatId });
}
