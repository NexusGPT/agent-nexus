import { Command } from "commander";

import { registerTemplateCreateCommand } from "./template/create.command";
import { registerTemplateDeleteCommand } from "./template/delete.command";
import { registerTemplateFolderCommands } from "./template/folder/folder.commands";
import { registerTemplateGenerateCommand } from "./template/generate.command";
import { registerTemplateGetCommand } from "./template/get.command";
import { registerTemplateListCommand } from "./template/list.command";
import { registerTemplateUploadCommand } from "./template/upload.command";

export function registerTemplateCommands(program: Command): void {
  const template = program.command("template").description("Manage document templates");

  template.addHelpText(
    "after",
    `
A document template is an uploaded Office file with placeholders in it.
Generating fills the placeholders from a variables object and returns a link to
the produced file.

A usable template takes TWO calls, in order, and each one is easy to stop after:
  1. "template create --body '{\\"name\\":\\"...\\",\\"type\\":\\"WORD_TEMPLATE\\"}'"
     — type is REQUIRED and there is no --type flag.
  2. "template upload <id> --file ./thing.docx" — the file IS the template.
     Generating before it is uploaded fails with a server error.
Then "template generate <id> --body '{\\"variables\\":{...}}'".

THE VARIABLE NAMES COME FROM THE FILE, AND THIS API NEVER RECORDS THEM. The
placeholder parser is reached only from the dashboard, which calls it separately
and stores the result; no route here writes that list — create takes name,
description and type only, and there is no template update. So a template
created and uploaded with this CLI reads inputFormat null forever, and
"template get <id> --json" cannot tell you what to send.

SO READ THE NAMES OUT OF THE FILE YOU UPLOADED. Generation does not consult the
stored list at all — the file is sent to the renderer with your variables object,
so substitution is decided by the placeholders actually in it.

INVENTED VARIABLE NAMES DO NOT ERROR. A name the template does not use is
ignored and its placeholder is left unfilled, so the call succeeds and the
document comes back blank where you expected content.

"template delete <id>" REMOVES THE TEMPLATE, NOT WHAT IT GENERATED. The
delete takes the row, the uploaded file behind it and its folder filing. It does
NOT touch documents already produced from it: generation writes no row and the
url it returned is the only reference that will ever exist, so those files stay
in storage with no command that can name them.

DELETE IS REFUSED WITH 409 WHILE ANYTHING STILL POINTS AT THE TEMPLATE — an AI
task rendering its output through it, an agent task, or an agent carrying it as
a skill. The error lists the dependents; detach them and retry.

NAMES ARE NOT UNIQUE, so two creates with the same --name both succeed and sit
side by side with different ids. Address a template by id, not by name — and
delete the one you meant.`
  );

  registerTemplateListCommand(template, program);
  registerTemplateGetCommand(template, program);
  registerTemplateCreateCommand(template, program);
  registerTemplateUploadCommand(template, program);
  registerTemplateDeleteCommand(template, program);
  registerTemplateGenerateCommand(template, program);

  registerTemplateFolderCommands(template, program);
}
