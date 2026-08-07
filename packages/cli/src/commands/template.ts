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
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";

export function registerTemplateCommands(program: Command): void {
  const template = program.command("template").description("Manage document templates");

  // ── list ────────────────────────────────────────────────────────────────
  template
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
  $ nexus template list --json`
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
  $ nexus template get tmpl-123 --json`
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
  template
    .command("create")
    .description("Create a document template")
    .option("--name <name>", "Template name")
    .option("--description <text>", "Template description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template create --name "Invoice Template"
  $ nexus template create --name "Report" --description "Monthly report template"
  $ nexus template create --body '{"name":"Contract","description":"Standard contract"}'`
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
  $ nexus template upload tmpl-123 --file ./report.pdf`
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
  $ nexus template generate tmpl-123 --body '{"variables":{"amount":100}}' --json`
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

  tplFolder
    .command("list")
    .description("List document template folders")
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
}
