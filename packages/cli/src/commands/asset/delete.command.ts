import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess, printWarning } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { ASSET_DELETE_CONTRACT } from "../asset.contract.generated";

/** `nexus asset delete --help`, after the generated usage block. */
const DELETE_NOTES = `
Examples:
  $ nexus asset delete 11111111-1111-4111-8111-111111111111
  $ nexus asset delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  THIS IS TWO OPERATIONS AND THE SECOND ONE IS ALLOWED TO FAIL. The record is
  soft-deleted, then the stored object is reclaimed. objectRemoved in the output
  says whether the second one happened, and it is the ONLY thing that does.

  objectRemoved true  — the public URL is gone and 404s from here on.
  objectRemoved false — THE PUBLIC URL IS STILL SERVING. The object is stored
                        public-read and the URL points straight at it, so
                        nothing about the deleted record affects what a browser
                        fetching it gets. url in the output is that URL.

  RE-RUNNING THIS COMMAND DOES NOT RETRY THE RECLAIM. The record is already
  deleted, so a second call answers 404 "Asset not found" — which reads like
  confirmation that the asset is gone, and is not. A false is an escalation, not
  a retry: the object is orphaned but tracked, so it can be reclaimed from the
  storage side, and the url line is what identifies it.

  THERE IS NO UNDO EITHER WAY. Anything already pointing at the URL — an embed
  widget's styling, an HTML message template, an agent's branding — breaks the
  moment the object goes, with no error on this side and nothing listing what
  referenced the asset. Confirm the URL is unused first.

  THE EXIT CODE IS 0 ON A FAILED RECLAIM, because the request succeeded and the
  record really is deleted; a NON-ZERO exit means the call failed and carries an
  error document, and "nexus --help" says which non-zero code means what. The signal is a warning on STDERR (written even
  under --json, which keeps stdout a clean document) plus objectRemoved in the
  payload. A script that must not proceed on a still-serving URL has to READ
  objectRemoved — the exit code will not tell it.

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`;
/** `nexus asset delete` */
export function registerAssetDeleteCommand(asset: Command, program: Command): void {
  const remove = confirmable(asset.command("delete"))
    .description("Delete an asset")
    .argument("<id>", "Asset ID")
    .addHelpText("after", DELETE_NOTES)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete asset ${id}?`, opts))) return;

        const result = await client.assets.delete(id);

        // `objectRemoved` is carried out rather than dropped: it is the only
        // signal that the public URL stopped serving, and the CLI used to
        // discard the whole response (NEX-3850).
        printSuccess("Asset deleted.", {
          id: result.id,
          objectRemoved: result.objectRemoved,
          url: result.url
        });

        if (!result.objectRemoved) {
          // STDERR, and the exit code stays 0. The request succeeded and the
          // record is deleted, so exit 1 would claim a failure the root --help
          // pairs with an error document this call does not have. The warning
          // is written even under --json for exactly this case.
          printWarning(
            "The record is deleted but the stored object was NOT removed — the public URL is still serving.",
            `Still reachable: ${result.url}`,
            "Re-running this command will NOT retry it: the record is gone, so a second call answers 404.",
            "The object is orphaned but tracked; reclaim it from the storage side using the URL above."
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(remove, ASSET_DELETE_CONTRACT);
}
