import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList } from "../output";

export function registerModelCommands(program: Command): void {
  const model = program.command("model").description("Manage AI models");

  // ── list ────────────────────────────────────────────────────────────────
  model
    .command("list")
    .description("List available AI models")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus model list
  $ nexus model list --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { models } = await client.models.list();

        // Keys must match `ModelSummary`: it declares `displayName` and
        // `contextSize`, never `name` or `contextWindow`. `Column.key` is a
        // bare `string`, so a wrong key is not a type error — it renders an
        // empty cell forever. These two were blank in every table run.
        printList(models, undefined, [
          { key: "displayName", label: "NAME", width: 30 },
          { key: "provider", label: "PROVIDER", width: 20 },
          { key: "id", label: "ID", width: 36 },
          { key: "contextSize", label: "CONTEXT", width: 12 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
