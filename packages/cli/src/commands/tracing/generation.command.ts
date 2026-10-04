import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus tracing generation` — the one place the prompt and response live. */
export function registerTracingGenerationCommand(tracing: Command, program: Command): void {
  tracing
    .command("generation")
    .description("Get one generation — the ONLY source of the prompt, messages and response")
    .argument("<id>", "Generation ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tracing generation 2d9c8b71-6e05-4f3a-9c18-5b7a4e6d0f21 --json
  $ nexus tracing generation 2d9c8b71-6e05-4f3a-9c18-5b7a4e6d0f21 --json | jq -r .systemPrompt
  $ nexus tracing generation 2d9c8b71-6e05-4f3a-9c18-5b7a4e6d0f21

Notes:
  USE --json OR YOU WILL NOT SEE THE PROMPT. The table view prints metadata
  only — no systemPrompt, no messages, no tools, no response, no responseJson.
  They are in the response either way; only --json renders them.
  THIS IS THE ONLY ENDPOINT THAT CARRIES THEM. "tracing generations" and
  "tracing trace" both omit them, so there is no way to bulk-read prompts
  short of one call per generation.
  finishReason IS NULL WHEN THE STORED VALUE IS NOT ONE THIS API RECOGNISES —
  it is coerced to null rather than reported, so null means "unrecognised or
  absent", never "the model gave no reason".
  Cost renders "-" for null, which is not zero and does NOT mean the model has
  no price. A model missing from the pricing catalog is recorded at 0, with a
  warning in the server log. Null means the cost column was never written:
  the generation is still RUNNING, or it terminated before any usage was
  recorded. A terminated one reads FAILED, or COMPLETED when it was ABORTED —
  the abort path stores status COMPLETED and writes no cost, so a COMPLETED
  generation showing "-" is expected rather than a gap.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const gen = await client.tracing.getGeneration(id);
        printRecord(gen, [
          { key: "id", label: "ID" },
          { key: "traceId", label: "Trace ID" },
          { key: "provider", label: "Provider" },
          { key: "modelName", label: "Model" },
          { key: "status", label: "Status" },
          { key: "inputTokens", label: "Input Tokens" },
          { key: "outputTokens", label: "Output Tokens" },
          {
            key: "costUsd",
            label: "Cost ($)",
            format: (v) => (v != null ? `$${Number(v).toFixed(6)}` : "-")
          },
          { key: "durationMs", label: "Duration (ms)" },
          { key: "temperature", label: "Temperature" },
          { key: "taskName", label: "Task" },
          { key: "startedAt", label: "Started" },
          { key: "completedAt", label: "Completed" },
          { key: "errorMessage", label: "Error" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
