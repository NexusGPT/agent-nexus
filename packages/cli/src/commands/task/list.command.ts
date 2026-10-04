import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { formatFolder, printEnvelope, printTable } from "../../output";

/** `nexus task list` — the AI tasks this organization holds. */
export function registerTaskListCommand(task: Command, program: Command): void {
  task
    .command("list")
    .description("List AI tasks")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .option("--folder <name|id>", "Filter by folder name or id")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task list
  $ nexus task list --search "summarize" --limit 10
  $ nexus task list --json
  $ nexus task list --folder "Notion"

Notes:
  INPUT and OUTPUT print UPPERCASE ("TEXT", "JSON", "TEMPLATE") because that is
  how they are stored. Writes take the lowercase spellings — see "task create".

  This list carries no prompt and no schemas; "nexus task get <id> --json" does.
  --search matches the NAME only, not the prompt.

  --json ANSWERS THE ROUTE'S OWN OBJECT: {items, total}. "workflow list"
  answers {"data":[…],"meta":{…}}, so one parser still cannot read both — the
  rows are under .items here, and jq '.[]' and jq '.data[]' both select nothing.
  THERE IS NO --page AND NO --offset, only --limit (default 20, max 100). The
  route pages and this command does not, so a result exactly the size of
  --limit means "at least that many" — compare .items|length against .total to
  know whether you have all of them, and raise --limit if you do not.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.listTasks({
          search: opts.search,
          limit: opts.limit,
          folder: opts.folder
        });

        const items = result.items ?? [];
        printEnvelope(result, () => {
          printTable(items, [
            { key: "id", label: "ID", width: 36 },
            { key: "name", label: "NAME", width: 30 },
            { key: "category", label: "CATEGORY", width: 15 },
            { key: "inputFormat", label: "INPUT", width: 10 },
            { key: "outputFormat", label: "OUTPUT", width: 10 },
            { key: "folder", label: "FOLDER", width: 20, format: formatFolder }
          ]);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
