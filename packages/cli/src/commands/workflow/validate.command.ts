import { Command } from "commander";

import { createClient } from "../../client";
import { handleError, reportFailure } from "../../errors";
import { isJsonMode, printRecord } from "../../output";
import { WORKFLOW_VALIDATE_HELP } from "./copy/validate-help";

/** `nexus workflow validate` — what publish would refuse, without publishing. */
export function registerWorkflowValidateCommand(workflow: Command, program: Command): void {
  workflow
    .command("validate")
    .description("Validate a workflow")
    .argument("<id>", "Workflow ID")
    .addHelpText("after", WORKFLOW_VALIDATE_HELP)
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const report = await client.workflows.validate(id);
        // 🚨 UNDER --json A FAILURE IS THE ERROR DOCUMENT AND NOTHING ELSE, so
        // the report is printed only when the workflow is VALID or the reader is
        // a human. Printing it first takes stdout and `emitDocument`'s
        // first-wins rule diverts the refusal to stderr — `error-masked` in
        // `json-one-document.scan.ts`, a failure whose stdout reads as a
        // success.
        if (report.isValid || !isJsonMode()) printRecord(report);
        if (!report.isValid) {
          // 🚨 `isValid`, NOT `readyToPublish`. `isValid` is exactly "errors is
          // empty"; `readyToPublish` additionally demands a trigger and a fully
          // configured graph, and this command's own help records that a
          // workflow failing THAT still publishes. Exiting non-zero on it would
          // redden a healthy workflow, which is how a gate gets reverted.
          //
          // ⚠️ WARNINGS ARE LEFT TO THE DOCUMENT. A warning is not a failure,
          // and a validate that refuses on one is a validate nobody runs.
          //
          // `remote-error`, never a refusal: the invocation was ACCEPTED and the
          // platform answered that the workflow under test is broken. The
          // caller's next move is to fix the workflow, not the command line.
          process.exitCode = reportFailure(
            "remote-error",
            `Workflow ${id} is not valid: ${String(report.errors.length)} error(s).`,
            "Each entry in `errors` names its node, its field and its severity. " +
              "Warnings do not affect this exit code."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
