import type { Command } from "commander";

import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { WORKSPACE_UPLOAD_BATCH_CONTRACT } from "./workspace.contract.generated";
import { WORKSPACE_PUSH_HELP } from "./workspace/push/copy/push-help";
import { type PushOptions, runPush } from "./workspace/push/run-push";

/**
 * `nexus workspace push` — put local files into a workspace over the Public
 * API, for the machine that cannot mount (CI, a container, a locked-down
 * laptop). The mount stays the normal way; this is the door beside it.
 *
 * One request per PACK. The edge refuses any request body above 52,428,800
 * bytes on every path, so a pack stops at 45 MB of file bytes and at the
 * server's 100-file cap, whichever comes first. A single file that cannot fit
 * a pack cannot be pushed at all — the mount has no such ceiling.
 *
 * A mailbag, not a transaction: each file is delivered or bounced on its own,
 * the server has no multi-object write, and there is no rollback. The result
 * lists every file with its outcome; a failed one is reported and the run
 * exits `remote-error`, while a skipped one (`--no-clobber`, the path already
 * exists) is neither a success nor a failure and does not change the exit.
 *
 * This file registers the verb. The walk, the packing, the send, the rendering
 * and the refusals live one concern per file in `workspace/push/`.
 */
export function registerWorkspacePushCommand(ws: Command, program: Command): void {
  const push = ws
    .command("push")
    .description("Upload local files or folders into a workspace without mounting it")
    .argument(
      "<destination>",
      "Workspace slug, or <slug>:<folder> to land the sources under a folder"
    )
    .argument("<path...>", "Local files or folders to push")
    .option(
      "--no-clobber",
      "Skip a file that already exists in the workspace instead of replacing it"
    )
    .option(
      "--include-hidden",
      "Also push dot-files inside a folder (.DS_Store, .git/, .env are skipped otherwise)"
    )
    .option(
      "--shared",
      "Push into the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .addHelpText("after", WORKSPACE_PUSH_HELP)
    .action(async (destination: string, sources: string[], opts: PushOptions) => {
      try {
        process.exitCode = await runPush(destination, sources, opts, program);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(push, WORKSPACE_UPLOAD_BATCH_CONTRACT);
}
