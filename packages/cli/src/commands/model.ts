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
  $ nexus model list --json

Notes:
  TWO KINDS OF ROW COME BACK AND THEY ARE SELECTED DIFFERENTLY. --json carries a
  "source" field: "system" is a platform model, "custom" is an endpoint your
  organization added with "nexus custom-model create".
    source "system" -> modelId goes in --model-name, provider in --model-provider
    source "custom" -> the row's own id goes in --custom-model-id, and NEITHER
                       of its displayed values is an input
  A custom row reads provider "CUSTOM_<PROTOCOL>" — CUSTOM_OPENAI,
  CUSTOM_ANTHROPIC or CUSTOM_GOOGLE, projected from the endpoint's protocol —
  and modelId "custom:<uuid>". None of those is a member of --model-provider,
  sending one is a 400, and "custom:<uuid>" resolves to no model name. That is
  not a typo on your side: those two strings say where the row came from, and
  the id is what selects it.
  THIS COMMAND HIDES A DISABLED CUSTOM MODEL. The merge filters on enabled, so
  an endpoint you switched off is absent here and still present, still
  attachable, in "nexus custom-model list". Read that command for the full set
  and for the ids.`
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
