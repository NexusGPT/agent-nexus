import type { DuplicateTaskBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import {
  SKILLS_DUPLICATE_TASK__BODY_MODEL_PROVIDER,
  SKILLS_DUPLICATE_TASK_CONTRACT
} from "../task.contract.generated";
import { TASK_DUPLICATE_HELP } from "./copy/duplicate-help";

/** `nexus task duplicate` — copy a task, optionally onto another model. */
export function registerTaskDuplicateCommand(task: Command, program: Command): void {
  const duplicate = task
    .command("duplicate")
    .description("Copy an AI task, optionally onto another model")
    .argument("<id>", "Task ID to copy")
    .option("--name <name>", 'Name for the copy (default: "<source name> (Copy)")')
    .option("--description <text>", "Description for the copy (default: the source's)")
    .option("--model-name <model>", "Run the copy on this model (e.g. claude-haiku-4-5)")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Provider of --model-name",
        SKILLS_DUPLICATE_TASK__BODY_MODEL_PROVIDER
      )
    )
    .option(
      "--custom-model-id <id>",
      "Run the copy on a custom model (BYOM) — the id from 'nexus custom-model list'"
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", TASK_DUPLICATE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.modelName !== undefined) flags.modelName = opts.modelName;
        if (opts.modelProvider !== undefined) flags.modelProvider = opts.modelProvider;
        if (opts.customModelId !== undefined) flags.customModelId = opts.customModelId;

        const body = mergeBodyWithFlags(base, flags);
        const t = await client.skills.duplicateTask(id, asRequestBody<DuplicateTaskBody>(body));
        printSuccess("Task duplicated.", {
          id: t.id,
          name: t.name,
          kind: t.kind,
          modelName: t.modelName,
          modelProvider: t.modelProvider
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(duplicate, SKILLS_DUPLICATE_TASK_CONTRACT);
}
