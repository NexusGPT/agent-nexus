import { Command } from "commander";

import { registerTaskCreateCommand } from "./task/create.command";
import { registerTaskDeleteCommand } from "./task/delete.command";
import { registerTaskDuplicateCommand } from "./task/duplicate.command";
import { registerTaskExecuteCommand } from "./task/execute.command";
import { registerTaskGetCommand } from "./task/get.command";
import { registerTaskListCommand } from "./task/list.command";
import { registerTaskUpdateCommand } from "./task/update.command";

export function registerTaskCommands(program: Command): void {
  const task = program.command("task").description("Manage AI tasks");

  task.addHelpText(
    "after",
    `
An AI task is a saved prompt plus the model and the input/output contract it
runs under. Three facts about the body decide whether a write lands:

  • CREATE REQUIRES A "generation" OBJECT, and an empty one is not enough. With
    the default formats it must carry expectedInput AND expectedOutput. The
    flags for those are --expected-input and --expected-output, so a create
    without them is a 400 no matter what else you pass.
  • FORMATS ARE LOWERCASE GOING IN, UPPERCASE COMING BACK. Send "json"; "task
    get" answers "JSON", and echoing that value back into update is a 400.
  • WRITES TAKE THE FORMATS FROM THE BODY ROOT AND THE SCHEMAS FROM
    "generation"; READS PUT EVERYTHING AT THE ROOT. "task get" has no
    "generation" key at all, so a get/edit/put round trip must move the fields.

THE MODEL IS A PROPERTY OF THE CALL, NOT ONLY OF THE TASK. "task execute" takes
--model-name/--model-provider and runs THAT one invocation elsewhere without
touching the task, so one prompt can be swept cheaply in bulk and run on the
frontier model on demand. Reach for "task duplicate" only when the prompt itself
is about to diverge — two copies of one prompt drift, and the drift is silent.

Every field below is settable through --body. The flags cover the common ones;
allowDuplicate, temperature, inputFormat, outputFormat, the JSON schemas,
multimodal and fewShots have no flag and are --body only.`
  );

  registerTaskListCommand(task, program);
  registerTaskGetCommand(task, program);
  registerTaskCreateCommand(task, program);
  registerTaskUpdateCommand(task, program);
  registerTaskDuplicateCommand(task, program);
  registerTaskDeleteCommand(task, program);
  registerTaskExecuteCommand(task, program);
}
