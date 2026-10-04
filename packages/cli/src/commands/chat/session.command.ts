import type { CreateChatSessionBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

/** `nexus chat session` — hop one on its own. */
export function registerChatSessionCommand(chat: Command, program: Command): Command {
  return chat
    .command("session")
    .description("Mint a chat-session token a browser may hold")
    .argument("<deployment-id>", "Deployment ID (must be an EMBED or API channel)")
    .option("--chat-id <uuid>", "Resume an existing conversation instead of starting a new one")
    .option("--external-user-id <id>", "Your own id for this visitor")
    .option(
      "--identity-hash <hex>",
      "HMAC-SHA256 of --external-user-id under the deployment's embed identity secret"
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus chat session 44444444-4444-4444-8444-444444444444
  $ nexus chat session 44444444-4444-4444-8444-444444444444 --chat-id 33333333-3333-4333-8333-333333333333
  $ nexus chat session 44444444-4444-4444-8444-444444444444 --external-user-id user-42 --identity-hash a1b2... --json

Notes:
  THE TOKEN IS THE CREDENTIAL A BROWSER HOLDS. Print it, hand it to your web
  app, and let the browser stream with it. Your organization API key must never
  reach a browser; that is the entire reason this route exists.
  WITH NO --chat-id THIS WRITES NOTHING. The conversation id in the response is
  RESERVED, and the conversation row is created by the first message. So minting
  a token you never use costs nothing and leaves no record.
  THE DEPLOYMENT MUST BE AN "EMBED" OR "API" CHANNEL. Any other type is refused.
  A 503 means the environment has no chat-session signing secret configured. It
  is not a bad request and retrying will not clear it.
  --chat-id must name a conversation belonging to THIS organization AND THIS
  deployment. Anything else is a 404 — the same answer an id that does not exist
  gets, deliberately, so the refusal is no existence oracle.
  expiresInSeconds is the bearer lifetime. Treat ANY 401 from "chat send" as
  "this credential is finished" and mint a new one.`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          chatId: opts.chatId,
          externalUserId: opts.externalUserId,
          identityHash: opts.identityHash
        });

        const session = await client.chat.createSession(
          deploymentId,
          asRequestBody<CreateChatSessionBody>(body)
        );
        printRecord(session);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
