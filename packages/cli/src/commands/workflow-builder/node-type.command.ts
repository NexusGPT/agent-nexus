import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { isJsonMode, printRecord } from "../../output";

/** `nexus workflow node-type` */
export function registerWorkflowNodeTypeCommand(workflow: Command, program: Command): void {
  workflow
    .command("node-type")
    .description("Get full schema for a node type")
    .argument("<type>", "Node type identifier")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow node-type aiTask
  $ nexus workflow node-type branching --json

Notes:
  Carries the type's fields with their defaults, its configuration steps in ORDER,
  and its connection rules (how many inputs and outputs it takes, whether it can
  live inside a loop, what children it creates).
  A FIELD WITH A CLOSED SET OF LEGAL VALUES CARRIES 'values', and a write of
  anything else is refused with 400 NODE_FIELD_VALUE_INVALID. Read 'values', not
  'type' — 'type' is prose, and it can name FEWER values than the server accepts.
  The empty string is always accepted: it means the field is not configured yet.
  A field with NO 'values' is not value-checked at all, which is not the same as
  saying any value works.
  Read the configuration steps before configuring a plugin node: the order is
  load-bearing, and doing it out of order is accepted and produces nothing.
  MOST TYPES ALSO CARRY A 'guide' — a Markdown page written from live runs, saying
  which type to pick over which, a configuration that actually RUNS, and the writes
  the platform accepts and then fails at run time. It prints below the schema here
  and is the 'guide' string under --json. A type with no guide yet omits the key.`
    )
    .action(async (type: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workflows.getNodeTypeSchema(type);

        // --json must carry the WHOLE document, guide included: splitting the
        // rendering must never split the payload. `printRecord` short-circuits
        // to `emitDocument` under --json, so handing it `result` untouched is
        // what keeps the two channels in agreement.
        if (isJsonMode()) {
          printRecord(result);
          return;
        }

        // A guide is 4-13 KB of Markdown with its own newlines, and
        // `printRecord` pads a label then prints the value on one line — so as a
        // record field it would wreck the alignment of every row after it. It is
        // the same object either way; only where it is drawn differs.
        const { guide, ...schema } = result;
        printRecord(schema);

        if (guide !== undefined) {
          console.log(`\n${guide}`);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
