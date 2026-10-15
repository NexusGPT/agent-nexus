import type { CreateDocumentTemplateBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { SKILLS_CREATE_DOCUMENT_TEMPLATE_CONTRACT } from "../template.contract.generated";

/** `nexus template create` */
export function registerTemplateCreateCommand(template: Command, program: Command): void {
  const create = template
    .command("create")
    .description("Create a document template")
    .option("--name <name>", "Template name")
    .option("--description <text>", "Template description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template create --body '{"name":"Invoice","type":"WORD_TEMPLATE"}'
  $ nexus template create --name "Report" --body '{"type":"WORD_TEMPLATE","description":"Monthly report"}'
  $ nexus template create --body '{"name":"Deck","type":"POWERPOINT_TEMPLATE"}'

Notes:
  type IS REQUIRED AND THERE IS NO --type FLAG. It has to go through --body, so
  a create built only from --name and --description is a 400 every time. The
  accepted values are listed in the Contract block below, from the schema.

  CREATING A TEMPLATE CREATES AN EMPTY SHELL. It has no file until
  "nexus template upload <id> --file ..." runs, and generating before that
  FAILS WITH A SERVER ERROR rather than returning an empty document — the
  generator throws a plain error on a null fileUrl, so the caller gets a 500
  naming nothing, not a 400 naming the missing file.

  EXCEL_TEMPLATE DOES NOT SUBSTITUTE VARIABLES YET. Generating from one returns
  the file essentially as uploaded — it is accepted, so nothing reports this.

  dashboardUrl in the payload is the new template's page, added by this CLI
  rather than returned by the API — open it, or hand it to whoever asked.`
    )
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          description: opts.description
        });

        const t = await client.skills.createDocumentTemplate(
          asRequestBody<CreateDocumentTemplateBody>(body)
        );
        printSuccess("Template created.", {
          id: t.id,
          name: t.name,
          dashboardUrl: dashboardUrlFor("documentTemplate", t.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(create, SKILLS_CREATE_DOCUMENT_TEMPLATE_CONTRACT, {
    // `type` is REQUIRED and has no flag of its own, so every create carries it
    // in --body. Naming it here is what stops the gate reading a deliberate
    // shape as a field somebody forgot to expose — and the contract block above
    // is now the one place its values are written down.
    "Body.type": "--body only; there is no --type flag, and the Notes above say so"
  });
}
