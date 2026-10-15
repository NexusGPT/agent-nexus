import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/**
 * `nexus custom-model list`
 *
 * NO `bindCommand` CALL, AND THAT IS DELIBERATE RATHER THAN MISSING:
 * `CustomModelList` carries no input schema at all, so there is nothing to bind
 * and nothing to print. Every other verb in this namespace is bound.
 */
export function registerCustomModelListCommand(customModel: Command, program: Command): void {
  customModel
    .command("list")
    .description("List custom models")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus custom-model list
  $ nexus custom-model list --json

Notes:
  THIS COMMAND SEES A DISABLED MODEL AND "nexus model list" DOES NOT. The merge
  behind that command filters on enabled, so an endpoint you switched off is
  absent there and still here. This listing is the only complete one.

  IT RETURNS EVERY ROW, NEWEST FIRST. The route reads the whole organization in
  one array ordered by creation time — there is no filter, no --page and no
  --limit, so slice it downstream or not at all.

  THE TABLE SHOWS 5 OF 8 FIELDS. A row carries id, displayName, modelName,
  baseUrl, protocol, enabled, createdAt and updatedAt; baseUrl and the two
  timestamps are under --json only. No read anywhere returns the apiKey — see
  "nexus custom-model get".

  THE ID COLUMN IS WHAT MAKES A MODEL SELECTABLE, through --custom-model-id on
  "nexus agent create", "nexus agent update", "nexus task create" and
  "nexus task update". Searching "nexus model list" for your modelName instead
  finds nothing and proves nothing: that table has no modelName column, and the
  row it does print carries provider "CUSTOM_<PROTOCOL>" and modelId
  "custom:<uuid>", neither of which any command accepts as an input.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.customModels.list();
        const items = result;

        printList(items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "displayName", label: "NAME", width: 25 },
          { key: "modelName", label: "MODEL", width: 25 },
          { key: "protocol", label: "PROTOCOL", width: 10 },
          {
            key: "enabled",
            label: "ENABLED",
            width: 8,
            format: (v) => (v ? "yes" : "no")
          }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
