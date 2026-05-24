import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";

export function registerDocumentCommands(program: Command): void {
  const document = program.command("document").description("Manage knowledge documents");

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    document
      .command("list")
      .description("List documents")
      .option("--search <query>", "Search by name")
      .option("--type <type>", "Filter by type")
      .option("--status <status>", "Filter by status")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus document list
  $ nexus document list --search "report" --limit 10
  $ nexus document list --status PROCESSED --json`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.documents.list({
        ...getPaginationParams(opts),
        search: opts.search,
        type: opts.type,
        status: opts.status
      });

      printList(data as Record<string, unknown>[], meta as unknown as Record<string, unknown>, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 30 },
        { key: "type", label: "TYPE", width: 12 },
        { key: "status", label: "STATUS", width: 12 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ───────────────────────────────────────────────────────────────
  document
    .command("get")
    .description("Get document details")
    .argument("<id>", "Document ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document get doc-123
  $ nexus document get doc-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const doc = await client.documents.get(id);
        printRecord(doc as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "type", label: "Type" },
          { key: "status", label: "Status" },
          { key: "processingProgress", label: "Progress" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── upload ────────────────────────────────────────────────────────────
  document
    .command("upload")
    .description("Upload a file as a document")
    .argument("<file-path>", "Path to the file")
    .option("--description <text>", "Document description")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document upload ./report.pdf
  $ nexus document upload ./data.csv --description "Q4 sales data"
  $ nexus document upload ./manual.txt --json`
    )
    .action(async (filePath: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(filePath);

        if (!fs.existsSync(absPath)) {
          console.error(`Error: File not found: ${absPath}`);
          process.exitCode = 1;
          return;
        }

        const buffer = fs.readFileSync(absPath);
        const blob = new Blob([buffer]);
        const fileName = path.basename(absPath);

        const doc = await client.documents.uploadFile(blob, fileName, opts.description);
        printSuccess("Document uploaded.", {
          id: (doc as any).id,
          name: (doc as any).name ?? fileName
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create-text ───────────────────────────────────────────────────────
  document
    .command("create-text")
    .description("Create a text document")
    .requiredOption("--name <name>", "Document name")
    .requiredOption("--content <text-or-->", "Content (text, or '-' for stdin)")
    .option("--description <text>", "Document description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document create-text --name "FAQ" --content "Q: How do I...\\nA: You can..."
  $ cat content.md | nexus document create-text --name "Guide" --content -
  $ nexus document create-text --body '{"name":"FAQ","content":"..."}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.content) flags.content = await resolveInputValue(opts.content);
        if (opts.description !== undefined) flags.description = opts.description;

        const body = mergeBodyWithFlags(base, flags);

        const doc = await client.documents.createText(body as any);
        printSuccess("Text document created.", {
          id: (doc as any).id,
          name: (doc as any).name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── add-website ───────────────────────────────────────────────────────
  document
    .command("add-website")
    .description("Crawl a website and create document(s)")
    .requiredOption("--url <url>", "Website URL")
    .option("--mode <mode>", "Crawl mode: sitemap, single, etc.", "single")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document add-website --url https://docs.example.com --mode sitemap
  $ nexus document add-website --url https://example.com/page --mode single
  $ nexus document add-website --body '{"url":"https://example.com","mode":"sitemap"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.url !== undefined && { url: opts.url }),
          ...(opts.mode !== undefined && { mode: opts.mode })
        });

        const doc = await client.documents.addWebsite(body as any);
        printSuccess("Website document created.", {
          id: (doc as any).id,
          name: (doc as any).name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── preview ───────────────────────────────────────────────────────────
  document
    .command("preview")
    .description("Get a preview URL for inline viewing of a document")
    .argument("<id>", "Document ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document preview doc-123
  $ nexus document preview doc-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.documents.getPreviewUrl(id);
        printRecord(result as unknown as Record<string, unknown>, [
          { key: "url", label: "URL" },
          { key: "fileName", label: "File Name" },
          { key: "mimeType", label: "MIME Type" },
          { key: "expiresIn", label: "Expires In (s)" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  document
    .command("delete")
    .description("Delete a document")
    .argument("<id>", "Document ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document delete doc-123
  $ nexus document delete doc-123 --yes`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete document ${id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.documents.delete(id);
        printSuccess("Document deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
