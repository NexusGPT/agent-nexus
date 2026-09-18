import type { RoleVariablesBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";
import { VARIABLES_BODY_SHAPE } from "../../role-body-shapes";
import { JOB_MODEL_DOES_NOT_MOVE_COVERAGE } from "../../role-coverage-copy";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role set-variables` */
export function registerRoleSetVariablesCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("set-variables")
    .description("REPLACE a Role's variables")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--body <json>", "{ variables: [...] } as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role variables "Support" --json > vars.json    # read first
  $ nexus role set-variables "Support" --body ./vars.json

Notes:
  REPLACES THE WHOLE LIST, exactly like the scope lines. Keys must be unique.
${VARIABLES_BODY_SHAPE}

  value:null MEANS UNSET AND IS NOT ZERO. Sending 0 asserts a measured zero;
  sending null leaves every part referencing that key unresolved. Both are
  accepted and they price differently, so nothing downstream will tell you
  which you meant.

  A VARIABLE CARRIES NO DIMENSION, AND A "dimension" KEY IS REFUSED BY NAME.
  "unit" is free text for a human and nothing parses it. The DIMENSIONAL check —
  multiply each term's exponents out and ask whether the result lands on money a
  year — reads exponents nothing written here can carry, so it is unreachable
  from this command however the variables are spelled.

  THAT IS NOT "expressions are checked elsewhere and not here". Nothing on this
  API parses one at all: a job type's costExpression, hoursExpression and
  revenueExpression are infix STRINGS stored verbatim, so a malformed one is
  accepted by every write here and fails only in the browser that evaluates it.
  The dimensioned models the product DOES check are a different shape on a
  different row, and they are authored in the dashboard.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const body = await resolveRequiredBody(String(opts.body));
        const { variables } = await client.roles.replaceVariables(
          roleId,
          asRequestBody<RoleVariablesBody>(body)
        );

        printSuccess("Variables replaced.", {
          variables: variables.length,
          unset: variables.filter((v) => v.value === null).length
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
