import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";

/** `nexus workflow node-types` */
export function registerWorkflowNodeTypesCommand(workflow: Command, program: Command): void {
  workflow
    .command("node-types")
    .description("List available node types")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node-types
  $ nexus workflow node-types --json

Notes:
  THE AUTHORITATIVE LIST for "node create --type" and for a batch node's "type".
  Names are camelCase and specific — aiTask, branching, loop, doWhile, customScript,
  plugin, outputNode, humanInput — never the generic "action", "condition" or "llm".
  loopStart, doWhileStart and selectTrigger appear here but cannot be created
  directly; trigger types are installed with "nexus workflow trigger", and
  "node create --type <anyTrigger>" answers 409 while the trigger slot is taken.
  Read one type's full schema, including its required fields and connection rules,
  with "nexus workflow node-type <type>".`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.listNodeTypes();
        const types = result;
        printList(types, undefined, [
          { key: "type", label: "TYPE", width: 30 },
          { key: "category", label: "CATEGORY", width: 20 },
          { key: "label", label: "LABEL", width: 30 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
