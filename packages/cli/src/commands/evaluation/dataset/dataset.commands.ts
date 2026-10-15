import type { Command } from "commander";

import { registerEvaluationDatasetAddCommand } from "./add.command";
import { registerEvaluationDatasetListCommand } from "./list.command";

/** Registers the `nexus task-eval dataset` group and every leaf under it. */
export function registerEvaluationDatasetCommands(eval_: Command, program: Command): void {
  const dataset = eval_.command("dataset").description("Manage evaluation dataset rows");

  registerEvaluationDatasetListCommand(dataset, program);
  registerEvaluationDatasetAddCommand(dataset, program);
}
