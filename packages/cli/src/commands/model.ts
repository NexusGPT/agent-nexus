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
        const result = await client.models.list();
        const items = Array.isArray(result) ? result : ((result as any).data ?? result);

        printList(items as unknown as Record<string, unknown>[], undefined, [
          { key: "name", label: "NAME", width: 30 },
          { key: "provider", label: "PROVIDER", width: 20 },
          { key: "id", label: "ID", width: 36 },
          { key: "contextWindow", label: "CONTEXT", width: 12 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
