import type { CreateTaskBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { resolveInputValue } from "../../util/stdin";
import {
  SKILLS_CREATE_TASK__BODY_MODEL_PROVIDER,
  SKILLS_CREATE_TASK_CONTRACT
} from "../task.contract.generated";
import { TASK_CREATE_HELP } from "./copy/create-help";

/** `nexus task create` — a new AI task. */
export function registerTaskCreateCommand(task: Command, program: Command): void {
  const create = task
    .command("create")
    .description("Create an AI task")
    .requiredOption("--name <name>", "Task name")
    .requiredOption("--model-name <model>", "Model name (e.g. gpt-4o)")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Model provider",
        SKILLS_CREATE_TASK__BODY_MODEL_PROVIDER
      ).makeOptionMandatory()
    )
    .option("--description <text>", "Task description")
    .option(
      "--custom-model-id <id>",
      "Run on a custom model (BYOM) — the id from 'nexus custom-model list'"
    )
    .option("--prompt <file-or-->", "Task prompt (file path, or '-' for stdin)")
    .option("--expected-input <text>", "Description of expected input")
    .option("--expected-output <text>", "Description of expected output")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", TASK_CREATE_HELP)
    .action(async (opts) => {
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

        if (opts.expectedInput || opts.expectedOutput) {
          flags.generation = {
            expectedInput: opts.expectedInput,
            expectedOutput: opts.expectedOutput
          };
        }

        const body = mergeBodyWithFlags(base, flags);

        const t = await client.skills.createTask(asRequestBody<CreateTaskBody>(body));
        printSuccess("Task created.", {
          id: t.id,
          name: t.name,
          dashboardUrl: dashboardUrlFor("aiTask", t.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(create, SKILLS_CREATE_TASK_CONTRACT, {
    // Both formats are --body only, and the root help block above already says
    // so. Declaring them here is what stops the gate reading a deliberate
    // omission as a field somebody forgot to expose.
    "Body.inputFormat": "--body only; see the namespace help — lowercase in, uppercase out",
    "Body.outputFormat": "--body only; see the namespace help — lowercase in, uppercase out"
  });
}
