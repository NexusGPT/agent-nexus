import { type Command } from "commander";

import { registerEvalRunAbortCommand } from "./eval/run/abort.command";
import { registerEvalRunCreateCommand } from "./eval/run/create.command";
import { registerEvalRunGetCommand } from "./eval/run/get.command";
import { registerEvalRunListCommand } from "./eval/run/list.command";
import { registerEvalRunPreviewCommand } from "./eval/run/preview.command";
import { registerEvalRunResultsCommand } from "./eval/run/results.command";

/**
 * `nexus eval run` — the matrix (Prompt Lab phase 3).
 *
 * ## 🔴 `run create` SPENDS REAL MONEY
 *
 * Every cell of the matrix runs the agent live — its tools execute for real —
 * and then calls a judge. A run is variants x checkpoints x conversations, so
 * the cost multiplies fast. `--dry-run` shows the case count before you commit,
 * and `--budget-cap-usd` stops the run once it reaches a ceiling.
 *
 * ## The loop
 *
 * `create` queues and returns immediately; poll `get` until the status leaves
 * QUEUED/RUNNING; `results` renders the matrix; `get --case` opens one cell.
 */
export function registerEvalRunCommands(evalCmd: Command, program: Command): void {
  const run = evalCmd.command("run").description("Run and read prompt evaluations");

  // Registration ORDER is the surface: `eval run --help` lists subcommands in
  // the order they were added, so these six calls are not interchangeable.
  registerEvalRunCreateCommand(run, program);
  registerEvalRunPreviewCommand(run, program);
  registerEvalRunListCommand(run, program);
  registerEvalRunGetCommand(run, program);
  registerEvalRunAbortCommand(run, program);
  registerEvalRunResultsCommand(run, program);
}
