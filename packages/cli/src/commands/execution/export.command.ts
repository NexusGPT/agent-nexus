import { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { WORKFLOW_EXECUTION_EXPORT_CONTRACT } from "../execution.contract.generated";

/** `nexus execution export` — one run, as a file. */
export function registerExecutionExportCommand(execution: Command, program: Command): void {
  const exportCmd = execution
    .command("export")
    .description("Export execution data")
    .argument("<id>", "Execution ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution export 11111111-1111-4111-8111-111111111111
  $ nexus execution export 11111111-1111-4111-8111-111111111111 --json

Notes:
  IT PRINTS A DOWNLOAD LINK, NOT THE EXPORT. The answer is {url, expiresAt} and
  nothing else — the run itself is the JSON document at that url. The document is
  FLAT, so the url is at .url and NOT at .data.url. Fetch it:
    curl -sL "$(nexus execution export exec-123 --json | jq -r .url)" > run.json
  THE LINK EXPIRES IN ABOUT FIVE MINUTES and carries its own authorization, so
  it needs no API key and it is not re-fetchable afterwards. Download it in the
  same breath as you mint it; re-run the command for a fresh link.
  IT IS A LINK, SO IT IS SHAREABLE — anyone holding it downloads the run's full
  contents, node inputs and outputs included, for as long as it lives.
  What lands in the file is the whole run: root execution metadata plus every
  node's record, and every nested loop sub-execution.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const data = await client.workflowExecutions.export(id);
        printRecord(data);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(exportCmd, WORKFLOW_EXECUTION_EXPORT_CONTRACT);
}
