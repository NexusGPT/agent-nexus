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
import { bindCommand, enumOption } from "../contract-binding";
import { handleError, refuse } from "../errors";
import { printList, printRecord, printSuccess, printWarning } from "../output";
import { asRequestBody, mergeBodyWithFlags, readStringField, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { parseMetadataPairs } from "../util/metadata";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import { resolveInputValue } from "../util/stdin";
import {
  DOCUMENT_ADD_WEBSITE__BODY_MODE,
  DOCUMENT_ADD_WEBSITE_CONTRACT,
  DOCUMENT_LIST__PARAMS_STATUS,
  DOCUMENT_LIST__PARAMS_TYPE,
  DOCUMENT_LIST_CONTRACT
} from "./document.contract.generated";

/** Commander collector for repeatable `--metadata key=value` options. */
function collectMetadata(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * The crawl modes `POST /documents/website` accepts, TAKEN FROM THE CONTRACT
 * rather than typed again here.
 *
 * The list itself is generated from the Zod schema. `satisfies` keeps the old
 * guarantee on top of it: the SDK's own field still has to agree, so a contract
 * change the SDK has not followed stops compiling here rather than reaching the
 * server. The CLI advertised "single" for months; the contract has never
 * accepted it, and a hand-typed list is how that survived.
 */
const CRAWL_MODES =
  DOCUMENT_ADD_WEBSITE__BODY_MODE.contractValues satisfies readonly AddWebsiteDocumentBody["mode"][];

export function registerDocumentCommands(program: Command): void {
  const document = program.command("document").description("Manage knowledge documents");

  document.addHelpText(
    "after",
    `
A document holds the content; a collection only holds links to documents. So
everything here is about getting content INDEXED, and the status column is the
answer to almost every "why does retrieval find nothing".

  • READY IS THE ONLY STATUS THAT RETRIEVES. PENDING and PROCESSING are
    in-flight, ERROR is final. There is no COMPLETED and no PROCESSED — a poll
    loop waiting for either can only exit by timing out.
  • THREE COMMANDS PRODUCE A FOLDER, NOT A DOCUMENT. add-website,
    create-google-sheet and create-folder each return a FOLDER whose pages, tabs
    or files are its CHILDREN. The folder itself carries no text;
    "collection attach-documents" expands a folder id to every document under
    it (recursively) at attach time — a snapshot, so children added later must
    be attached themselves. List them with "nexus document children <folder-id>".
  • A 2xx MEANS THE WORK WAS ACCEPTED, NOT FINISHED. Poll the returned id with
    "nexus document get <id>" — and poll the field that moves for that shape.
    For a LEAF (a page, a tab, an uploaded file, a text document) poll status
    until READY. For a FOLDER poll processingProgress to 100 with errorChildren
    at 0.
  • processingProgress IS A CRAWL-FOLDER FIELD. Only a crawl writes it, and only
    onto the folder, so a leaf reports 0 for its whole life — READY included. A
    loop waiting for 100 on a leaf can only exit by timing out.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  const list = addPaginationOptions(
    document
      .command("list")
      .description("List documents")
      .option("--search <query>", "Search by name")
      .addOption(enumOption("--type <type>", "Filter by type", DOCUMENT_LIST__PARAMS_TYPE))
      .addOption(
        enumOption(
          "--status <status>",
          "Filter by status — READY is terminal success",
          DOCUMENT_LIST__PARAMS_STATUS
        )
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
waits for one can only ever exit by timing out.

Notes:
  THIS IS A FLAT LIST OF THE WHOLE KNOWLEDGE BASE, folders and their children
  alike, not a tree. --type FOLDER or WEBSITE_FOLDER isolates the containers;
  "nexus document children <id>" walks into one.

  IT DOES NOT SAY WHICH COLLECTION A DOCUMENT IS IN. That direction only goes
  the other way, through "nexus collection documents <collection-id>".

  Deleted documents never appear here, so a document that vanishes from this
  list was deleted, not merely unlinked from a collection.`
      )
  );

  list.action(async (opts) => {
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
  $ nexus document get 11111111-1111-4111-8111-111111111111
  $ nexus document get 11111111-1111-4111-8111-111111111111 --json

Notes:
  THIS IS THE POLL TARGET for every asynchronous import. Status READY is
  terminal success; ERROR is terminal failure.

  ON A LEAF DOCUMENT, POLL status — NOT Progress. processingProgress is written
  by the website crawler onto the FOLDER it creates, and by nothing else, so on
  a page, a tab, an uploaded file or a text document it reads 0 even once the
  document is READY. The Progress row here is that field: 0 on a leaf is normal
  and is not a stalled import.

  FOR A FOLDER, READ THE CHILD COUNTERS, NOT THE STATUS. A website folder flips
  to READY when the crawl finishes, while its pages are still PENDING and not
  yet indexed. --json exposes totalChildren, errorChildren and
  processingProgress; the folder is genuinely done when processingProgress is
  100 and errorChildren is 0.

  A FOLDER THAT REPORTS READY WITH ZERO CHILDREN FETCHED NOTHING. That is the
  shape a mis-specified crawl takes — see "document add-website".

  This does not return the document's text. Use "nexus document download <id>".`
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
  server-side. Explicit --metadata flags override matching frontmatter keys.

  UPLOADING IS NOT INDEXING. The document comes back PENDING and is embedded
  afterwards; poll "nexus document get <id>" for READY before attaching it or
  expecting a query to find it.

  THE UPLOAD LANDS IN THE KNOWLEDGE BASE, NOT IN A COLLECTION. Attach it with
  "nexus collection attach-documents <collection-id> --document-ids <id>".

  READ type; mimeType IS RESOLVED FROM THE FILENAME. This CLI sends the bytes
  with no content type declared, so the server resolves mimeType from the
  file's extension — a .pdf comes back "application/pdf", a .csv "text/csv".
  An extension it does not recognise still lands on the multipart default,
  "application/octet-stream", so mimeType is a hint and type is the answer:
  the server classifies the document itself and reports that as type.

  Metadata set here is what "collection query --filter" matches on. Adding it
  later needs a "document reprocess" to take effect, so set it now.`
    )
    .action(async (filePath: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const absPath = path.resolve(filePath);

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
  $ nexus document create-text --name "Guide" --content ./body.txt
  $ nexus document create-text --body '{"name":"FAQ","content":"..."}'

Notes:
  THIS IS THE RELIABLE WAY TO GET AWKWARD CONTENT IN. A page that a crawl cannot
  read, a PDF that extracts badly, a spreadsheet you would rather summarise —
  paste the text here instead of fighting the importer.

  Indexed asynchronously like every other document: poll "nexus document get
  <id>" for READY.

  --content takes literal text, A FILE PATH, or '-' for stdin, and there is an
  example of each above. A path is DETECTED, never declared: a value naming a
  readable file stores that file's contents, trimmed of leading and trailing
  whitespace. A path that does not resolve — a typo, a permission error, a
  directory — is stored as LITERAL TEXT with no error, so a document whose whole
  content is "./body.txt" means the file was not readable from here.
  Escape sequences
  in a shell string are passed through literally — pipe a file when the content
  has real newlines in it.`
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
  const addWebsite = document
    .command("add-website")
    .description("Crawl a website and create document(s)")
    .requiredOption("--url <url>", "Website URL")
    // No commander default. `AddWebsiteDocumentBodySchema` declares
    // `mode: z.enum(["sitemap", "crawl"])` — required, and "single" is not one of
    // its values. The old default of "single" therefore made the bare command a
    // guaranteed 400, and it also overwrote the `mode` of every `--body`,
    // including this command's own example below.
    .addOption(
      enumOption(
        "--mode <mode>",
        "Crawl mode. Required. See Notes — they are not interchangeable",
        DOCUMENT_ADD_WEBSITE__BODY_MODE
      )
    )
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
THE TWO MODES ARE NOT TWO SPEEDS OF THE SAME THING.

  crawl    Follows links outward from --url. config.max_depth defaults to 3 and
           config.max_pages to 500. This is the mode that discovers pages.
  sitemap  Fetches EXACTLY the URLs you list in config.urls, and nothing else.
           It does not read /sitemap.xml and it does not follow links.

config lives in --body; there are no flags for it.

Examples:
  $ nexus document add-website --url https://example.com --mode crawl
  $ nexus document add-website --body '{"url":"https://docs.example.com","mode":"crawl","config":{"max_depth":2,"max_pages":50}}'
  $ nexus document add-website --body '{"url":"https://docs.example.com","mode":"sitemap","config":{"urls":["https://docs.example.com/a","https://docs.example.com/b"]}}'
  $ nexus document add-website --url https://example.com --mode crawl --metadata language=fr

Notes:
  --mode sitemap WITHOUT config.urls FETCHES NOTHING AND STILL SUCCEEDS. The
  URL list is the whole input to that mode, so an empty one crawls zero pages;
  the folder is created, flips to READY, and holds no content. Verify with
  "nexus document children <folder-id>" — zero children is the symptom.

  THE RESPONSE ID IS A FOLDER, AND 201 MEANS THE CRAWL STARTED. Crawling runs in
  the background after the response is sent. Poll "nexus document get <id>"
  until processingProgress is 100 and errorChildren is 0.

  THE FOLDER REACHES READY BEFORE ITS PAGES ARE SEARCHABLE. Pages are created
  PENDING and indexed afterwards, so a READY folder is not proof that a query
  can find anything. Watch the children, not the folder's status.

  ONLY THE MAIN CONTENT OF EACH PAGE IS KEPT — navigation, headers and footers
  are stripped. A page whose substance lives in a sidebar or a nav menu stores
  little or nothing.

  EVERY RUN CREATES A NEW FOLDER. There is no re-crawl of an existing one, so
  running this twice on the same site leaves two copies in the knowledge base
  and both answer queries. Delete the old folder rather than crawling over it.

  --metadata is inherited by every crawled page, which is what makes
  "collection query --filter" usable across a whole site.

  The pages land in the KNOWLEDGE BASE, not in a collection. Attach the folder
  to one afterwards — "collection attach-documents" expands a folder id to all
  the pages under it at attach time. Pages crawled later are not pulled in;
  re-attach the folder to pick them up.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const metadataFlags = opts.metadata as string[];
        const mode = readStringField(opts.mode, base, "mode");
        if (mode === undefined) {
          // Both paths, because both work: the check above reads --body as well
          // as the flag. Naming only the flag is what makes an operator holding a
          // correct --body conclude the body form does not exist.
          process.exitCode = refuse(
            `--mode is required. Pass it as a flag, or as "mode" inside --body (the flag wins if you supply both).\n` +
              `  nexus document add-website --url <url> --mode <${CRAWL_MODES.join("|")}>\n` +
              `  nexus document add-website --body '{"url":"<url>","mode":"${CRAWL_MODES[0]}"}'`
          );
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
  $ nexus document preview 11111111-1111-4111-8111-111111111111
  $ nexus document preview 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE URL IS SIGNED AND EXPIRES — expiresIn says when, currently 3600 seconds.
  Never store it; re-run this command for a fresh one.

  Same object as "document download", without the Content-Disposition header,
  so a browser displays it inline. Documents with no stored file — text
  documents, crawled pages, folders — answer 404 on both.`
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
  confirmable(document.command("delete"))
    .description("Delete a document")
    .argument("<id>", "Document ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus document delete 11111111-1111-4111-8111-111111111111
  $ nexus document delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  THIS REMOVES THE DOCUMENT FROM EVERY COLLECTION HOLDING IT, not just the one
  you had in mind, and takes it out of the search index. Check first with
  "nexus document get <id> --json". To take a document out of ONE collection,
  use "nexus collection remove-document" instead.

  DELETING A FOLDER TAKES ITS CHILDREN WITH IT. Every page, tab or file beneath
  it goes too. List them first with "nexus document children <id>".

  A BIG FOLDER OUTLASTS THE 30s CLIENT TIMEOUT, AND THE SERVER KEEPS GOING. The
  timeout error means the CLI stopped waiting, never that the delete stopped —
  it carries on and lands PARTIALLY, so "document list" shrinks while you read
  the error. Do not treat it as a failed call and do not delete the children by
  hand. Re-run the same command with a longer budget until it returns:

    $ nexus document delete 22222222-2222-4222-8222-222222222222 --yes --timeout 180

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete document ${id}?`, opts))) return;

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
  $ nexus document update 11111111-1111-4111-8111-111111111111 --name "Updated Report"
  $ nexus document update 11111111-1111-4111-8111-111111111111 --metadata language=fr
  $ nexus document update 11111111-1111-4111-8111-111111111111 --body '{"description":"Q4 report"}'

Notes:
  METADATA CHANGES DO NOT REACH SEARCH UNTIL YOU REPROCESS. This writes the
  database column only; "collection query --filter" keeps matching the OLD
  values until "nexus document reprocess <id>" runs. The command prints a
  reminder when you pass --metadata.

  --metadata REPLACES THE WHOLE METADATA BAG, IT DOES NOT MERGE. Every key you
  do not repeat in this call is dropped, and nothing in the response says so.
  Read the current bag first — it is the "metadata" key of
  "nexus document get <id> --json" — then repeat every key it holds as its own
  --metadata flag alongside the one you are changing.

  This changes the document's labels, never its CONTENT. Replacing the text
  means uploading a new document, or reprocessing the source.`
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
  $ nexus document download 11111111-1111-4111-8111-111111111111
  $ nexus document download 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE URL IS SIGNED AND EXPIRES — expiresIn says when, currently 3600 seconds.
  Fetch it in the same run; a stored URL stops working and re-running this
  command is how you get a fresh one.

  ONLY DOCUMENTS WITH A STORED FILE HAVE ONE. A text document, a crawled page or
  a folder has no file behind it and answers 404 here. Read those through the
  dashboard or re-create them from the source.

  This is the same URL as "document preview", plus a Content-Disposition header
  so a browser saves it instead of displaying it.`
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
  $ nexus document children 11111111-1111-4111-8111-111111111111
  $ nexus document children 11111111-1111-4111-8111-111111111111 --limit 20 --json

Notes:
  THESE IDS ARE WHAT CARRY CONTENT. "collection attach-documents" accepts the
  folder id too — it expands to every document under the folder (recursively)
  at attach time. Use this list to attach a subset, or to see what a folder
  attach will expand to.

  ONE LEVEL ONLY. A nested folder appears as a row here, not as its contents —
  recurse if the tree is deeper than one level.

  THE FIRST PAGE IS 20 ROWS, AND A 100-CHILD CRAWL LOOKS COMPLETE AT 20. This
  is paginated with the same defaults as every v1 list — page 1, limit 20, and
  100 is the ceiling a larger --limit is refused against. Read meta before you
  act on the rows: --json carries {total, page, limit, totalPages, hasMore}, and
  hasMore is what separates "that is the folder" from "that is the first fifth
  of it". Attaching what you got here without walking the pages attaches a
  fraction of the crawl and nothing says so.

  THE NAME COLUMN IS BLANK FOR A CRAWLED HOME PAGE, AND THAT IS NOT AN ERROR. A
  crawled page is named after the LAST PATH SEGMENT of its URL, so
  /guides/setup is named "setup" and a bare domain root has nothing to take a
  name from. --json carries displayName beside it, which holds the page title —
  that is the field to read when NAME is empty or when two pages share a
  segment. Neither view returns the page's URL.

  A crawl or import in flight returns a growing list. Zero children on a folder
  that reports READY means the import fetched nothing.`
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
  $ nexus document reprocess 11111111-1111-4111-8111-111111111111
  $ nexus document reprocess 11111111-1111-4111-8111-111111111111 --json

Notes:
  RUN THIS AFTER EVERY METADATA EDIT. "document update --metadata" writes the
  database column only; the search index keeps the old values until a reprocess,
  so "collection query --filter" keeps filtering on what was there before.

  ASYNCHRONOUS. Success means re-indexing started. Poll "nexus document get <id>"
  for READY.

  A FOLDER ID IS REFUSED WITH A 400, NOT IGNORED. Only leaf documents are
  re-read, and naming a folder fails the call outright — so a sweep that walks a
  tree and reprocesses every id it meets dies on the first folder rather than
  skipping it. Name the page, tab or file; get the leaves from
  "nexus document children <folder-id>".

  This re-reads the source, so it is also how a Google Sheet tab picks up edits
  made in the spreadsheet.`
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
  $ nexus document create-folder --name "Q4" --parent-id 22222222-2222-4222-8222-222222222222

Notes:
  A FOLDER IS A DOCUMENT WITH NO CONTENT. It organizes the knowledge base and
  nothing else. It carries no text, so it retrieves nothing itself;
  "collection attach-documents" expands a folder id to the documents inside it
  (recursively) at attach time.

  add-website, create-google-sheet and create-folder all produce a FOLDER whose
  pages, tabs or files are its children. Only create-folder makes an empty one
  for you to fill.

  --parent-id must name a folder in YOUR organization; anything else is a 404,
  not a fallback to the root. Omit it to create at the root.

  Nesting is allowed: a folder can hold folders.`
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
  $ nexus document create-google-sheet --body '{"name":"Catalog","url":"https://...","metadata":{"hasHeaderRow":false}}'

Notes:
  THE SPREADSHEET MUST BE READABLE BY ANYONE WITH THE LINK. Nexus reads Google
  Sheets with a platform API key, NOT with your connected Google account, so a
  private or organization-restricted sheet fails however the account is
  connected. Share it "anyone with the link can view" first. (To import a
  private file instead, connect Drive and use "nexus cloud-import".)

  THE RESULT IS A FOLDER PLUS ONE DOCUMENT PER TAB. The folder holds no content;
  attaching it to a collection expands to the tab documents under it at attach
  time. The tabs are listed by "nexus document children <folder-id>".

  THE FOLDER IS MARKED READY IMMEDIATELY. The tabs are indexed in the
  background afterwards, so a READY folder says nothing about whether the rows
  are searchable. Poll the tab documents.

  A SNAPSHOT, NOT A LIVE LINK. Automatic re-sync is off for documents created
  through this API and cannot be turned on from here, so later edits to the
  spreadsheet are never picked up on their own. Refresh a tab with
  "nexus document reprocess <tab-id>" — passing the FOLDER id there is a 400,
  not a no-op, so loop over the tabs from "nexus document children".

  hasHeaderRow defaults to true — row 1 is read as column names, not as data.
  It is --body only, under "metadata".`
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

  // Bound LAST, after every option exists.
  bindCommand(list, DOCUMENT_LIST_CONTRACT);
  bindCommand(addWebsite, DOCUMENT_ADD_WEBSITE_CONTRACT);
}
