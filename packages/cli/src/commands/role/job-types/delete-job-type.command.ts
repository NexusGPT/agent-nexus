import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { JOB_MODEL_DOES_NOT_MOVE_COVERAGE } from "../../role-coverage-copy";

/** `nexus role delete-job-type` */
export function registerRoleDeleteJobTypeCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("delete-job-type")
    .description("Remove a job type from the organization's library")
    .argument("<job-type-id>", "Job-type UUID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role delete-job-type 66666666-6666-4666-8666-666666666666

Notes:
  ORG-WIDE. A job type is shared across every Role, so this removes it from
  the library for all of them, not from the one you happen to be looking at.

  REFUSED WHILE ANYTHING STILL QUANTIFIES IT, AND NOTHING IS MODIFIED. A job
  type that any scope line names is not deletable: the call answers 409 Conflict
  and states how many scope lines still quantify it. No line loses its price
  model and no row is touched — RoleScopeLine's key into the library is NO
  ACTION, so the database refuses the delete whatever anything else does. Clear
  those lines with "nexus role set-scope-lines" first, then delete.

  THE COUNT IS ORG-WIDE AND NAMES NO ROLE. It is every scope line in the
  organization, and the message cannot say which Roles hold them, so
  "nexus role scope-lines <role>" per Role is still how you find them.

  Once it IS deletable there is no confirmation prompt and no undo.
  Verify with "nexus role job-types" — the id is gone from the library.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (jobTypeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.roles.deleteJobType(jobTypeId);

        printSuccess("Job type deleted.", { id: result.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
