import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import {
  DOCUMENT_LIST__PARAMS_STATUS,
  DOCUMENT_LIST__PARAMS_TYPE,
  DOCUMENT_LIST_CONTRACT
} from "../document.contract.generated";

const LIST_HELP = `
Examples:
  $ nexus document list
  $ nexus document list --search "report" --limit 10
  $ nexus document list --status READY --json

Poll an import to completion by watching for READY (terminal success) or ERROR.
There is no COMPLETED or PROCESSED status — both are rejected, and a loop that
waits for one can only ever exit by timing out.

Notes:
  THIS IS A FLAT LIST OF THE WHOLE KNOWLEDGE BASE, folders and their children
  alike, not a tree. --type FOLDER or WEBSITE_FOLDER isolates the containers;
  "nexus document children <id>" walks into one.

  IT DOES NOT SAY WHICH COLLECTION A DOCUMENT IS IN. That direction only goes
  the other way, through "nexus collection documents <collection-id>".

  Deleted documents never appear here, so a document that vanishes from this
  list was deleted, not merely unlinked from a collection.`;

/** `nexus document list` */
export function registerDocumentListCommand(document: Command, program: Command): Command {
  const leaf = addPaginationOptions(
    document
      .command("list")
      .description("List documents")
      .option("--search <query>", "Search by name")
      .addOption(enumOption("--type <type>", "Filter by type", DOCUMENT_LIST__PARAMS_TYPE))
      .addOption(
        enumOption(
          "--status <status>",
          "Filter by status — READY is terminal success",
          DOCUMENT_LIST__PARAMS_STATUS
        )
      )
      .addHelpText("after", LIST_HELP)
  );

  leaf.action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.documents.list({
        ...getPaginationParams(opts),
        search: opts.search,
        type: opts.type,
        status: opts.status
      });

      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 30 },
        { key: "type", label: "TYPE", width: 12 },
        { key: "status", label: "STATUS", width: 12 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });
  bindCommand(leaf, DOCUMENT_LIST_CONTRACT);
  return leaf;
}
