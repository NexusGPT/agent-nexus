import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope } from "../../output";
import { PROMPT_COMPARE_CONTRACT } from "../prompt.contract.generated";

/** `nexus prompt compare` */
export function registerPromptCompareCommand(prompt: Command, program: Command): void {
  const compare = prompt
    .command("compare")
    .description("Server-side line diff between two refs")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--a <ref>", 'First ref: version id, variant name (its tip), or "main"')
    .requiredOption("--b <ref>", 'Second ref: version id, variant name (its tip), or "main"')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt compare --agent-id 11111111-1111-4111-8111-111111111111 --a main --b "Concise"
  $ nexus prompt compare --agent-id 11111111-1111-4111-8111-111111111111 \\
      --a 22222222-2222-4222-8222-222222222222 --b main --json

Notes:
  A VARIANT NAME MEANS ITS TIP; "main" means the Main tip; a bare version id
  means that exact version — so any point in history diffs against any other.
  Names win over ids when a ref could be both.
  AN EMPTY "changes" ARRAY MEANS IDENTICAL TEXT — right after a fork it is
  the proof the copy was exact, not a failure to diff.
  The diff is over the serialized markdown, line by line: "remove" lines count
  positions in --a, "add" lines count positions in --b.`
    )
    .action(async (opts: { agentId: string; a: string; b: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.compare(opts.agentId, {
          a: opts.a,
          b: opts.b
        });
        printEnvelope(result, () => {
          console.log(
            `${color.bold(result.a.variantName)}#${result.a.ordinal} vs ${color.bold(result.b.variantName)}#${result.b.ordinal}`
          );
          if (result.changes.length === 0) {
            console.log("No differences — the two refs hold identical prompt text.");
            return;
          }
          for (const change of result.changes) {
            const sign = change.op === "add" ? "+" : "-";
            console.log(`${sign} [${change.line}] ${change.text}`);
          }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose.
  bindCommand(compare, PROMPT_COMPARE_CONTRACT);
}
