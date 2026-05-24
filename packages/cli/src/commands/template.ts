import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";

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
        const items = Array.isArray(result)
          ? result
          : ((result as any).items ?? (result as any).data ?? result);

        printList(items as unknown as Record<string, unknown>[], undefined, [
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
        printRecord(t as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "fileName", label: "File Name" },
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

        const t = await client.skills.createDocumentTemplate(body as any);
        printSuccess("Template created.", {
          id: (t as any).id,
          name: (t as any).name
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

        const result = await client.skills.uploadDocumentTemplateFile(id, blob, fileName);
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
        const body = await resolveBody(opts.body);

        const result = await client.skills.generateDocumentTemplate(id, body as any);
        printRecord(result as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
