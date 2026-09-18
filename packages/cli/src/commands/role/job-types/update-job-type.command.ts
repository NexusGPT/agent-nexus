import type { RoleJobTypeBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess, printWarning } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";
import { ROLE_JOB_TYPES_UPDATE_CONTRACT } from "../../role.contract.generated";
import { JOB_TYPE_BODY_SHAPE } from "../../role-body-shapes";
import { JOB_MODEL_DOES_NOT_MOVE_COVERAGE } from "../../role-coverage-copy";
import { JOB_TYPE_BODY_ONLY } from "../_shared/job-type-body-only";

/** `nexus role update-job-type` */
export function registerRoleUpdateJobTypeCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("update-job-type")
    .description("Replace a job type (PUT — send the whole object)")
    .argument("<job-type-id>", "Job-type UUID")
    .requiredOption("--body <json>", "The whole job type as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role update-job-type 66666666-6666-4666-8666-666666666666 --body ./support-agent.json

Notes:
  A PUT OF THE WHOLE OBJECT. An omitted field is a validation error, not "leave
  it alone" — read the current row with "nexus role job-types --json", change
  what you mean, send it all back.
${JOB_TYPE_BODY_SHAPE}

  A JOB TYPE IS SHARED ACROSS ROLES. REPRICED SCOPE LINES in the output is how
  many lines this write just repriced org-wide. That is the blast radius, and it
  is the reason the number is reported rather than left to be discovered.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (jobTypeId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.updateJobType(
          jobTypeId,
          asRequestBody<RoleJobTypeBody>(body)
        );

        printSuccess("Job type updated.", {
          id: result.jobType.id,
          repricedScopeLines: result.repricedScopeLines
        });
        if (result.repricedScopeLines > 0) {
          printWarning(
            `${String(result.repricedScopeLines)} scope line(s) were REPRICED by this edit.`,
            "A job type is shared, so this changed what other Roles cost — not just this one.",
            // The job model's cost, which is the Scope's. Naming the coverage
            // read here sent a caller to a figure this write cannot move.
            "Re-read the affected Roles' scope lines if the money matters."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(leaf, ROLE_JOB_TYPES_UPDATE_CONTRACT, JOB_TYPE_BODY_ONLY);
  return leaf;
}
