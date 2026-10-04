import { type Command } from "commander";

import { registerEvalConvCommands } from "./eval/conv/conv.commands";
import { registerEvalRunCommands } from "./eval-run";

/**
 * `nexus eval` — golden conversations (Prompt Lab phase 2).
 *
 * ## The authoring loop, in one paragraph
 *
 * You play the end user; the agent answers. `conv create` binds a conversation
 * to one agent+deployment (optionally on a **variant** — its tip prompt is
 * what generation runs under). Then `add-user` → `generate` → `accept` until
 * the dialogue is the reference you want; every accepted agent turn is a
 * **checkpoint** (a per-message test case) unless you toggle it off. `ready`
 * closes authoring: only READY conversations enter eval runs (phase 3).
 *
 * ## 🔴 `generate` RUNS THE REAL AGENT, TOOLS INCLUDED
 *
 * Each generate opens a FRESH ephemeral emulator session, replays the golden
 * prefix into it, and sends the last user message live. Tools execute for
 * real, spend real money, and the reply lands as the conversation's single
 * pending candidate — generate again and the old candidate is replaced.
 *
 * ## `conv new` is sugar, not a second system
 *
 * The interactive REPL drives exactly the subcommands above, one per
 * keystroke. Anything the REPL can do, a script can do without it. It lives in
 * `eval/repl/`, because it is a loop rather than a command.
 */
export function registerEvalCommands(program: Command): void {
  const evalCmd = program
    .command("eval")
    .description("Golden conversations: author reference dialogues for prompt evaluation");

  const conv = evalCmd.command("conv").description("Author and manage golden conversations");

  // `eval run` lives in its own file: the matrix renderer and the flag
  // grammar are substantial enough that keeping them here would bury the
  // authoring loop this file is about.
  registerEvalRunCommands(evalCmd, program);

  registerEvalConvCommands(conv, program);
}
