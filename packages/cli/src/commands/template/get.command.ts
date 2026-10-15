import type { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus template get` */
export function registerTemplateGetCommand(template: Command, program: Command): void {
  template
    .command("get")
    .description("Get document template details")
    .argument("<id>", "Template ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template get 11111111-1111-4111-8111-111111111111
  $ nexus template get 11111111-1111-4111-8111-111111111111 --json
  $ nexus template get 11111111-1111-4111-8111-111111111111 --json | jq '.inputFormat'

Notes:
  inputFormat READS null FOR EVERY TEMPLATE THIS API CAN BUILD, and that is not
  a sign the file has no placeholders. Nothing here writes the field: uploading
  stores the file and links fileUrl, and it does not run the placeholder parser.
  That parser sits behind a dashboard-only route, and the dashboard is what
  sends the result back on create — a path with no equivalent here, since
  "template create" takes name, description and type only and there is no
  template update. A template authored in the dashboard has a real inputFormat;
  one built with this CLI never will.

  So --json IS NOT A WAY TO DISCOVER VARIABLE NAMES. Read them out of the .docx
  or .pptx you uploaded. Generation ignores this field entirely, so a null here
  does not stop "template generate" filling the file's real placeholders.

  slidesInputFormat READS [] FOR EVERY TEMPLATE, for the same reason plus one
  more: no code anywhere writes it. Do not test the two the same way — null on
  one, length 0 on the other — and do not read either as evidence about the
  file.

  fileUrl IS THE READINESS SIGNAL, NOT status AND NOT inputFormat. status is
  DRAFT or SAVED, and nothing in this API ever writes SAVED — a template
  uploaded through the CLI stays DRAFT with a real fileUrl, so "status ===
  DRAFT" does not mean the template is unfinished. fileUrl and previewFileUrl
  are null until a file is uploaded; a non-null fileUrl is the whole check.
  dashboardUrl IS ADDED BY THIS CLI AND IS NOT AN API FIELD. It is this
  template's page, so nothing has to assemble a URL from a path pattern that
  can be renamed underneath it.`
    )
    .action(async (id: string) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const t = await client.skills.getDocumentTemplate(id);
        printRecord({ ...t, dashboardUrl: dashboardUrlFor("documentTemplate", t.id, globals) }, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" },
          { key: "dashboardUrl", label: "Dashboard" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
