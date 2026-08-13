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

        // `GET /models` returns a FLAT ARRAY. This read used to be
        // `const { models } = ...` against an SDK signature that claimed a
        // `{ models }` wrapper the route stopped sending — so `models` was
        // undefined, `--json` printed `{}` and the table threw on
        // `undefined.length`. The SDK signature is the fix; this line just
        // follows it, and now a wrong read here is a compile error.
        const models = await client.models.list();

        // Keys must match `ModelSummary`: it declares `displayName` and
        // `contextSize`, never `name` or `contextWindow`. `ColumnKey<T>` checks
        // them against the row type, so a wrong key no longer renders an empty
        // column forever — it fails the typecheck.
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
