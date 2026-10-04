import readline from "node:readline";

import type { Command } from "commander";

import { createClient } from "../../../client";
import { color } from "../../../output";
import { runCandidateLoop } from "./run-candidate-loop";

/**
 * The interactive loop. Reads stdin line by line (TTY or pipe — T2-12 pipes),
 * and drives exactly the operations the subcommands expose.
 *
 * This half owns the USER turns; `runCandidateLoop` owns what happens to one
 * agent candidate once it has been generated.
 */
export async function runAuthoringRepl(
  program: Command,
  opts: { agentId: string; deploymentId: string; title: string; variant?: string }
): Promise<void> {
  const client = createClient(program.optsWithGlobals());
  const conversation = await client.goldenConversations.create({
    agentId: opts.agentId,
    deploymentId: opts.deploymentId,
    title: opts.title,
    ...(opts.variant !== undefined ? { variant: opts.variant } : {})
  });
  console.log(
    `Authoring ${color.bold(conversation.title)} (${conversation.id})` +
      (opts.variant !== undefined ? ` on variant "${opts.variant}"` : "")
  );
  console.log(color.dim("Type a user message; [d]one finishes. Ctrl-D also finishes."));

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines: AsyncIterator<string> = rl[Symbol.asyncIterator]();
  const nextLine = async (prompt: string): Promise<string | null> => {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done) return null;
    return value;
  };

  try {
    let lastAcceptedIndex: number | null = null;

    for (;;) {
      const line = await nextLine("you › ");
      if (line === null) break;
      const text = line.trim();
      if (text === "") continue;
      if (text === "d" || text === "done") break;

      await client.goldenConversations.addUserTurn(conversation.id, { text });
      process.stdout.write(color.dim("agent … generating\n"));
      const candidate = (await client.goldenConversations.generate(conversation.id)).candidate;

      const outcome = await runCandidateLoop(client, conversation.id, candidate, nextLine);
      if (outcome.acceptedIndex !== null) lastAcceptedIndex = outcome.acceptedIndex;
      if (outcome.stop) break;
    }

    if (lastAcceptedIndex === null) {
      console.log("No turns accepted — conversation left in DRAFT.");
      return;
    }
    await client.goldenConversations.ready(conversation.id);
    console.log(`${conversation.title} is READY (${conversation.id})`);
  } finally {
    rl.close();
  }
}
