import type { ExecuteTaskBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { isJsonMode } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { resolveInputValue } from "../../util/stdin";
import {
  SKILLS_EXECUTE_TASK__BODY_MODEL_OVERRIDE_MODEL_PROVIDER,
  SKILLS_EXECUTE_TASK_CONTRACT
} from "../task.contract.generated";
import { buildModelOverrideFlags } from "./_shared/build-model-override-flags";
import { EXECUTE_DEFAULT_TIMEOUT_SECONDS } from "./_shared/execute-default-timeout";
import { TASK_EXECUTE_HELP } from "./copy/execute-help";

/** `nexus task execute` — run the task, optionally on another model for this call. */
export function registerTaskExecuteCommand(task: Command, program: Command): void {
  const execute = task
    .command("execute")
    .description("Execute an AI task")
    .argument("<id>", "Task ID")
    .requiredOption("--input <text-or-->", "Input text (or '-' for stdin)")
    .option("--model-name <model>", "Run THIS call on this model instead of the task's")
    .addOption(
      enumOption(
        "--model-provider <provider>",
        "Provider of --model-name",
        SKILLS_EXECUTE_TASK__BODY_MODEL_OVERRIDE_MODEL_PROVIDER
      )
    )
    .option(
      "--custom-model-id <id>",
      "Run THIS call on a custom model (BYOM) — the id from 'nexus custom-model list'"
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", TASK_EXECUTE_HELP)
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient({
          ...globals,
          timeout: globals.timeout ?? EXECUTE_DEFAULT_TIMEOUT_SECONDS
        });
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.input) flags.input = await resolveInputValue(opts.input);

        const override = buildModelOverrideFlags(opts);
        if (override) flags.modelOverride = override;

        const execBody = mergeBodyWithFlags(base, flags);
        const result = await client.skills.executeTask(
          id,
          asRequestBody<ExecuteTaskBody>(execBody)
        );

        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.output ?? JSON.stringify(result, null, 2));
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and after the hand-written prose.
  bindCommand(execute, SKILLS_EXECUTE_TASK_CONTRACT, {
    // The routing pair has flags; the provider TUNING does not, and the note at
    // the command spells out how to send it. Five flags for knobs that are
    // inherited from the task in the common case would bury the two that this
    // command exists to offer.
    "Body.modelOverride.thinkingLevel":
      "--body only under modelOverride; inherited from the task unless the override changes provider",
    "Body.modelOverride.thinkingDisplay":
      "--body only under modelOverride; inherited from the task unless the override changes provider",
    "Body.modelOverride.reasoningEffort":
      "--body only under modelOverride; inherited from the task unless the override changes provider",
    "Body.modelOverride.geminiThinkingLevel":
      "--body only under modelOverride; inherited from the task unless the override changes provider",
    "Body.modelOverride.kimiReasoningEffort":
      "--body only under modelOverride; inherited from the task unless the override changes provider"
  });
}
