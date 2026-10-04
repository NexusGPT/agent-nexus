import { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus task get` — one task, with its prompt and its model. */
export function registerTaskGetCommand(task: Command, program: Command): void {
  task
    .command("get")
    .description("Get AI task details")
    .argument("<id>", "Task ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus task get 11111111-1111-4111-8111-111111111111
  $ nexus task get 11111111-1111-4111-8111-111111111111 --json
  $ nexus task get 11111111-1111-4111-8111-111111111111 --json | jq -r '.prompt'
  $ nexus task get 11111111-1111-4111-8111-111111111111 --json | jq '.jsonOutputSchema'

Notes:
  EVERYTHING IS AT THE TOP LEVEL. prompt, jsonInputSchema, jsonOutputSchema,
  multimodal and documentTemplateId all sit on the response root, and there is
  NO "generation" key on a read — reading ".generation.jsonOutputSchema" gets
  you null, not the schema.

  THIS READ IS NOT A WRITE BODY. inputFormat and outputFormat come back
  UPPERCASE ("TEXT", "JSON", "TEMPLATE") while writes accept only lowercase, and
  the schemas have to move back under "generation". Feeding this response
  straight into "task update" returns a 400 on the format alone.

  The human-readable view prints a subset. Use --json for the schemas and for
  "fewShots" — the task's few-shot examples, oldest first, in the order the
  model is shown them. It is [] when the task has none:
    $ nexus task get 11111111-1111-4111-8111-111111111111 --json | jq '.fewShots'

  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is this task's
  page. The evaluation view is a DIFFERENT path — /app/my-tools/<id>/evaluate,
  under my-tools rather than my-ai-tasks — which reads like a mistake and is
  what the dashboard declares.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const t = await client.skills.getTask(id);
        printRecord({ ...t, dashboardUrl: dashboardUrlFor("aiTask", t.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "category", label: "Category" },
          { key: "modelName", label: "Model" },
          { key: "modelProvider", label: "Provider" },
          { key: "inputFormat", label: "Input Format" },
          { key: "outputFormat", label: "Output Format" },
          { key: "prompt", label: "Prompt" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
