import type { UpdateTaskBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { resolveInputValue } from "../../util/stdin";
import {
  SKILLS_UPDATE_TASK__BODY_MODEL_PROVIDER,
  SKILLS_UPDATE_TASK_CONTRACT
} from "../task.contract.generated";
import { TASK_UPDATE_HELP } from "./copy/update-help";

/** `nexus task update` — a PATCH that versions whatever it names. */
export function registerTaskUpdateCommand(task: Command, program: Command): void {
  const update = task
    .command("update")
    .description("Update an AI task")
    .argument("<id>", "Task ID")
    .option("--name <name>", "Task name")
    .option("--description <text>", "Task description")
    .option("--prompt <file-or-->", "Task prompt (file path, or '-' for stdin)")
    .option("--model-name <model>", "Model name (e.g. gpt-4o)")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Model provider",
        SKILLS_UPDATE_TASK__BODY_MODEL_PROVIDER
      )
    )
    .option(
      "--custom-model-id <id>",
      "Attach a custom model (BYOM) — the id from 'nexus custom-model list'"
    )
    .option("--expected-input <text>", "Description of expected input")
    .option("--expected-output <text>", "Description of expected output")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", TASK_UPDATE_HELP)
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.modelName !== undefined) flags.modelName = opts.modelName;
        if (opts.modelProvider !== undefined) flags.modelProvider = opts.modelProvider;
        if (opts.customModelId !== undefined) flags.customModelId = opts.customModelId;
        if (opts.prompt) flags.prompt = await resolveInputValue(opts.prompt);

        if (opts.expectedInput !== undefined || opts.expectedOutput !== undefined) {
          flags.generation = {
            ...(opts.expectedInput !== undefined && { expectedInput: opts.expectedInput }),
            ...(opts.expectedOutput !== undefined && { expectedOutput: opts.expectedOutput })
          };
        }

        const body = mergeBodyWithFlags(base, flags);
        const t = await client.skills.updateTask(id, asRequestBody<UpdateTaskBody>(body));
        printSuccess("Task updated.", {
          id: t.id,
          name: t.name,
          dashboardUrl: dashboardUrlFor("aiTask", t.id, globals),
          // Null only when the body named no recognized field, so nothing was
          // written. NOT a no-op detector — an update whose values are identical
          // to the stored ones still versions.
          versionId: t.versionId,
          versionCreatedAt: t.versionCreatedAt
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(update, SKILLS_UPDATE_TASK_CONTRACT, {
    "Body.inputFormat": "--body only; see the namespace help — lowercase in, uppercase out",
    "Body.outputFormat": "--body only; see the namespace help — lowercase in, uppercase out"
  });
}
