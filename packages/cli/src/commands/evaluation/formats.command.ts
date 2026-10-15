import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { EVALUATION_FORMATS_CONTRACT } from "../task-eval.contract.generated";

const FORMATS_HELP = `
Examples:
  $ nexus task-eval formats
  $ nexus task-eval formats --json

Notes:
  THESE ARE UPLOAD FORMATS FOR A DATASET, not output formats for a task. They say
  what "task-eval dataset upload" will accept.
  A row is an extension, its MIME type and a description. The EXTENSION is what
  the upload matches on, so a file with the right content and the wrong suffix is
  refused.
  This list is a property of the platform, not of your task or session, so it
  takes no arguments and never varies per organization.`;

/** `nexus task-eval formats` */
export function registerEvaluationFormatsCommand(eval_: Command, program: Command): Command {
  const formats = eval_
    .command("formats")
    .description("List available evaluation formats")
    .addHelpText("after", FORMATS_HELP)
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.evaluations.listFormats();
        const items = result;

        printList(items, undefined, [
          { key: "extension", label: "EXTENSION", width: 12 },
          { key: "mimeType", label: "MIME TYPE", width: 30 },
          { key: "description", label: "DESCRIPTION", width: 50 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(formats, EVALUATION_FORMATS_CONTRACT);
  return formats;
}
