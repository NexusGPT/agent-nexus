import type { SendEmulatorMessageBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { streamTurn } from "./send.stream-turn";

const SEND_HELP = `
Examples:
  $ nexus emulator send 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --text "Hello, agent!"
  $ nexus emulator send 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --text "Hello" --stream
  $ nexus emulator send 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --body '{"content":"Hi","participantId":"participant_2"}'
  $ nexus emulator send 44444444-4444-4444-8444-444444444444 33333333-3333-4333-8333-333333333333 --text "Test" --json

Notes:
  --stream IS THE EXCEPTION TO EVERYTHING BELOW. It holds the connection open
  and prints the turn as it happens — the agent's text arrives token by token,
  reasoning and tool calls are shown as they run, and the stream ends with the
  final status. There is no "processing" handoff and no second call: the reply
  IS the output. Under --json it prints one document, {"events":[...]}, holding
  every frame in order. Everything below describes the DEFAULT (buffered) send.

  THE REPLY IS NEVER IN THIS RESPONSE, ON ANY STATUS. Even on "completed" the
  payload is chatId, messageId, sessionId, status and debug — no text. Reading
  the agent's answer is always a second call:
  "nexus emulator session get <deployment-id> <session-id>". Treat "session get"
  as step two of every send, not as a fallback for a slow turn.

  READ "status". IT IS THE ONLY COMPLETION SIGNAL and it has three values:
  "completed" — the turn finished and "debug" is present; "failed" — the agent
  errored, and the 2xx says nothing about it; "processing" — THE AGENT IS STILL
  RUNNING and the turn has not settled.

  "processing" is not an error and not a timeout you should retry. The call
  waits up to 25 seconds and then answers so the connection is not held open;
  the turn continues server-side and its reply is written to the session.
  Poll "nexus emulator session get <deployment-id> <session-id>" for it.
  RE-SENDING ON "processing" DOES NOT CANCEL ANYTHING — it starts a second
  turn, and the agent answers both.

  There is no "debug" input field. Debug information is collected
  automatically and returned whenever the turn settles inside the wait, so it
  is present on "completed" and absent on "processing".
  DEBUG CARRIES NO PROMPT AND NO REPLY — it is agentId, modelUsed, tokensUsed,
  latencyMs, toolsInvoked and the run ids. toolsInvoked is real and is the
  useful part; there is no way to read the prompt that was sent from here.
  DO NOT BILL FROM debug.tokensUsed. It is summed from token-usage rows that
  are written asynchronously, so a turn that settles first reports {input: 0,
  output: 0, total: 0} beside a real latency and a real reply. Zero here means
  "not recorded yet", never "free" — use "nexus tracing" for token numbers.

  The deployment must be ACTIVE and have an agent, or this is a 400 — that is
  the difference from "session create", which only needs the deployment to
  exist. participantId is the server-assigned "participant_N" from
  "session create"; anything else is a 400 listing the valid ids. Omit it and
  the first participant speaks.
  content is required, 1 to 100,000 characters. --text is the same field.
  This runs the real agent: real tools, real side effects, real cost.
  Save the session as a scenario afterwards for regression testing:
  nexus emulator scenario save`;

/** `nexus emulator send` — reaches a route the v1 contract does not declare. */
export function registerEmulatorSendCommand(emulator: Command, program: Command): Command {
  const leaf = emulator
    .command("send")
    .description("Send a message in an emulator session")
    .argument("<deployment-id>", "Deployment ID")
    .argument("<session-id>", "Session ID")
    .option("--text <message>", "Message text")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .option(
      "--stream",
      "Stream the turn as it happens (SSE): tokens, reasoning, tool calls, then the final message"
    )
    .addHelpText("after", SEND_HELP)
    .action(async (deploymentId: string, sessionId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          content: opts.text
        });

        if (opts.stream) {
          await streamTurn(
            client.emulator.streamMessage(
              deploymentId,
              sessionId,
              asRequestBody<SendEmulatorMessageBody>(body)
            )
          );
          return;
        }

        const result = await client.emulator.sendMessage(
          deploymentId,
          sessionId,
          asRequestBody<SendEmulatorMessageBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  return leaf;
}
