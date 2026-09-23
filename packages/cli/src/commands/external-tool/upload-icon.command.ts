import fs from "node:fs";
import path from "node:path";

import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import { SKILLS_UPLOAD_EXTERNAL_TOOL_ICON_CONTRACT } from "../external-tool.contract.generated";

const UPLOAD_ICON_HELP = `
Examples:
  $ nexus external-tool upload-icon 11111111-1111-4111-8111-111111111111 --file ./logo.png
  $ nexus external-tool upload-icon 11111111-1111-4111-8111-111111111111 --file ./icon.svg

Notes:
  THE FILE IS CHECKED BEFORE ANYTHING IS SENT. A path that does not exist is
  refused locally, with the resolved absolute path in the message — so a typo
  costs no round trip and the tool's current icon is untouched.
  --file resolves relative to the CURRENT DIRECTORY, or takes an absolute path.
  The file's BASENAME is what gets stored as the uploaded name, so name the file
  what you want recorded.
  PNG, JPG and SVG. The icon is cosmetic — it changes how the tool renders in the
  dashboard and nothing about what it can do.`;

/** `nexus external-tool upload-icon` */
export function registerExternalToolUploadIconCommand(
  externalTool: Command,
  program: Command
): Command {
  const leaf = externalTool
    .command("upload-icon")
    .description("Upload an icon/logo image for an external tool")
    .argument("<id>", "External tool ID")
    .requiredOption("--file <path>", "Path to the image file, PNG/JPG/SVG (required)")
    .addHelpText("after", UPLOAD_ICON_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(opts.file);

        if (!fs.existsSync(absPath)) {
          process.exitCode = refuse(
            `File not found: ${absPath}`,
            "Pass a path that exists, relative to the current directory or absolute."
          );
          return;
        }

        const buffer = fs.readFileSync(absPath);
        const blob = new Blob([buffer]);
        const fileName = path.basename(absPath);

        const result = await client.skills.uploadExternalToolIcon(id, blob, fileName);
        printSuccess("Icon uploaded.", {
          id,
          imageUrl: result.imageUrl
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, SKILLS_UPLOAD_EXTERNAL_TOOL_ICON_CONTRACT);
  return leaf;
}
