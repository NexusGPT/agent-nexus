import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope, printList } from "../../output";
import { SKILLS_LIST_DOCUMENT_TEMPLATES_CONTRACT } from "../template.contract.generated";

/** `nexus template list` */
export function registerTemplateListCommand(template: Command, program: Command): void {
  const list = template
    .command("list")
    .description("List document templates")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template list
  $ nexus template list --search "invoice" --limit 10
  $ nexus template list --json

Notes:
  --json ANSWERS THE ROUTE'S OWN OBJECT: {items, total}. The rows are under
  .items, and .total is how many exist against how many --limit returned.
  THE TABLE HIDES type AND status; --json carries both. Neither view carries the
  template's VARIABLES, and neither does "template get" — nothing in this API
  ever writes that list. Read the placeholder names out of the file you
  uploaded; "nexus template get <id> --help" has the mechanism.

  A template with no file uploaded lists here exactly like a finished one, and
  status does not separate them — every template reachable through this API is
  DRAFT, uploaded or not. Read fileUrl on "template get <id>" instead: null means
  no file.
  NAMES ARE NOT UNIQUE. Two templates with the same name are two rows with
  different ids, so address them by id — including when deleting one, where
  picking by name means picking by luck — and expect duplicates in this list.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.listDocumentTemplates({
          search: opts.search,
          limit: opts.limit
        });

        printEnvelope(result, () => {
          printList(result.items, undefined, [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 30 },
            { key: "description", label: "DESCRIPTION", width: 40 },
            { key: "createdAt", label: "CREATED", width: 26 }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, SKILLS_LIST_DOCUMENT_TEMPLATES_CONTRACT);
}
