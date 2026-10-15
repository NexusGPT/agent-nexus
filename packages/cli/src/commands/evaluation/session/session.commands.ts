import type { Command } from "commander";

import { registerEvaluationSessionCreateCommand } from "./create.command";
import { registerEvaluationSessionDeleteCommand } from "./delete.command";
import { registerEvaluationSessionGetCommand } from "./get.command";
import { registerEvaluationSessionListCommand } from "./list.command";

/** Registers the `nexus task-eval session` group and every leaf under it. */
export function registerEvaluationSessionCommands(eval_: Command, program: Command): void {
  const session = eval_.command("session").description("Manage evaluation sessions");

  registerEvaluationSessionCreateCommand(session, program);
  registerEvaluationSessionListCommand(session, program);
  registerEvaluationSessionGetCommand(session, program);
  registerEvaluationSessionDeleteCommand(session, program);
}
