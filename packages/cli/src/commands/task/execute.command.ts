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

/**
 * Why the tuning knobs are body-only on this command, and why the reason is NOT
 * the one this file used to give.
 *
 * 🔴 **IT SAID "inherited from the task unless the override changes provider", AND
 * `AiTaskModelOverrideSchema` SAYS THE OPPOSITE IN ITS OWN WORDS**, in its own header in
 * `packages/types/src/schemas/ModelConfig/model-override.schema.ts`: "The
 * provider-specific knobs below are NOT inherited — not even when the override
 * keeps the same provider. An override that names none runs with none, so name the
 * one you want here." That is `mergeModelConfig`'s rule, shared with
 * `PATCH /skills/tasks/:id` and the duplicate route. The old reason told an
 * operator a level would carry over when it is cleared — a wrong fact reaching
 * someone through published help, which nothing validates against the schema.
 *
 * WHY NOT A FLAG, which is the gate's other accepted answer. The valid values
 * depend on the MODEL, and a flag's `--choices()` is a static list: it would offer
 * every dialect's vocabulary for every model — `fast` on an OpenAI model — while
 * the execute use case's `refuseAChangedEffortLevel` rejects a level the named
 * model does not offer. The flag would advertise as valid what this very surface
 * refuses.
 *
 * It is sharper here than on the agent surface. `buildModelOverrideFlags` refuses
 * HALF of `--model-name`/`--model-provider` rather than completing the pair,
 * because a mismatched pair addresses one vendor with another's model id. A level
 * flag would be a fourth flag whose validity depends on one of those two — the
 * shape that refusal exists to prevent.
 */
const TUNING_IS_BODY_ONLY =
  "--body only under modelOverride; NOT inherited from the task, so name the one you want. " +
  "Valid values depend on the model's thinking dialect, which a flag's --choices() cannot bound";

/**
 * Bind the contract and declare every tuning knob body-only.
 *
 * At module scope rather than inline because `max-lines-per-function` refused the
 * registration at 93 lines, and the cap was right: the reason strings and the
 * contract binding are one cohesive unit, and the registration is about the
 * command's options. Extracted rather than exempted — that cap bounds a
 * VIOLATION, not a size budget, so raising it would legalise what it refuses.
 */
function bindTaskExecuteContract(execute: Command): void {
  bindCommand(execute, SKILLS_EXECUTE_TASK_CONTRACT, {
    // The routing pair has flags; the provider TUNING does not, and the note at
    // the command spells out how to send it.
    "Body.modelOverride.reasoningLevel": TUNING_IS_BODY_ONLY,
    "Body.modelOverride.thinkingLevel": TUNING_IS_BODY_ONLY,
    "Body.modelOverride.thinkingDisplay": TUNING_IS_BODY_ONLY,
    "Body.modelOverride.reasoningEffort": TUNING_IS_BODY_ONLY,
    "Body.modelOverride.geminiThinkingLevel": TUNING_IS_BODY_ONLY,
    "Body.modelOverride.kimiReasoningEffort": TUNING_IS_BODY_ONLY
  });
}

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

  // Renders from the options registered so far, and prints after TASK_EXECUTE_HELP, so it is last.
  bindTaskExecuteContract(execute);
}
