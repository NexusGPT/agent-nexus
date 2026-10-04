import { Command } from "commander";

import { bindCommand } from "../../contract-binding";
import { WORKFLOW_EXECUTION_DIAGNOSE_CONTRACT } from "../execution.contract.generated";
import { EXECUTION_DIAGNOSE_HELP } from "./copy/diagnose-help";
import { runDiagnose } from "./diagnose.handler";

/** `nexus execution diagnose` — per-node status, errors and data. */
export function registerExecutionDiagnoseCommand(execution: Command, program: Command): void {
  const diagnose = execution
    .command("diagnose")
    .description("Diagnose execution — per-node status, errors, and data")
    .argument("<id>", "Execution ID")
    .option("--verbose", "Include full input/output JSON for each node")
    .addHelpText("after", EXECUTION_DIAGNOSE_HELP)
    .action(async (id: string, opts) => {
      await runDiagnose(program, id, opts);
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(diagnose, WORKFLOW_EXECUTION_DIAGNOSE_CONTRACT);
}
