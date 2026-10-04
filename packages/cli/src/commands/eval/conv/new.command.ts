import type { Command } from "commander";

import { handleError } from "../../../errors";
import { runAuthoringRepl } from "../repl/run-authoring-repl";

/** `nexus eval conv new` — the interactive REPL. Binds no contract: it is sugar. */
export function registerEvalConvNewCommand(conv: Command, program: Command): Command {
  const leaf = conv
    .command("new")
    .description("Author a conversation interactively (a thin wrapper over the subcommands)")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--deployment-id <id>", "Deployment ID")
    .requiredOption("--title <title>", "Conversation title")
    .option("--variant <ref>", 'Author on this prompt variant (name, id, or "main")')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus eval conv new --agent-id 11111111-1111-4111-8111-111111111111 \\
      --deployment-id 22222222-2222-4222-8222-222222222222 --title "refund flow"

Notes:
  THE REPL IS SUGAR over conv create/add-user/generate/accept/checkpoint/
  ready — every keystroke maps to one subcommand, so anything it does a
  script can do without it.
  You type a user message; the agent generates; then one key decides:
  [a]ccept, [e]dit (opens $EDITOR), [r]egenerate, [c]heckpoint toggle for
  this turn, [d]one (marks READY when a checkpoint exists).
  SCRIPTED STDIN WORKS: pipe lines in the same order you would type them —
  "[user text]\\na\\nd\\n" authors one turn and finishes.`
    )
    .action(
      async (opts: { agentId: string; deploymentId: string; title: string; variant?: string }) => {
        try {
          await runAuthoringRepl(program, opts);
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  return leaf;
}
