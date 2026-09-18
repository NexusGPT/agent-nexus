import type { RoleScopeLinesBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess, printWarning } from "../../../output";
import { asRequestBody, resolveRequiredBody } from "../../../util/body";
import { SCOPE_LINES_BODY_SHAPE } from "../../role-body-shapes";
import { JOB_MODEL_DOES_NOT_MOVE_COVERAGE } from "../../role-coverage-copy";
import { resolveRoleId } from "../_shared/resolve-role-id";

/** `nexus role set-scope-lines` */
export function registerRoleSetScopeLinesCommand(role: Command, program: Command): Command {
  const leaf = role
    .command("set-scope-lines")
    .description("REPLACE a Role's scope lines")
    .argument("<role>", "Role name or UUID")
    .requiredOption("--body <json>", "{ lines: [...] } as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus role scope-lines "Support" --json > lines.json   # read first
  $ nexus role set-scope-lines "Support" --body ./lines.json

Notes:
${SCOPE_LINES_BODY_SHAPE}

  THIS REPLACES THE WHOLE LIST. A line's identity is its index in the array, so
  anything absent from "lines" is DELETED. Read, modify, send the whole list
  back. { "lines": [] } removes every line and leaves the Role with no Scope.

  A quantity of 0 is LEGAL and is not a delete — it records a decision, and the
  line keeps its scope sentence.
${JOB_MODEL_DOES_NOT_MOVE_COVERAGE}`
    )
    .action(async (ref: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const roleId = await resolveRoleId(client, ref);
        const body = await resolveRequiredBody(String(opts.body));
        const result = await client.roles.replaceScopeLines(
          roleId,
          asRequestBody<RoleScopeLinesBody>(body)
        );

        printSuccess("Scope lines replaced.", { lines: result.lines.length });
        if (result.unresolvedVariables.length > 0) {
          printWarning(
            `${String(result.unresolvedVariables.length)} referenced variable(s) are NOT defined on this Role.`,
            `Keys: ${result.unresolvedVariables.join(", ")}`,
            "These lines are priced from an incomplete model until you define them."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
