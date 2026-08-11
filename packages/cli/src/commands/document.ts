import fs from "node:fs";
import path from "node:path";

import type {
  AddWebsiteDocumentBody,
  CreateDocumentFolderBody,
  CreateGoogleSheetDocumentBody,
  CreateTextDocumentBody,
  UpdateDocumentBody
} from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess, printWarning } from "../output";
import { asRequestBody, mergeBodyWithFlags, readStringField, resolveBody } from "../util/body";
import { parseMetadataPairs } from "../util/metadata";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";

/** Commander collector for repeatable `--metadata key=value` options. */
function collectMetadata(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * The crawl modes `POST /documents/website` accepts.
 *
 * `satisfies` gates the list against the SDK's own field, so a value that stops
 * being legal stops compiling here rather than reaching the server. The CLI
 * advertised "single" for months; the contract has never accepted it.
 */
const CRAWL_MODES = [
  "sitemap",
  "crawl"
] as const satisfies readonly AddWebsiteDocumentBody["mode"][];

export function registerDocumentCommands(program: Command): void {
  const document = program.command("document").description("Manage knowledge documents");

  // ── list ──────────────────────────────────────────────────────────────
  addPaginationOptions(
    document
      .command("list")
      .description("List documents")
      .option("--search <query>", "Search by name")
      .option(
        "--type <type>",
        "Filter by type (PDF, CSV, TEXT, IMAGE, AUDIO, WEBSITE_FOLDER, WEBSITE_PAGE, NOTION_PAGE, NOTION_DATABASE, GOOGLE_DOC, GOOGLE_SHEET, GOOGLE_DRIVE, SHAREPOINT, AIRTABLE_BASE, AIRTABLE_TABLE, FOLDER, UNKNOWN)"
      )
      .option(
        "--status <status>",
        "Filter by status (PENDING, PROCESSING, READY, ERROR, SYNCING) — READY is terminal success"
      )
      .addHelpText(
        "after",
        `
Examples:
  $ nexus document list
  $ nexus document list --search "report" --limit 10
  $ nexus document list --status READY --json

Poll an import to completion by watching for READY (terminal success) or ERROR.
There is no COMPLETED or PROCESSED status — both are rejected, and a loop that
waits for one can only ever exit by timing out.`
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

      printList(data, meta, [
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
        printRecord(doc, [
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
    .option(
      "--metadata <key=value...>",
      "Filterable metadata (repeatable). Overrides matching YAML frontmatter keys.",
      collectMetadata,
      []
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document upload ./report.pdf
  $ nexus document upload ./data.csv --description "Q4 sales data"
  $ nexus document upload ./faq-fr.md --metadata language=fr --metadata content_type=faq-mobile
  $ nexus document upload ./manual.txt --json

Notes:
  For .md/.txt files, YAML frontmatter (--- block at the top) is read as metadata
  server-side. Explicit --metadata flags override matching frontmatter keys.`
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

        const metadataFlags = opts.metadata as string[];
        const metadata = metadataFlags.length > 0 ? parseMetadataPairs(metadataFlags) : undefined;

        const doc = await client.documents.uploadFile(blob, fileName, opts.description, metadata);
        printSuccess("Document uploaded.", {
          id: doc.id,
          name: doc.name ?? fileName
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
    .option("--metadata <key=value...>", "Filterable metadata (repeatable).", collectMetadata, [])
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document create-text --name "FAQ" --content "Q: How do I...\\nA: You can..."
  $ cat content.md | nexus document create-text --name "Guide" --content -
  $ nexus document create-text --name "FAQ" --content - --metadata language=fr
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
        const metadataFlags = opts.metadata as string[];
        if (metadataFlags.length > 0) flags.metadata = parseMetadataPairs(metadataFlags);

        const body = mergeBodyWithFlags(base, flags);

        const doc = await client.documents.createText(asRequestBody<CreateTextDocumentBody>(body));
        printSuccess("Text document created.", {
          id: doc.id,
          name: doc.name
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
    // No commander default. `AddWebsiteDocumentBodySchema` declares
    // `mode: z.enum(["sitemap", "crawl"])` — required, and "single" is not one of
    // its values. The old default of "single" therefore made the bare command a
    // guaranteed 400, and it also overwrote the `mode` of every `--body`,
    // including this command's own example below.
    .option(`--mode <mode>`, `Crawl mode: ${CRAWL_MODES.join(" or ")}. Required`)
    .option(
      "--metadata <key=value...>",
      "Filterable metadata (repeatable); inherited by every crawled page.",
      collectMetadata,
      []
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document add-website --url https://docs.example.com --mode sitemap
  $ nexus document add-website --url https://example.com/page --mode crawl
  $ nexus document add-website --url https://docs.example.com --mode sitemap --metadata language=fr
  $ nexus document add-website --body '{"url":"https://example.com","mode":"sitemap"}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const metadataFlags = opts.metadata as string[];
        const mode = readStringField(opts.mode, base, "mode");
        if (mode === undefined) {
          console.error(
            `Error: --mode is required.\n  nexus document add-website --url <url> --mode <${CRAWL_MODES.join("|")}>`
          );
          process.exitCode = 1;
          return;
        }
        const body = mergeBodyWithFlags(base, {
          ...(opts.url !== undefined && { url: opts.url }),
          mode,
          ...(metadataFlags.length > 0 && { metadata: parseMetadataPairs(metadataFlags) })
        });

        const doc = await client.documents.addWebsite(asRequestBody<AddWebsiteDocumentBody>(body));
        printSuccess("Website document created.", {
          id: doc.id,
          name: doc.name
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
        printRecord(result, [
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

  // ── update ────────────────────────────────────────────────────────────
  document
    .command("update")
    .description("Update document metadata")
    .argument("<id>", "Document ID")
    .option("--name <name>", "Document name")
    .option("--description <text>", "Document description")
    .option(
      "--metadata <key=value...>",
      "Filterable metadata (repeatable). Re-run 'document reprocess' to re-index it.",
      collectMetadata,
      []
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document update doc-123 --name "Updated Report"
  $ nexus document update doc-123 --metadata language=fr
  $ nexus document update doc-123 --body '{"description":"Q4 report"}'

Notes:
  Metadata changes are re-indexed on the next 'nexus document reprocess <id>'.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        const metadataFlags = opts.metadata as string[];
        if (metadataFlags.length > 0) flags.metadata = parseMetadataPairs(metadataFlags);
        const body = mergeBodyWithFlags(base, flags);

        const doc = await client.documents.update(id, asRequestBody<UpdateDocumentBody>(body));
        printSuccess("Document updated.", { id: doc.id ?? id });
        // A metadata edit only writes the DB column; ZeroEntropy stays stale
        // until the document is reprocessed. Nudge the user so the change is
        // not silently invisible to search/retrieval.
        if (metadataFlags.length > 0) {
          printWarning(
            "Metadata changed but not yet searchable.",
            `Run:  nexus document reprocess ${id}`
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── download ──────────────────────────────────────────────────────────
  document
    .command("download")
    .description("Get a signed download URL for a document")
    .argument("<id>", "Document ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document download doc-123
  $ nexus document download doc-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.documents.getDownloadUrl(id);
        printRecord(result, [
          { key: "url", label: "URL" },
          { key: "fileName", label: "File Name" },
          { key: "mimeType", label: "MIME Type" },
          { key: "expiresIn", label: "Expires In (s)" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── children ──────────────────────────────────────────────────────────
  addPaginationOptions(
    document
      .command("children")
      .description("List child documents in a folder")
      .argument("<id>", "Folder document ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus document children doc-123
  $ nexus document children doc-123 --limit 20 --json`
      )
  ).action(async (id: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.documents.listChildren(id, getPaginationParams(opts));
      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "name", label: "NAME", width: 30 },
        { key: "type", label: "TYPE", width: 12 },
        { key: "status", label: "STATUS", width: 12 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── reprocess ─────────────────────────────────────────────────────────
  document
    .command("reprocess")
    .description("Reprocess a document for embedding/indexing")
    .argument("<id>", "Document ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document reprocess doc-123
  $ nexus document reprocess doc-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.documents.reprocess(id);
        printSuccess("Document reprocessing started.", { id, ...result });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create-folder ─────────────────────────────────────────────────────
  document
    .command("create-folder")
    .description("Create a document folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder document ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document create-folder --name "Reports"
  $ nexus document create-folder --name "Q4" --parent-id folder-123`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = { name: opts.name };
        if (opts.parentId !== undefined) flags.parentId = opts.parentId;
        const body = mergeBodyWithFlags(base, flags);

        const folder = await client.documents.createFolder(
          asRequestBody<CreateDocumentFolderBody>(body)
        );
        printSuccess("Folder created.", {
          id: folder.id,
          name: folder.name ?? opts.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create-google-sheet ───────────────────────────────────────────────
  document
    .command("create-google-sheet")
    .description("Import a Google Sheet as document(s)")
    .requiredOption("--name <name>", "Document name")
    .requiredOption("--url <url>", "Google Sheet URL")
    .option("--description <text>", "Document description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document create-google-sheet --name "Catalog" --url "https://docs.google.com/spreadsheets/d/..."
  $ nexus document create-google-sheet --body '{"name":"Catalog","url":"https://..."}'`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {
          name: opts.name,
          url: opts.url
        };
        if (opts.description !== undefined) flags.description = opts.description;
        const body = mergeBodyWithFlags(base, flags);

        const result = await client.documents.createGoogleSheet(
          asRequestBody<CreateGoogleSheetDocumentBody>(body)
        );
        printSuccess("Google Sheet imported.", {
          folderId: result.folder?.id,
          sheets: result.sheets?.length
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
