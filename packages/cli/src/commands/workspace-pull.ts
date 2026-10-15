import type { Command } from "commander";

import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { WORKSPACE_FOLDER_ARCHIVE_CONTRACT } from "./workspace.contract.generated";
import { WORKSPACE_PULL_HELP } from "./workspace/pull/copy/pull-help";
import { type PullOptions, runPull } from "./workspace/pull/run-pull";

/**
 * `nexus workspace pull` — copy files OUT of a workspace onto this machine,
 * for the machine that cannot mount. The inverse of `push`, and the same
 * shape: `<slug>[:<folder>]` names where in the workspace, the rest is local.
 *
 * Two routes, chosen by what was asked for:
 *   - no file names → the folder (root when none) as ONE streamed ZIP from
 *     `GET /workspaces/:slug/folder-archive`, saved beside `--out` and unpacked
 *     with the system `unzip` (macOS, Linux) or `tar` (Windows, which ships
 *     bsdtar and no `unzip`). The server refuses an empty folder and one past
 *     50 000 entries / 2 GB before the first byte.
 *   - file names → one presigned link each (`GET /workspaces/:slug/file`),
 *     fetched in parallel, each written under `--out` by its base name.
 *
 * Local files are overwritten like `cp`. A failure throws: this is `cp`, not
 * the mailbag `push` is — nothing partial is reported as a document.
 *
 * This file registers the verb; the two routes and everything they share live
 * one concern per file in `workspace/pull/`.
 */
export function registerWorkspacePullCommand(ws: Command, program: Command): void {
  const pull = ws
    .command("pull")
    .description("Download a workspace folder or named files onto this machine without mounting it")
    .argument("<source>", "Workspace slug, or <slug>:<folder> for a folder inside it")
    .argument(
      "[file...]",
      "Files to pull, relative to the folder; none pulls the whole folder as a ZIP"
    )
    .option("--out <dir>", "Where the files land (created if missing)", ".")
    .option("--keep-zip", "Leave the downloaded archive next to the unpacked files")
    .option(
      "--shared",
      "Pull from the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .addHelpText("after", WORKSPACE_PULL_HELP)
    .action(async (source: string, files: string[], opts: PullOptions) => {
      try {
        process.exitCode = await runPull(source, files, opts, program);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(pull, WORKSPACE_FOLDER_ARCHIVE_CONTRACT);
}
