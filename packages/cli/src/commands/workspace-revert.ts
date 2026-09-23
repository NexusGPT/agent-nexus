import type { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { color, printEnvelope, printSuccess } from "../output";
import { confirmable, confirmDestructive } from "../util/confirm";
import { WORKSPACE_REVERT_CONTRACT } from "./workspace.contract.generated";
import { sharedWorkspaceId } from "./workspace-mount/shared-workspace-id";

/**
 * `nexus workspace revert` — make an earlier version of one file live again.
 * The server copies the named version on top as a NEW version, so nothing is
 * destroyed; it still asks first, because the file's current content stops
 * being what a mount or an agent sees the moment it lands.
 */

interface RevertOptions {
  versionId: string;
  shared?: boolean;
  yes?: boolean;
}

export function registerWorkspaceRevertCommand(ws: Command, program: Command): void {
  const revert = confirmable(ws.command("revert"))
    .description("Make an earlier version of a file live again (a new version; nothing is lost)")
    .argument("<slug>", "Workspace slug")
    .argument("<path>", "The file, relative to the workspace root")
    .requiredOption("--version-id <id>", "A file version id from `workspace history`")
    .option(
      "--shared",
      "Write the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace history support-docs notes/plan.md
  $ nexus workspace revert support-docs notes/plan.md --version-id 3sL4kqmGDgz.Ex4mpl3
  $ nexus workspace revert support-docs notes/plan.md --version-id 3sL4kqmGDgz.Ex4mpl3 --yes

IT WRITES A NEW VERSION, IT DELETES NOTHING. The content that was live goes
into the history like any other version, so a revert is undone by reverting to
the id it displaced — "workspace history" shows both. It works on a deleted
file too: name the last file version and it comes back.

Notes:
  IT ASKS FIRST. Whatever a mount, WebDAV or an agent reads at that path
  changes the moment the revert lands, so the prompt names the path and the
  version. --yes is REQUIRED when stdin is not a TTY: without it a script exits
  NON-ZERO rather than reverting. Every destructive command in this CLI
  refuses the same way. "nexus --help" carries the exit-code table.
  THE ID IS THE STORE'S, NOT A NUMBER. Take it from the Version ID column of
  "workspace history"; the row number is not an id. --version-id, not
  --version: the root program owns --version.
  A DELETE MARKER IS REFUSED. It holds no bytes; pick the file version beneath
  it. An id the path never held is "not found" — ids belong to one path, so an
  id from another file's history is refused rather than copied across.
  THE VERSION ALREADY LIVE WRITES NOTHING. The answer says "already-live" and
  the command exits success. Reverting to the same id a second time after a
  revert already landed writes another copy — the head is then the copy, a
  different id — so re-running is safe but not free.
  THE COPY LANDS ONLY ON THE HEAD YOU LISTED. The server sends the head that
  "workspace history" showed as the write's precondition; a save, a delete or
  another revert that landed in between is never displaced — the revert is
  refused as precondition-failed. Run "workspace history" again and retry.
  A CODE WORKSPACE AND AN UNGRANTED SHARED WORKSPACE ARE READ-ONLY, and the
  ".checkouts" prefix is reserved: all three are refused before anything is
  listed. A NAME THAT IS A FOLDER TODAY IS REFUSED TOO — a deleted file's name
  can have become one — because the copy would land a file beside the folder
  and shadow it in every listing.
  --json IS THE SERVER'S DOCUMENT: {outcome: "written", path, revertedTo,
  newVersionId} or {outcome: "already-live", path, revertedTo}.
  Needs workspaces:write.`
    )
    .action(async (slug: string, filePath: string, opts: RevertOptions) => {
      try {
        if (
          !(await confirmDestructive(
            `Revert "${filePath}" in "${slug}" to version ${opts.versionId}? The current content stays in the history.`,
            opts
          ))
        ) {
          return;
        }
        const client = createClient(program.optsWithGlobals());
        const workspaceId = opts.shared ? await sharedWorkspaceId(client, slug) : undefined;
        const result = await client.workspaces.revert(slug, {
          path: filePath,
          versionId: opts.versionId,
          workspaceId
        });
        printEnvelope(result, () => {
          if (result.outcome === "already-live") {
            console.log(
              color.dim(
                `Version ${result.revertedTo} is already live for "${filePath}" in "${slug}"; nothing written.`
              )
            );
            return;
          }
          printSuccess(`Reverted "${filePath}" in "${slug}" to version ${result.revertedTo}`, {
            newVersionId: result.newVersionId
          });
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(revert, WORKSPACE_REVERT_CONTRACT);
}
