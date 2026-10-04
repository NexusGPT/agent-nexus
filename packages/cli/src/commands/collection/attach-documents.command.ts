import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { parseRequiredIdList } from "../../util/ids";
import { SKILLS_ATTACH_COLLECTION_DOCUMENTS_CONTRACT } from "../collection.contract.generated";

/** `nexus collection attach-documents` */
export function registerCollectionAttachDocumentsCommand(
  collection: Command,
  program: Command
): Command {
  const leaf = collection
    .command("attach-documents")
    .description("Attach documents to a collection")
    .argument("<id>", "Collection ID")
    .requiredOption("--document-ids <ids>", "Comma-separated document IDs", (raw: string) =>
      parseRequiredIdList(raw, "--document-ids")
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection attach-documents 11111111-1111-4111-8111-111111111111 --document-ids 22222222-2222-4222-8222-222222222222,33333333-3333-4333-8333-333333333333

Notes:
  A DOCUMENT ID IS A UUID, AND THIS ROUTE IS THE ONE THAT DOES NOT SAY SO.
  AttachCollectionDocumentsBodySchema types documentIds as a plain string array,
  while "collection remove-document" types the same id as a UUID and refuses
  anything else with a 400. So a malformed id reaches the database here instead
  of being named at the edge — it lands in the all-or-nothing 404 below, which
  names no id.

  A FOLDER ID EXPANDS TO ITS CONTENTS. Any id naming a folder — FOLDER, a
  website folder from "document add-website", the folder an imported Google
  Sheet or a Google Drive import produces — attaches every document under it,
  recursively, as of that moment. The folder row itself is never linked, and
  documents added to the folder later are not pulled in; re-attach the folder
  to pick them up. An EMPTY folder attaches nothing and still succeeds.

  THE RESPONSE COUNTS NOTHING, SO IT CANNOT TELL YOU WHAT AN EXPANSION LINKED.
  It carries the collection id and nothing else — no attached count, no
  per-folder breakdown. The only proof is the read:
  "nexus collection documents <id>".

  ALL OR NOTHING ON EXISTENCE. If any id is unknown, deleted, or owned by
  another organization the whole call is a 404 and nothing is attached. The
  refusal NAMES the ids it could not resolve, each in quotes, and carries them
  again under error.details.missingDocumentIds for --json.

  WHITESPACE AND REPEATS ARE YOURS TO SPEND. This flag trims around every comma
  and drops the empty entries, so "doc-1, doc-2," sends two ids. A REPEATED id
  is one attachment, not a 404 — the route de-duplicates before it resolves.
  A list that is empty once trimmed is refused here, by name, with no request.

  ATTACH DOCUMENTS THAT ARE READY. A PENDING or PROCESSING document links
  without error and contributes nothing to retrieval until it finishes; an ERROR
  document never will. Check first with "nexus document get <id>".

  Re-attaching an already-attached document is a no-op, not an error, so this
  command is safe to re-run.

  Verify with "nexus collection documents <id>" — that read is immediate, while
  "collection query" can lag by minutes behind the attach.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.skills.attachDocumentsToCollection(id, {
          // Already an array: the option's own parser split, trimmed and dropped
          // the empty entries, so the refusal for `--document-ids " , "` lands
          // before a request is built rather than as a 400 naming no flag.
          documentIds: opts.documentIds as string[]
        });
        printSuccess("Documents attached to collection.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(leaf, SKILLS_ATTACH_COLLECTION_DOCUMENTS_CONTRACT);
  return leaf;
}
