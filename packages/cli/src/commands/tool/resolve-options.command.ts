import type { ResolveRemoteOptionsBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { asRequestBody, resolveRequiredBody } from "../../util/body";

/** `nexus tool resolve-options` — a parameter's dynamic dropdown. */
export function registerToolResolveOptionsCommand(tool: Command, program: Command): void {
  tool
    .command("resolve-options")
    .description("Resolve dynamic dropdown options for a tool parameter")
    .argument("<id>", "Tool ID")
    .requiredOption("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool resolve-options 11111111-1111-4111-8111-111111111111 --body '{"componentId":"gmail-send","propName":"label","credentialId":"cred-123","configuredProps":{}}'

Notes:
  --body IS REQUIRED even though it reads as optional above: the command refuses
  without it rather than sending an empty request, because every field in it
  selects what to resolve.
  IT ANSWERS A DROPDOWN, NOT A TOOL. propName names the single parameter whose
  choices you want; componentId names the action it belongs to. Asking for a
  parameter that carries no dynamic options is a question with no answer.
  configuredProps IS WHAT MAKES THE ANSWER CORRECT, and {} is rarely right. Later
  options usually depend on earlier ones — a sheet's tab list needs the
  spreadsheet already chosen — so pass what is set so far.
  credentialId picks WHOSE options these are; the same parameter resolves
  differently per connected account.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // Every field in the body selects WHAT to resolve, so there is no
        // usable default. `--body` is a requiredOption above; commander refuses
        // before this action runs rather than the action hand-rolling a refusal
        // that `--help` gave no warning of.
        const body = await resolveRequiredBody(opts.body);
        const result = await client.tools.resolveOptions(
          id,
          asRequestBody<ResolveRemoteOptionsBody>(body)
        );
        printRecord(result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
