import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { readUploadBlob } from "../../util/upload-file";

/** `nexus workflow upload-icon` — the workflow's avatar. */
export function registerWorkflowUploadIconCommand(workflow: Command, program: Command): void {
  workflow
    .command("upload-icon")
    .description("Upload an icon image for a workflow")
    .argument("<id>", "Workflow ID")
    .requiredOption("--file <path>", "Path to the image file (PNG, JPG, or SVG)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workflow upload-icon 11111111-1111-4111-8111-111111111111 --file ./icon.png
  $ nexus workflow upload-icon 11111111-1111-4111-8111-111111111111 --file ./logo.svg

Notes:
  The file is read locally first, so a missing path fails before any request.
  Maximum 2 MB — larger is a 413, with the upload aborted mid-flight.
  It REPLACES the current icon. The API answers {iconUrl} alone; this command's
  --json document is {success, message, id, iconUrl}, where id is the argument you
  passed rather than anything the route returned.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const blob = readUploadBlob(opts.file);

        const result = await client.workflows.uploadIcon(id, blob);
        printSuccess("Workflow icon uploaded.", {
          id,
          iconUrl: result.iconUrl
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
