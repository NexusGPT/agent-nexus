import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError, reportFailure } from "../../errors";
import { printRecord, printSuccess } from "../../output";
import { resolveInputJson } from "../../util/body";

const TEST_AUTH_HELP = `
Examples:
  $ nexus external-tool test-auth 11111111-1111-4111-8111-111111111111 --operation-id listItems
  $ nexus external-tool test-auth 11111111-1111-4111-8111-111111111111 --operation-id searchVehicles --input '{"pageSize":1}'

Notes:
Tests that the stored credentials work by executing an operation. If the token is
expired, the platform will attempt to refresh it automatically before calling the API.
  --operation-id IS REQUIRED, and it is declared so: commander refuses a call
  without it and prints usage. There is no safe default to pick, because the
  operation you name is the one that actually runs.
  🚨 THIS IS A REAL CALL AGAINST THE REAL API, not a dry check. Name a read
  operation — a write one will write.
  --input defaults to {} and also takes a file path or "-" for stdin.
  A pass proves the credential works for THAT operation. A scope-limited token
  can pass here and still be refused by another.`;

/**
 * `nexus external-tool test-auth`
 *
 * UNBOUND ON PURPOSE: this reaches a route the v1 contract does not declare.
 */
export function registerExternalToolTestAuthCommand(
  externalTool: Command,
  program: Command
): Command {
  const leaf = externalTool
    .command("test-auth")
    .description("Test auth credentials for an external tool by calling an operation")
    .argument("<id>", "External tool ID")
    .requiredOption("--operation-id <op>", "Operation ID to test with")
    .option(
      "--input <json>",
      "Input parameters as JSON, a file path, or '-' for stdin (default: {})"
    )
    .addHelpText("after", TEST_AUTH_HELP)
    .action(async (id: string, opts) => {
      try {
        // `--operation-id` is a requiredOption: the operation named is the one
        // that really runs against the live API, so there is no safe default to
        // pick. Commander refuses before this action, with a usage message.
        const client = createClient(program.optsWithGlobals());
        const input = (opts.input ? await resolveInputJson(opts.input) : {}) as Record<
          string,
          unknown
        >;
        const result = await client.skills.testExternalTool(id, {
          operationId: opts.operationId,
          input
        });
        if (result.status === "success") {
          // The RECORD first, then the verdict. Both wrote a JSON document under
          // --json, so the pair was two concatenated documents; the record is the
          // payload a caller parses, so it is the one that keeps stdout.
          printRecord(result);
          printSuccess("Auth credentials are valid. Operation executed successfully.", {
            status: result.status,
            executionTimeMs: result.executionTimeMs
          });
        } else {
          // `remote-error`, never a refusal: the invocation was ACCEPTED and the
          // platform answered that the stored credentials do not work. The
          // caller's next move is to fix the credentials, not the command line.
          //
          // This arm was `console.error` + exit 1, so under --json it produced a
          // non-zero exit and an EMPTY stdout — the clause-2 defect. The success
          // arm above was reordered for clause 1 and this one was left behind,
          // which is why the driven scan never saw it: its stub cannot satisfy
          // `status === "success"`, so it lands here and records `silent`.
          process.exitCode = reportFailure(
            "remote-error",
            `Auth test failed: ${result.error ?? "Unknown error"}`,
            "Update the stored credentials with `external-tool update-auth`, then test again."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
