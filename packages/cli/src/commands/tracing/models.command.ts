import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { isJsonMode } from "../../output";

/** `nexus tracing models` — the model names actually seen in the window. */
export function registerTracingModelsCommand(tracing: Command, program: Command): void {
  tracing
    .command("models")
    .description("List distinct model names used in traces")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing models
  $ nexus tracing models --json

Notes:
  DISTINCT MODEL NAMES FROM GENERATIONS STILL IN RETENTION, one per line, sorted.
  A model your organization used last month but not this week is NOT here — the
  list is bounded by the trace window, not by what you have ever run.
  Prints nothing but "No models found." when empty. Under --json it is a plain
  array of strings, not an object.
  Use these exact strings with --model on "tracing traces" / "tracing
  generations", where the match is a case-insensitive substring.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const models = await client.tracing.listModels();
        const list = Array.isArray(models) ? models : [];

        if (isJsonMode()) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }

        if (list.length === 0) {
          console.log("No models found.");
          return;
        }

        for (const m of list) console.log(m);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
