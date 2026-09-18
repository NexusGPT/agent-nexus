import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printList, printWarning } from "../../../output";

/** `nexus role job-types` */
export function registerRoleJobTypesCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("job-types")
    .description("List the organization's job-type library — every way of paying for work")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role job-types

Notes:
  ORG-WIDE, not per Role. This read is how you learn the job-type ids a scope
  line has to name.
  UNREADABLE is not decoration: a row whose stored rate inputs did not parse is
  withheld from the list and its id reported instead — because listing it with
  no rates would price every scope line using it at ZERO with nothing saying so.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const library = await client.roles.listJobTypes();

        printList(library.jobTypes, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 26 },
          { key: "basis", label: "BASIS", width: 8 },
          { key: "group", label: "GROUP", width: 9 },
          { key: "quantityUnit", label: "UNIT", width: 12 },
          {
            key: "parts",
            label: "PARTS",
            width: 6,
            format: (val) => (Array.isArray(val) ? String(val.length) : "0")
          }
        ]);

        if (library.unreadable.length > 0) {
          printWarning(
            `${String(library.unreadable.length)} job type(s) could not be read and are NOT in the list above.`,
            `Ids: ${library.unreadable.join(", ")}`,
            "Their stored rate inputs did not parse. Any scope line naming one of these is",
            "priced from a model nothing can read — fix the row rather than ignoring this."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
