import type { GenerateDocumentTemplateBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, resolveRequiredBody } from "../../util/body";

/** `nexus template generate` */
export function registerTemplateGenerateCommand(template: Command, program: Command): void {
  template
    .command("generate")
    .description("Generate a document from a template")
    .argument("<id>", "Template ID")
    .requiredOption("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template generate 11111111-1111-4111-8111-111111111111 --body '{"variables":{"name":"Acme Corp","date":"2026-01-01"}}'
  $ nexus template generate 11111111-1111-4111-8111-111111111111 --body variables.json
  $ nexus template generate 11111111-1111-4111-8111-111111111111 --body '{"variables":{"amount":100}}' --json

Notes:
  THE VARIABLE NAMES MUST BE THE TEMPLATE'S OWN, AND ONLY THE FILE HAS THEM.
  "nexus template get <id> --json" reads inputFormat null for every template
  this API can build, so it is not the place to look — open the .docx or .pptx
  you uploaded. A name the template does not use is IGNORED: the call succeeds,
  its placeholder stays unfilled, and the document comes back blank there.
  Nothing in the response lists which variables were used.

  THE GENERATED FILE IS NOT A nexus document, AND NO ROW IS WRITTEN FOR IT. The
  run uploads an object to storage and returns a link; it writes nothing to the
  database, so "nexus document list" never shows it and there is no
  "template generations" verb to find it again. THE url IN THIS RESPONSE IS THE
  ONLY REFERENCE THAT WILL EVER EXIST — lose it and the object stays in storage,
  billed, with no command that can name it.

  THE RETURNED url IS SIGNED AND EXPIRES IN ABOUT AN HOUR, the same as
  "nexus document download" and "nexus document preview". Download it in the
  same session; a link kept in a script, a ticket or a chat message stops
  working. Re-running the command generates a new document and a new link — no
  command here re-signs an old one. Until it expires the link is still a bearer
  credential, so anyone holding it can download the document: treat it as a
  secret for that hour.

  EVERY RUN PRODUCES A NEW FILE. Generating twice leaves two downloadable
  documents; there is no command here that deletes either of them.

  --body is REQUIRED and must carry a "variables" object. It is declared
  required, so commander refuses a call without it before any request is built —
  the refusal names the flag and prints usage.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `GenerateDocumentTemplateBody.variables` is required, so there is no
        // usable default: omitting `--body` could only ever produce a server
        // 400. That is why `--body` is a requiredOption above — commander
        // refuses before this action runs, with a usage message, rather than the
        // action hand-rolling a refusal a caller could not see coming from
        // `--help`.
        const body = await resolveRequiredBody(opts.body);

        const result = await client.skills.generateDocumentTemplate(
          id,
          asRequestBody<GenerateDocumentTemplateBody>(body)
        );
        printSuccess("Document template generated.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
