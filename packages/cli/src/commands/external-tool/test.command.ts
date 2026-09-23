import type { TestExternalToolBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError, reportFailure } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody, resolveInputJson } from "../../util/body";
import { SKILLS_TEST_EXTERNAL_TOOL_CONTRACT } from "../external-tool.contract.generated";

const TEST_HELP = `
Examples:
  $ nexus external-tool test 11111111-1111-4111-8111-111111111111 --operation-id getWeather --input '{"city":"London"}'
  $ nexus external-tool test 11111111-1111-4111-8111-111111111111 --body '{"operationId":"getWeather","input":{"city":"London"}}'
  $ nexus external-tool test 11111111-1111-4111-8111-111111111111 --operation-id listItems --input '{}' --json

Notes:
  --input IS EFFECTIVELY REQUIRED, EVEN FOR AN OPERATION THAT TAKES NOTHING.
  There is no default, so omitting it fails validation on the "input" field.
  Pass --input '{}' for a parameterless operation. ("test-auth" does default
  it; this command does not.)
  🚨 THAT SAME "input" ERROR IS ALSO WHAT A WRONG --operation-id LOOKS LIKE.
  Input is validated before the operation is resolved, so a typo'd operation id
  is reported as a problem with your input and sends you to fix the wrong
  argument. Always send --input '{}' FIRST; only once that is in place does the
  message become a real one about the operation.
  A BOGUS OPERATION ID DOES NOT LIST THE REAL ONES HERE. Its sibling does —
  "nexus external-tool execute <id> --action nope" answers with the tool's
  available actions. Use that to discover them, then come back.
  TEST vs EXECUTE: test takes --operation-id and answers {status, output,
  executionTimeMs} — it is the liveness check. execute takes --action and
  answers {success, toolId, action, result} — it is the real invocation. Both
  run the operation for real against the upstream API.
  THE EXIT CODE CARRIES status. A success exits 0 and an error exits non-zero,
  which is what "test-auth" beside it has always done. Under --json a failure
  REPLACES the result with the error document; its message carries the
  platform's own reason.`;

/** `nexus external-tool test` */
export function registerExternalToolTestCommand(externalTool: Command, program: Command): Command {
  const leaf = externalTool
    .command("test")
    .description("Test an external tool operation")
    .argument("<id>", "External tool ID")
    .option("--operation-id <op>", "Operation ID to test")
    .option("--input <json>", "Input parameters as JSON, a file path, or '-' for stdin")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", TEST_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.operationId) flags.operationId = opts.operationId;
        if (opts.input) flags.input = await resolveInputJson(opts.input);
        const body = mergeBodyWithFlags(base, flags);

        const result = await client.skills.testExternalTool(
          id,
          asRequestBody<TestExternalToolBody>(body)
        );
        if (result.status === "success") {
          printRecord(result);
        } else {
          // The cure was already written for this namespace, on `test-auth` —
          // the same SDK method, the same `status` field, the same taxonomy
          // choice. `remote-error`, never a refusal: the invocation was ACCEPTED
          // and the platform answered that the operation does not work.
          //
          // 🚨 THE RECORD IS NOT PRINTED FIRST, for the reason `test-auth` gives:
          // under --json a failure is the error document and NOTHING else, and
          // taking stdout with the payload leaves a document that parses cleanly
          // and never says the test failed.
          process.exitCode = reportFailure(
            "remote-error",
            `Tool test failed: ${result.error ?? "Unknown error"}`,
            "This ran the operation for real against the upstream API. Check the tool's auth with \"external-tool test-auth\", then the operation's own input."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, SKILLS_TEST_EXTERNAL_TOOL_CONTRACT);
  return leaf;
}
