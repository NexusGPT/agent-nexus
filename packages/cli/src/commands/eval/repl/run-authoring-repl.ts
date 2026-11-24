import readline from "node:readline";

import type { Command } from "commander";

import { createClient } from "../../../client";
import { color } from "../../../output";
import { askWouldHang, promptLine, promptStream } from "../../../util/confirm";
import { unseeablePromptRefusal, USER_PROMPT } from "./repl-unseeable-prompt";
import { runCandidateLoop } from "./run-candidate-loop";

/**
 * The interactive loop. Reads stdin line by line (TTY or pipe — T2-12 pipes),
 * and drives exactly the operations the subcommands expose. This half owns the
 * USER turns; `runCandidateLoop` owns one generated candidate.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 ONE REDIRECT WAS ENOUGH TO HANG THIS REPL, BECAUSE THE PROMPT NAMED
 *    `stdout` DIRECTLY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `… > out.log` at a keyboard: stdin was a terminal, so nothing doubted there
 * was an operator, and `nextLine` wrote its prompt to `process.stdout`. The
 * prompt went into the file, the terminal stayed blank, and the process blocked
 * on a keystroke for a question nobody had been shown. ONE ROUTING HALF, not
 * `auth login`'s two: this interface passes no `output` and `terminal: false`,
 * so readline neither echoes keystrokes nor has a stream to echo them to.
 *
 * ── ROUTING THE PROMPT ALONE IS NOT THE FIX. ROUTE THE WHOLE DIALOGUE ───────
 *
 * 🔴 A VISIBLE QUESTION WHOSE PREAMBLE WENT TO THE LOG FILE IS UNANSWERABLE,
 * AND IT PASSES EVERY ARM THAT ASKS WHERE THE QUESTION WENT — `auth login`
 * shipped exactly that, prompt on the terminal and the numbered organization
 * list it refers to in out.log. `promptLine`'s header owns the general rule; the
 * site-specific part is that EVERY write here is classified, not just the ask:
 *
 *   DIALOGUE → prompt stream. Needed in front of the operator to answer, or an
 *   acknowledgement of what they just answered:
 *     the `[d]one`/Ctrl-D legend — the only statement of how to answer at all
 *     `you › `, and `runCandidateLoop`'s action prompt through this `nextLine`
 *     `agent … generating` / `… regenerating` — wait, do not type
 *     `agent › <content>` + `tools:` — what `[a]ccept` accepts. Invisible, and
 *       the accept/reject decision cannot be made at all
 *     `editor unavailable …` and the key legend — replies to a keystroke
 *   RESULT → stdout, which is what a `>` is for:
 *     `Authoring <title> (<id>)` — the ID is the one machine-usable datum and
 *       no prompt refers to it
 *     `No turns accepted …` / `<title> is READY (<id>)` — the outcome
 *
 * ── ROUTE FIRST, THEN GATE — AND GATE BEFORE THE REMOTE WRITE ───────────────
 *
 * Routed, a lone `> out.log` reaches the terminal and the REPL WORKS, which
 * beats a refusal because the operator is right there. 🔴 A GATE WITHOUT THE
 * ROUTING TURNS THAT WORKING SESSION INTO A REFUSAL. So the gate bites only
 * where NO stream can carry a prompt: {@link askWouldHang}, whose own header
 * carries why that is not `!canAsk()` — scripted stdin is a PUBLISHED mode here,
 * and `edit-in-editor.ts` already carries a `!process.stdin.isTTY` fallback
 * written for it.
 *
 * 🚨 AND IT IS ASKED BEFORE `goldenConversations.create`, NOT AT THE PROMPT. As
 * `nextLine`'s first statement it ran after the draft conversation existed, so a
 * refused session LEFT A REMOTE DRAFT BEHIND in the operator's organization and
 * then threw. `repl-unseeable-prompt.ts` owns that measurement; `nextLine` keeps
 * its own copy of the test for `runCandidateLoop`'s prompts, where nothing
 * further is created.
 *
 * ⚠️ `color`'s `NO_COLOR` is `!process.stdout.isTTY` read at module load, so a
 * redirected stdout strips the dimming from dialogue reaching a live stderr.
 * Cosmetic, pre-existing; the text arrives. `run-authoring-repl.test.ts` has
 * the arms, the mutants and the 2,000 ms deadline that names a hang.
 */
export async function runAuthoringRepl(
  program: Command,
  opts: { agentId: string; deploymentId: string; title: string; variant?: string }
): Promise<void> {
  // THE GATE, above every side effect this function has. Header: GATE BEFORE THE
  // REMOTE WRITE.
  if (askWouldHang()) throw unseeablePromptRefusal(USER_PROMPT);

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
  // DIALOGUE: it is the only statement of how to answer `you › ` at all. On
  // stdout it is the `auth login` hole — a visible prompt, invisible preamble.
  promptLine(color.dim("Type a user message; [d]one finishes. Ctrl-D also finishes."));

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines: AsyncIterator<string> = rl[Symbol.asyncIterator]();
  const nextLine = async (prompt: string): Promise<string | null> => {
    // The SECOND gate, narrowed by the routing on the next line, for the prompts
    // `runCandidateLoop` asks. The first one is above, ahead of the remote write.
    if (askWouldHang()) throw unseeablePromptRefusal(prompt);
    promptStream().write(prompt);
    const { value, done } = await lines.next();
    if (done) return null;
    return value;
  };

  try {
    let lastAcceptedIndex: number | null = null;

    for (;;) {
      const line = await nextLine(USER_PROMPT);
      if (line === null) break;
      const text = line.trim();
      if (text === "") continue;
      if (text === "d" || text === "done") break;

      await client.goldenConversations.addUserTurn(conversation.id, { text });
      promptLine(color.dim("agent … generating"));
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
