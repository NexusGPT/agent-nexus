import fs from "node:fs";
import path from "node:path";

import type {
  AssignTemplateToFolderBody,
  CreateDocumentTemplateBody,
  CreateDocumentTemplateFolderBody,
  GenerateDocumentTemplateBody,
  UpdateDocumentTemplateFolderBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import {
  SKILLS_CREATE_DOCUMENT_TEMPLATE_CONTRACT,
  SKILLS_LIST_DOCUMENT_TEMPLATES_CONTRACT
} from "./template.contract.generated";

export function registerTemplateCommands(program: Command): void {
  const template = program.command("template").description("Manage document templates");

  template.addHelpText(
    "after",
    `
A document template is an uploaded Office file with placeholders in it, plus the
variable names those placeholders use. Generating fills the placeholders and
returns a link to the produced file.

A usable template takes THREE calls, in order, and each one is easy to stop
after:
  1. "template create --body '{\\"name\\":\\"...\\",\\"type\\":\\"WORD_TEMPLATE\\"}'"
     — type is REQUIRED and there is no --type flag.
  2. "template upload <id> --file ./thing.docx" — until a file is uploaded the
     template has no placeholders, so it has no variables and generating from it
     produces nothing useful.
  3. "template generate <id> --body '{\\"variables\\":{...}}'" — the variable
     NAMES must be the template's own, read from "template get <id> --json".

INVENTED VARIABLE NAMES DO NOT ERROR. A name the template does not use is
ignored and its placeholder is left unfilled, so the call succeeds and the
document comes back blank where you expected content.

A TEMPLATE CANNOT BE DELETED. There is no "template delete" here and no
route behind one — every template you create is permanent, and so is every file
it generates. NAMES ARE NOT UNIQUE EITHER, so two creates with the same --name
both succeed and sit side by side forever with different ids. Get the name and
the type right on the first call, and never use this namespace for a throwaway
experiment: a mistake is clutter nobody can clear, carrying whatever customer
data it was filled with.`
  );

  // ── list ────────────────────────────────────────────────────────────────
  const list = template
    .command("list")
    .description("List document templates")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template list
  $ nexus template list --search "invoice" --limit 10
  $ nexus template list --json

Notes:
  THE TABLE HIDES type AND status; --json carries both. Neither view carries the
  template's VARIABLES — "nexus template get <id> --json" is the only read that
  does, and you need them before generating.

  A template with no file uploaded lists here exactly like a finished one, and
  status does not separate them — every template reachable through this API is
  DRAFT, uploaded or not. Read fileUrl on "template get <id>" instead: null means
  no file.
  NAMES ARE NOT UNIQUE. Two templates with the same name are two rows with
  different ids, and neither can be deleted, so address them by id and expect
  duplicates in this list.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.listDocumentTemplates({
          search: opts.search,
          limit: opts.limit
        });

        printList(result.items, undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "description", label: "DESCRIPTION", width: 40 },
          { key: "createdAt", label: "CREATED", width: 26 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────
  template
    .command("get")
    .description("Get document template details")
    .argument("<id>", "Template ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template get tmpl-123
  $ nexus template get tmpl-123 --json
  $ nexus template get tmpl-123 --json | jq '.inputFormat'

Notes:
  --json IS THE ONLY WAY TO DISCOVER A TEMPLATE'S VARIABLE NAMES, and they are
  what "template generate" must be given. inputFormat describes the variables
  the template expects; slidesInputFormat is the PowerPoint form, one entry per
  slide. The table view prints neither.

  inputFormat READS null WHEN THERE IS NOTHING TO DESCRIBE — no file uploaded
  yet, or an uploaded file with no placeholders. Generating from that template
  fills nothing. Its PowerPoint sibling slidesInputFormat uses the other empty
  shape and reads [], so test the two differently: null on one, length 0 on the
  other.

  fileUrl IS THE READINESS SIGNAL, NOT status. status is DRAFT or SAVED, and
  nothing in this API ever writes SAVED — a template uploaded through the CLI
  stays DRAFT with a real fileUrl, so "status === DRAFT" does not mean the
  template is unfinished. Check fileUrl for the file and inputFormat for the
  variables. fileUrl and previewFileUrl are null until a file is uploaded.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.skills.getDocumentTemplate(id);
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ──────────────────────────────────────────────────────────────
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

  CREATING A TEMPLATE CREATES AN EMPTY SHELL. It has no file, no placeholders
  and no variables until "nexus template upload <id> --file ..." runs. Generate
  before that and you get a template with nothing to fill.

  EXCEL_TEMPLATE DOES NOT SUBSTITUTE VARIABLES YET. Generating from one returns
  the file essentially as uploaded — it is accepted, so nothing reports this.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
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
          name: t.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── upload ──────────────────────────────────────────────────────────────
  template
    .command("upload")
    .description("Upload a file to a document template")
    .argument("<id>", "Template ID")
    .requiredOption("--file <path>", "Path to the template file")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template upload tmpl-123 --file ./invoice.docx
  $ nexus template upload tmpl-123 --file ./deck.pptx

Notes:
  THIS IS THE STEP THAT GIVES A TEMPLATE ITS VARIABLES. They are read out of the
  placeholders in the uploaded file — there is no way to declare them separately.
  Confirm they were found with "nexus template get <id> --json"; an empty
  inputFormat means the file carried no placeholders the parser recognised.

  UPLOAD THE FILE FORMAT THE TEMPLATE'S type PROMISED. A .docx belongs to the
  WORD_* types, a .pptx to POWERPOINT_TEMPLATE, an .xlsx to EXCEL_TEMPLATE.
  Generation reads the type, not the file extension, so a mismatch surfaces at
  generate time rather than here.

  Uploading again replaces the file, and with it the variable list — a generate
  call written against the old placeholders silently stops filling them.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(opts.file);

        if (!fs.existsSync(absPath)) {
          console.error(`Error: File not found: ${absPath}`);
          process.exitCode = 1;
          return;
        }

        const buffer = fs.readFileSync(absPath);
        const blob = new Blob([buffer]);
        const fileName = path.basename(absPath);

        await client.skills.uploadDocumentTemplateFile(id, blob, fileName);
        printSuccess("File uploaded to template.", {
          templateId: id,
          fileName
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── generate ────────────────────────────────────────────────────────────
  template
    .command("generate")
    .description("Generate a document from a template")
    .argument("<id>", "Template ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template generate tmpl-123 --body '{"variables":{"name":"Acme Corp","date":"2026-01-01"}}'
  $ nexus template generate tmpl-123 --body variables.json
  $ nexus template generate tmpl-123 --body '{"variables":{"amount":100}}' --json

Notes:
  THE VARIABLE NAMES MUST BE THE TEMPLATE'S OWN. Read them from
  "nexus template get <id> --json" (inputFormat, or slidesInputFormat for
  PowerPoint). A name the template does not use is IGNORED — the call succeeds,
  its placeholder stays unfilled, and the document comes back blank there.
  Nothing in the response lists which variables were used.

  THE RETURNED url IS SIGNED AND EXPIRES IN ABOUT AN HOUR, the same as
  "nexus document download" and "nexus document preview". Download it in the
  same session; a link kept in a script, a ticket or a chat message stops
  working. Re-running the command generates a new document and a new link — no
  command here re-signs an old one. Until it expires the link is still a bearer
  credential, so anyone holding it can download the document: treat it as a
  secret for that hour.

  EVERY RUN PRODUCES A NEW FILE. Generating twice leaves two downloadable
  documents; there is no command here that deletes either of them.

  --body is REQUIRED and must carry a "variables" object — the CLI refuses
  locally rather than sending a request that could only 400.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `GenerateDocumentTemplateBody.variables` is required, so there is no
        // usable default: omitting `--body` could only ever produce a server
        // 400. Refuse locally rather than substitute `{}`, which would send a
        // request that cannot succeed.
        const body = await resolveBody(opts.body);
        if (body === undefined) {
          console.error("Error: --body is required.");
          process.exitCode = 1;
          return;
        }

        const result = await client.skills.generateDocumentTemplate(
          id,
          asRequestBody<GenerateDocumentTemplateBody>(body)
        );
        printSuccess("Document template generated.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── folder sub-group ──────────────────────────────────────────────────
  const tplFolder = template.command("folder").description("Manage document template folders");

  tplFolder.addHelpText(
    "after",
    `
Folders organize templates in the dashboard. They hold no content and change
nothing about generation — a template in no folder works exactly the same.

The string "null" is the way to say "no parent" and "no folder": it is read as a
null, not stored as the four characters. That is the only way to move a folder to
the root or detach a template.`
  );

  tplFolder
    .command("list")
    .description("List document template folders")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder list

Notes:
  A PARENT of "-" or empty is a root folder. Unpaginated.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.documentTemplateFolders.list();
        const folders = result.folders ?? result;
        printList(Array.isArray(folders) ? folders : [folders], undefined, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 30 },
          { key: "parentId", label: "PARENT", width: 36 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  tplFolder
    .command("create")
    .description("Create a document template folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID")
    .option("--body <json>", "Request body as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder create --name "Contracts"
  $ nexus template folder create --name "2026" --parent-id fld-123

Notes:
  Creating a folder does not put anything in it. Use
  "nexus template folder assign" to move a template into it.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          ...(opts.parentId !== undefined && { parentId: opts.parentId })
        });
        const folder = await client.documentTemplateFolders.create(
          asRequestBody<CreateDocumentTemplateFolderBody>(body)
        );
        printSuccess("Template folder created.", { id: folder.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  tplFolder
    .command("update")
    .description("Update a document template folder")
    .argument("<id>", "Folder ID")
    .option("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID (use 'null' for root)")
    .option("--body <json>", "Request body as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder update fld-123 --name "Contracts"
  $ nexus template folder update fld-123 --parent-id null

Notes:
  --parent-id null MOVES THE FOLDER TO THE ROOT. The literal string "null" is
  translated to a real null; there is no other way to clear a parent.

  Only the fields you send are written. Moving a folder moves the templates
  inside it, since they are addressed through it.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.parentId !== undefined) {
          flags.parentId = opts.parentId === "null" ? null : opts.parentId;
        }
        const body = mergeBodyWithFlags(base, flags);
        await client.documentTemplateFolders.update(
          id,
          asRequestBody<UpdateDocumentTemplateFolderBody>(body)
        );
        printSuccess("Template folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  tplFolder
    .command("delete")
    .description("Delete a document template folder")
    .argument("<id>", "Folder ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder delete fld-123
  $ nexus template folder delete fld-123 --yes

Notes:
  THE CONFIRMATION PROMPT ONLY APPEARS ON A TERMINAL. Piped, redirected or run
  in CI there is no prompt and no --yes is needed: the delete just happens.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete template folder ${id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }
        await client.documentTemplateFolders.delete(id);
        printSuccess("Template folder deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  tplFolder
    .command("assign")
    .description("Assign a template to a folder")
    .requiredOption("--template-id <id>", "Template ID")
    .requiredOption("--folder-id <id>", "Folder ID (use 'null' to unassign)")
    .option("--body <json>", "Request body as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder assign --template-id tmpl-123 --folder-id fld-456
  $ nexus template folder assign --template-id tmpl-123 --folder-id null

Notes:
  THIS IS A MOVE, NOT AN ADD. A template sits in at most ONE folder, so
  assigning it here takes it out of whichever folder held it before. Nothing in
  the response names the folder it left.

  --folder-id null UNASSIGNS the template, leaving it outside every folder. It
  is still fully usable there — a template's folder affects nothing but where it
  appears in the dashboard.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          templateId: opts.templateId,
          folderId: opts.folderId === "null" ? null : opts.folderId
        });
        await client.documentTemplateFolders.assign(
          asRequestBody<AssignTemplateToFolderBody>(body)
        );
        printSuccess("Template assigned to folder.", {
          templateId: opts.templateId,
          folderId: opts.folderId
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, SKILLS_LIST_DOCUMENT_TEMPLATES_CONTRACT);
  bindCommand(create, SKILLS_CREATE_DOCUMENT_TEMPLATE_CONTRACT, {
    // `type` is REQUIRED and has no flag of its own, so every create carries it
    // in --body. Naming it here is what stops the gate reading a deliberate
    // shape as a field somebody forgot to expose — and the contract block above
    // is now the one place its values are written down.
    "Body.type": "--body only; there is no --type flag, and the Notes above say so"
  });
}
