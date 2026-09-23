import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope, printList } from "../../output";
import { SKILLS_LIST_EXTERNAL_TOOLS_CONTRACT } from "../external-tool.contract.generated";

const LIST_HELP = `
Examples:
  $ nexus external-tool list
  $ nexus external-tool list --search "weather" --limit 10
  $ nexus external-tool list --json

Notes:
  --json ANSWERS THE ROUTE'S OWN OBJECT: {items, total}. The rows are under
  .items — jq '.data[]' and jq '.[]' both select nothing — and .total is how
  many exist against how many --limit returned. There is no hasMore.
  THERE IS NO --page. --limit caps the answer and nothing walks past it, so a
  --limit below .total hides the rest; raise it, or read .total first.
  THE TABLE IS ID / NAME / DESCRIPTION / CREATED. It carries no auth type, no
  endpointUrl and no actionsCount — read those per tool with
  "nexus external-tool get <id>".`;

/** `nexus external-tool list` */
export function registerExternalToolListCommand(externalTool: Command, program: Command): Command {
  const leaf = externalTool
    .command("list")
    .description("List external tools")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText("after", LIST_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.listExternalTools({
          search: opts.search,
          limit: opts.limit
        });
        // 🚨 THE `printEnvelope` CALL STAYS IN THIS CALLBACK. `envelope-narrowing.scan.ts`
        // reads the exemption LEXICALLY — `insideEnvelopeCallback` walks the AST for an
        // enclosing `printEnvelope(...)` — so moving this render into its own module
        // would report `result.items` as a narrowing over a document it never writes.
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
  bindCommand(leaf, SKILLS_LIST_EXTERNAL_TOOLS_CONTRACT);
  return leaf;
}
