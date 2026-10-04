import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { isJsonMode } from "../../output";
import { judgeRunStatus, reportRunRefusal } from "../../run-verdict";
import { printDiagnosis } from "./diagnose.render";

/** The body of `nexus execution diagnose`, lifted out so the registrar stays a registrar. */
export async function runDiagnose(
  program: Command,
  id: string,
  opts: { verbose?: boolean }
): Promise<void> {
  try {
    const client = createClient(program.optsWithGlobals());
    const result = await client.workflowExecutions.diagnose(id, {
      verbose: !!opts.verbose
    });

    // `run-verdict.ts` owns what a run status MEANS, because `execution poll`
    // reads the same five values and must reach the same exit code.
    const verdict = judgeRunStatus(result.status);

    if (isJsonMode()) {
      // 🚨 UNDER --json A FAILURE IS THE ERROR DOCUMENT AND NOTHING ELSE.
      // Printing the diagnosis first takes stdout, and `emitDocument`'s
      // first-wins rule then diverts the refusal to stderr — so a consumer
      // reading stdout sees a document that parses cleanly and never learns
      // the run failed. `json-one-document.scan.ts` calls that
      // `error-masked`.
      if (verdict.outcome === "completed") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        process.exitCode = reportRunRefusal(verdict, result.executionId);
      }
      return;
    }

    printDiagnosis(result, !!opts.verbose);

    // The human already has the whole diagnosis above; the exit code is the
    // half a script reads, and it said nothing.
    if (verdict.outcome !== "completed") {
      process.exitCode = reportRunRefusal(verdict, result.executionId);
    }
  } catch (err) {
    process.exitCode = handleError(err);
  }
}
