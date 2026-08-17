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
import { dashboardUrlFor } from "../dashboard-url";
import { handleError, refuse } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody, resolveRequiredBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  SKILLS_CREATE_DOCUMENT_TEMPLATE_CONTRACT,
  SKILLS_LIST_DOCUMENT_TEMPLATES_CONTRACT
} from "./template.contract.generated";

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
  template's VARIABLES, and neither does "template get" — nothing in this API
  ever writes that list. Read the placeholder names out of the file you
  uploaded; "nexus template get <id> --help" has the mechanism.

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
  $ nexus template upload 11111111-1111-4111-8111-111111111111 --file ./invoice.docx
  $ nexus template upload 11111111-1111-4111-8111-111111111111 --file ./deck.pptx

Notes:
  THIS STEP STORES THE FILE AND READS NOTHING OUT OF IT. It uploads the file to
  storage and writes fileUrl on the template; it never runs the placeholder
  parser, so inputFormat is not written here and stays null. Checking
  "nexus template get <id> --json" afterwards proves nothing about your file —
  the null is this route's behaviour, not a verdict on your placeholders.

  THE PLACEHOLDER PARSER IS DASHBOARD-ONLY. It sits behind an internal route the
  dashboard calls after uploading, and the dashboard is what stores the result.
  No route in this API does either half, so there is no CLI equivalent and
  nothing to wait for. Read the variable names out of the file itself; only the
  dashboard can put them on the template.

  UPLOAD THE FILE FORMAT THE TEMPLATE'S type PROMISED. A .docx belongs to the
  WORD_* types, a .pptx to POWERPOINT_TEMPLATE, an .xlsx to EXCEL_TEMPLATE.
  Generation reads the type, not the file extension, so a mismatch surfaces at
  generate time rather than here.

  UPLOADING AGAIN REPLACES THE FILE AND DELETES THE OLD ONE from storage. The
  placeholders that matter change with it, silently: a generate call written
  against the previous file's names still returns 200 and simply stops filling
  them.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(opts.file);

        if (!fs.existsSync(absPath)) {
          process.exitCode = refuse(
            `File not found: ${absPath}`,
            "Pass a path that exists, relative to the current directory or absolute."
          );
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
  $ nexus template folder create --name "2026" --parent-id 22222222-2222-4222-8222-222222222222

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
  $ nexus template folder update 22222222-2222-4222-8222-222222222222 --name "Contracts"
  $ nexus template folder update 22222222-2222-4222-8222-222222222222 --parent-id null

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

  confirmable(tplFolder.command("delete"))
    .description("Delete a document template folder")
    .argument("<id>", "Folder ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder delete 22222222-2222-4222-8222-222222222222
  $ nexus template folder delete 22222222-2222-4222-8222-222222222222 --yes

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!(await confirmDestructive(`Delete template folder ${id}?`, opts))) return;
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
  $ nexus template folder assign --template-id 11111111-1111-4111-8111-111111111111 --folder-id 33333333-3333-4333-8333-333333333333
  $ nexus template folder assign --template-id 11111111-1111-4111-8111-111111111111 --folder-id null

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
