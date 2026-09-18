import type { RoleJobTypeBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";
import { ROLE_JOB_TYPES_CREATE_CONTRACT } from "../../role.contract.generated";
import { JOB_TYPE_BODY_SHAPE } from "../../role-body-shapes";
import { JOB_MODEL_DOES_NOT_MOVE_COVERAGE } from "../../role-coverage-copy";
import { JOB_TYPE_BODY_ONLY } from "../_shared/job-type-body-only";

/** `nexus role create-job-type` */
export function registerRoleCreateJobTypeCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("create-job-type")
    .description("Add a job type to the organization's library")
    .requiredOption("--body <json>", "The whole job type as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role create-job-type --body ./support-agent.json
  $ cat jobtype.json | nexus role create-job-type --body -

Notes:
  --body IS REQUIRED because "parts" is a nested array of rate inputs and no
  flag spelling of it is honest.
${JOB_TYPE_BODY_SHAPE}

  null IS NOT ZERO. fte:null is a full contract; a null expression means "use
  the basis' built-in one"; an EMPTY STRING expression evaluates to zero, which
  is what a credit type with no cost wants.

  basis "CUSTOM" with costExpression null is REFUSED — CUSTOM has no built-in
  cost expression, so a null one would price every scope line quantifying this
  type at ZERO with no error on any read.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.createJobType(asRequestBody<RoleJobTypeBody>(body));

        printSuccess("Job type created.", {
          id: result.jobType.id,
          name: result.jobType.name,
          repricedScopeLines: result.repricedScopeLines
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLE_JOB_TYPES_CREATE_CONTRACT, JOB_TYPE_BODY_ONLY);
  return leaf;
}
