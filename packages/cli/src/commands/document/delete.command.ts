import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

const DELETE_HELP = `
Examples:
  $ nexus document delete 11111111-1111-4111-8111-111111111111
  $ nexus document delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  THIS REMOVES THE DOCUMENT FROM EVERY COLLECTION HOLDING IT, not just the one
  you had in mind, and takes it out of the search index. Check first with
  "nexus document get <id> --json". To take a document out of ONE collection,
  use "nexus collection remove-document" instead.

  DELETING A FOLDER TAKES ITS CHILDREN WITH IT. Every page, tab or file beneath
  it goes too. List them first with "nexus document children <id>".

  A BIG FOLDER OUTLASTS THE 30s CLIENT TIMEOUT, AND THE SERVER KEEPS GOING. The
  timeout error means the CLI stopped waiting, never that the delete stopped —
  it carries on and lands PARTIALLY, so "document list" shrinks while you read
  the error. Do not treat it as a failed call and do not delete the children by
  hand. Re-run the same command with a longer budget until it returns:

    $ nexus document delete 22222222-2222-4222-8222-222222222222 --yes --timeout 180

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`;

/**
 * `nexus document delete`
 *
 * UNBOUND ON PURPOSE — see the docblock on `registerDocumentCommands`.
 */
export function registerDocumentDeleteCommand(document: Command, program: Command): Command {
  const leaf = confirmable(document.command("delete"))
    .description("Delete a document")
    .argument("<id>", "Document ID")
    .addHelpText("after", DELETE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete document ${id}?`, opts))) return;

        await client.documents.delete(id);
        printSuccess("Document deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
