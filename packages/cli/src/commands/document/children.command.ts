import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import { DOCUMENT_LIST_CHILDREN_CONTRACT } from "../document.contract.generated";

const CHILDREN_HELP = `
Examples:
  $ nexus document children 11111111-1111-4111-8111-111111111111
  $ nexus document children 11111111-1111-4111-8111-111111111111 --limit 20 --json

Notes:
  THESE IDS ARE WHAT CARRY CONTENT. "collection attach-documents" accepts the
  folder id too — it expands to every document under the folder (recursively)
  at attach time. Use this list to attach a subset, or to see what a folder
  attach will expand to.

  ONE LEVEL ONLY. A nested folder appears as a row here, not as its contents —
  recurse if the tree is deeper than one level.

  THE FIRST PAGE IS 20 ROWS, AND A 100-CHILD CRAWL LOOKS COMPLETE AT 20. This
  is paginated with the same defaults as every v1 list — page 1, limit 20, and
  100 is the ceiling a larger --limit is refused against. Read meta before you
  act on the rows: --json carries {total, page, limit, totalPages, paging}, and
  paging is what separates "that is the folder" from "that is the first fifth
  of it". Attaching what you got here without walking the pages attaches a
  fraction of the crawl and nothing says so.

  THE NAME COLUMN IS BLANK FOR A CRAWLED HOME PAGE, AND THAT IS NOT AN ERROR. A
  crawled page is named after the LAST PATH SEGMENT of its URL, so
  /guides/setup is named "setup" and a bare domain root has nothing to take a
  name from. --json carries displayName beside it, which holds the page title —
  that is the field to read when NAME is empty or when two pages share a
  segment. Neither view returns the page's URL.

  A crawl or import in flight returns a growing list. Zero children on a folder
  that reports READY means the import fetched nothing.`;

/** `nexus document children` */
export function registerDocumentChildrenCommand(document: Command, program: Command): Command {
  const leaf = addPaginationOptions(
    document
      .command("children")
      .description("List child documents in a folder")
      .argument("<id>", "Folder document ID")
      .addHelpText("after", CHILDREN_HELP)
  ).action(async (id: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.documents.listChildren(id, getPaginationParams(opts));
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
  bindCommand(leaf, DOCUMENT_LIST_CHILDREN_CONTRACT);
  return leaf;
}
