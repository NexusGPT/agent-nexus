import type { AddCustomerNoteBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { resolveInputValue } from "../../util/stdin";
import { CUSTOMER_ADD_NOTE_CONTRACT } from "../customer.contract.generated";

const NOTE_HELP = `
Examples:
  $ nexus customer note 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --content "Renewal booked"
  $ nexus customer note 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --content -

Notes:
  A NOTE IS WRITE-ONLY THROUGH THIS API. The write succeeds and then nothing
  reads it back: "customer get" pulls only tags and customFields out of the
  metadata record the note was appended to, and there is no notes-list,
  note-edit or note-delete verb here. Read your notes in the dashboard.
  THIS COMMAND ALSO DISCARDS THE NOTE THE WRITE RETURNS. The route answers with
  the note's id, content, author and createdAt; the CLI prints the customer id
  and nothing else, so the note id never reaches you on either channel.
  IT APPENDS AND NEVER REPLACES. Every call adds a record under a row lock, so
  two concurrent notes cannot lose each other.
  The author is the user behind the API key, or the literal "api" when the key
  identifies no user; the author NAME is always null on this route. --content is
  1-5000 characters after trimming, and "-" reads it from stdin.`;

/** `nexus customer note` */
export function registerCustomerNoteCommand(customer: Command, program: Command): void {
  const note = customer
    .command("note")
    .description("Add a note to a customer")
    .argument("<id>", "Customer ID")
    .requiredOption("--content <text-or-->", "Note content (or '-' for stdin)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", NOTE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const content = opts.content ? await resolveInputValue(opts.content) : undefined;
        const body = mergeBodyWithFlags(base, content ? { content } : {});
        await client.customers.addNote(id, asRequestBody<AddCustomerNoteBody>(body));
        printSuccess("Note added.", { customerId: id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(note, CUSTOMER_ADD_NOTE_CONTRACT);
}
