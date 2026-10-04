import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus tracing delete` — the trace and its generations, irrecoverably. */
export function registerTracingDeleteCommand(tracing: Command, program: Command): void {
  tracing
    .command("delete")
    .description("Delete a trace and every generation under it — permanent, no confirmation")
    .argument("<id>", "Trace ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing delete 7f3a1c20-9b4e-4d51-8a62-0c1d2e3f4a5b

Notes:
  IT TAKES THE GENERATIONS WITH IT. Every model call recorded under this
  trace — prompts, messages, responses, costs — is deleted, and none of it is
  named in the request or the response.
  NO CONFIRMATION AND NO --yes FLAG. This command deletes the moment you press
  enter, on a TTY or in a script alike.
  There is no undo and no export-on-delete. Run "nexus tracing export <id>"
  first if the record matters.
  Verify with "nexus tracing trace <id>", which then answers 404.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.tracing.deleteTrace(id);
        printSuccess("Trace deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
