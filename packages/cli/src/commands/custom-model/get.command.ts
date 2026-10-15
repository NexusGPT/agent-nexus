import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { CUSTOM_MODEL_GET_CONTRACT } from "../custom-model.contract.generated";

/** `nexus custom-model get` */
export function registerCustomModelGetCommand(customModel: Command, program: Command): void {
  const get = customModel
    .command("get")
    .description("Get custom model details")
    .argument("<id>", "Custom model ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model get 11111111-1111-4111-8111-111111111111
  $ nexus custom-model get 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE apiKey IS WRITE-ONLY AND NEVER COMES BACK. It is encrypted on write and
  kept in a column no read selects, so get, list, create and update all return
  the same eight fields: id, displayName, modelName, baseUrl, protocol,
  enabled, createdAt and updatedAt. Its absence here is the design and not a
  dropped write — and because no read confirms which key is stored, the way to
  recover from a wrong one is to ROTATE rather than to check:
  "nexus custom-model update <id> --endpoint-key <key>".`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const model = await client.customModels.get(id);
        printRecord(model, [
          { key: "id", label: "ID" },
          { key: "displayName", label: "Display Name" },
          { key: "modelName", label: "Model Name" },
          { key: "baseUrl", label: "Base URL" },
          { key: "protocol", label: "Protocol" },
          { key: "enabled", label: "Enabled", format: (v) => (v ? "yes" : "no") },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(get, CUSTOM_MODEL_GET_CONTRACT);
}
