import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { HTML_MESSAGE_TEMPLATE_LIST_CONTRACT } from "../html-template.contract.generated";

/** `nexus html-template list` */
export function registerHtmlMessageTemplateListCommand(tpl: Command, program: Command): void {
  const list = tpl
    .command("list")
    .description("List HTML message templates")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .option("--deployment-id <id>", "Filter by EMBED deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template list
  $ nexus html-template list --deployment-id 11111111-1111-4111-8111-111111111111
  $ nexus html-template list --search "order" --limit 10 --json

Notes:
  THE HTML ITSELF IS NOT IN THIS LISTING. The columns are id, name, deployment,
  description and creation time; read the markup with "html-template get <id>".
  --deployment-id FILTERS, it does not scope. Omit it and you see every template
  in the organization across all deployments, which is why the DEPLOYMENT column
  is shown untruncated.
  Only an EMBED deployment id is meaningful here — these templates render in the
  web widget.
  --search matches the name only, not the description and not the markup.

  THERE IS NO PAGING HERE AND NOTHING REPORTS A TOTAL, so a full page is
  indistinguishable from a truncated one. There is no --page, no --offset and no
  cursor, and --json is {"data":[…]} with NO meta beside it — the route returns
  an items array and nothing else.

  🚨 100 IS BOTH THE DEFAULT AND THE CEILING, so --limit can only ever REDUCE
  what you see. Omitting it takes 100; asking for more than 100 is refused by
  validation. An organization holding more than 100 templates therefore CANNOT
  reach the rest from this command at any spelling, and the 100 rows it returns
  look exactly like a complete list. Narrow with --deployment-id or --search —
  those change WHICH templates are considered, which is the only lever that
  reaches past the cap.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.htmlMessageTemplates.list({
          search: opts.search,
          limit: opts.limit,
          deploymentId: opts.deploymentId
        });
        printList(result.items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "deploymentId", label: "DEPLOYMENT", width: 36 },
          { key: "description", label: "DESCRIPTION", width: 40 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, HTML_MESSAGE_TEMPLATE_LIST_CONTRACT);
}
