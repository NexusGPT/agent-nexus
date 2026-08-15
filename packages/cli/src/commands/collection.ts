import type { CreateCollectionBody, UpdateCollectionBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import { isJsonMode, printList, printRecord, printSuccess, printTable } from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { parseFilterPairs } from "../util/metadata";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";
import {
  SKILLS_ATTACH_COLLECTION_DOCUMENTS_CONTRACT,
  SKILLS_CREATE_COLLECTION_CONTRACT,
  SKILLS_DELETE_COLLECTION_CONTRACT,
  SKILLS_GET_COLLECTION_CONTRACT,
  SKILLS_GET_COLLECTION_STATISTICS_CONTRACT,
  SKILLS_LIST_COLLECTION_DOCUMENTS_CONTRACT,
  SKILLS_LIST_COLLECTIONS_CONTRACT,
  SKILLS_QUERY_COLLECTION_CONTRACT,
  SKILLS_REMOVE_COLLECTION_DOCUMENT_CONTRACT,
  SKILLS_SEARCH_COLLECTION_CONTRACT,
  SKILLS_SEARCH_MULTIPLE_COLLECTIONS_CONTRACT,
  SKILLS_UPDATE_COLLECTION_CONTRACT
} from "./collection.contract.generated";

/** Commander collector for repeatable `--filter key=value` options. */
function collectFilter(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function registerCollectionCommands(program: Command): void {
  const collection = program.command("collection").description("Manage knowledge collections");

  collection.addHelpText(
    "after",
    `
A collection is a named set of DOCUMENT LINKS. It stores no content of its own,
so every write here changes which documents are reachable, never the documents.

Three facts decide whether a call does what you think:
  • "search" matches document NAMES. "query" matches document CONTENT and is the
    retrieval your agents run. Reaching for "search" to test whether a collection
    can answer a question returns nothing and looks like an empty collection.
    "search-multiple" is the multi-collection form of SEARCH — names, not content.
  • "attach-documents" SILENTLY DROPS FOLDER DOCUMENTS. A website folder, an
    imported Google Sheet folder or a plain folder is filtered out server-side
    and the call still reports success. Attach the child documents instead.
  • Attaching and removing are not visible to retrieval at the same moment. The
    document list this collection retrieves from is cached, so "query" can lag a
    write by minutes while "collection documents" is accurate immediately.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  const list = collection
    .command("list")
    .description("List knowledge collections")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection list
  $ nexus collection list --search "product" --limit 10
  $ nexus collection list --json

Notes:
  DOCS IS A STORED COUNTER, NOT A LIVE COUNT. It is rewritten when documents are
  attached and is NOT rewritten by "collection remove-document", so it reads high
  after a removal. "nexus collection stats <id>" counts the links themselves.

  --search matches name, display name and description, case-insensitively.
  --limit DEFAULTS TO 20 AND IS CAPPED AT 100. Over 100 is a 400, not a clamp.
  There is no --page on this command, so --limit is the only control.
  --json IS A BARE ARRAY ([] when empty), with no envelope and no meta. Two
  siblings in this same namespace answer differently — "collection documents" is
  {data, meta} and "collection query" is {results} — so one jq expression cannot
  read all three.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.listCollections({
          search: opts.search,
          limit: opts.limit
        });

        const items = result.items ?? [];
        printTable(items, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "displayName", label: "DISPLAY NAME", width: 25 },
          { key: "documentCount", label: "DOCS", width: 6 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────
  const get = collection
    .command("get")
    .description("Get collection details")
    .argument("<id>", "Collection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection get col-123
  $ nexus collection get col-123 --json

Notes:
  Reranker "none" means NO RERANKER IS SET, and retrieval then returns the raw
  similarity order. It is a model name when set, never a yes/no.

  k is how many chunks a query pulls. Documents is the same stored counter the
  list shows — "collection stats <id>" for the live number.

  This does not list the documents. Use "nexus collection documents <id>".`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const col = await client.skills.getCollection(id);
        printRecord(col, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "displayName", label: "Display Name" },
          { key: "description", label: "Description" },
          { key: "k", label: "k (results)" },
          // A model name, not a toggle — "yes" hid WHICH reranker was set.
          { key: "reranker", label: "Reranker", format: (v) => (v ? String(v) : "none") },
          { key: "documentCount", label: "Documents" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  const create = collection
    .command("create")
    .description("Create a knowledge collection")
    .requiredOption("--name <name>", "Collection name (unique slug)")
    .option("--display-name <name>", "Human-readable display name")
    .option("--description <text>", "Collection description")
    .option("--k <number>", "Number of results to retrieve", parseInt)
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection create --name "product-docs"
  $ nexus collection create --name "faq" --display-name "FAQ" --k 15
  $ nexus collection create --body '{"name":"faq","displayName":"FAQ"}'
  $ nexus collection create --body '{"name":"faq","preciseResponses":true,"includeMetadata":true}'

Notes:
  --name is a unique slug identifier. Use --display-name for the human-readable label.
  The uniqueness constraint on it is DATABASE-WIDE, not per organization, so a
  generic slug like "docs" can be refused because somebody else already took it.
  Prefer an organization-specific slug.

  --k defaults to 10 — the number of chunks retrieval pulls per query.

  k IS BOUNDED BELOW ONLY: an integer >= 1 with NO maximum. --k 0 is a 400
  reading "k: Too small: expected number to be >=1"; --k 9999 is accepted and
  stored verbatim, and every agent query on this collection then asks the
  retrieval provider for 9999 chunks. Nothing clamps it. A "k" inside --body
  must be a JSON number — "20" in quotes is a 400.

  reranker, preciseResponses and includeMetadata are --body ONLY here, with no
  flags, and the two booleans default to false. Setting them at create is the
  only way to avoid a follow-up "collection update" — which does carry a
  --reranker flag, unlike this command.

  THE CREATE RESPONSE ECHOES NOTHING YOU SET. Under --json it prints success,
  message, id and name and stops there: the server sends the whole stored
  collection back and this command keeps two fields of it. So a --body key that
  never landed and one that did print identically. Confirm the stored settings
  with "nexus collection get <id>".`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(opts.displayName !== undefined && { displayName: opts.displayName }),
          ...(opts.description !== undefined && { description: opts.description }),
          ...(opts.k !== undefined && { k: opts.k })
        });

        const col = await client.skills.createCollection(asRequestBody<CreateCollectionBody>(body));
        printSuccess("Collection created.", {
          id: col.id,
          name: col.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  const update = collection
    .command("update")
    .description("Update a collection")
    .argument("<id>", "Collection ID")
    .option("--display-name <name>", "Display name")
    .option("--description <text>", "Description")
    .option("--k <number>", "Number of results", parseInt)
    .option("--reranker <model>", "Reranking model name")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection update col-123 --display-name "Updated FAQ"
  $ nexus collection update col-123 --k 20 --reranker zerank-1
  $ nexus collection update col-123 --body '{"displayName":"Updated"}'

Notes:
  --reranker takes a reranking MODEL NAME, passed through to the retrieval
  provider. It is not an on/off switch, and "--reranker true" is rejected.

  Only the fields you send are written; everything you omit keeps its stored
  value. There is no way to clear --description or --reranker back to unset here.

  preciseResponses and includeMetadata are --body only, as on create.

  A "name" in --body IS ACCEPTED AND SILENTLY IGNORED. The slug is fixed at
  creation and this route does not carry it — the call returns success and the
  name is unchanged. Recreate the collection if you need a different slug.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.displayName !== undefined) flags.displayName = opts.displayName;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.k !== undefined) flags.k = opts.k;
        if (opts.reranker !== undefined) flags.reranker = opts.reranker;

        const body = mergeBodyWithFlags(base, flags);

        await client.skills.updateCollection(id, asRequestBody<UpdateCollectionBody>(body));
        printSuccess("Collection updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  const remove = collection
    .command("delete")
    .description("Delete a collection")
    .argument("<id>", "Collection ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection delete col-123
  $ nexus collection delete col-123 --yes

Notes:
  THE DOCUMENTS SURVIVE. This deletes the collection and its document links.
  Every document stays in the knowledge base, keeps its place in any other
  collection, and is still listed by "nexus document list". Nothing here removes
  a document — use "nexus document delete" for that.

  THE CONFIRMATION PROMPT ONLY APPEARS ON A TERMINAL. Piped, redirected or run
  in CI there is no prompt and no --yes is needed: the delete just happens.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!opts.yes && process.stdout.isTTY) {
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete collection ${id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        await client.skills.deleteCollection(id);
        printSuccess("Collection deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── search ────────────────────────────────────────────────────────────
  const search = collection
    .command("search")
    .description("Search a collection by document name (slug match — not content)")
    .argument("<id>", "Collection ID")
    .requiredOption("--query <query>", "Substring to match against document names")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Matches document NAMES only (case-insensitive substring). To search document
CONTENT (the semantic retrieval your agents use), use "nexus collection query".

Examples:
  $ nexus collection search col-123 --query "invoice"
  $ nexus collection search col-123 --query "pricing" --limit 5 --json

Notes:
  EVERY HIT SCORES 1.000. This endpoint does not rank — the score column is a
  constant, not a relevance figure, and a run of 1.000s is not a run of perfect
  matches. Use "collection query" whenever ranking means anything to you.

  --query is a case-insensitive SUBSTRING of the document name. It is not a
  glob, not a regex and not tokenised, so "reset PIN" matches only a name that
  literally contains "reset PIN". --limit defaults to 10.

  A CRAWLED PAGE IS NAMED AFTER THE LAST SEGMENT OF ITS URL, so this command
  finds /guides/setup by "setup" and CANNOT find a home page at all — a bare
  domain root has no segment and is stored with an empty name. A collection
  built from a website crawl therefore looks empty here while answering
  "collection query" perfectly. Search CONTENT for crawled material.

  METADATA COMES BACK null and no flag on this command changes that. The
  --include-metadata flag belongs to "collection query".

  Only documents linked DIRECTLY to the collection are searched.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.searchCollection(id, {
          query: opts.query,
          limit: opts.limit
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const results = result.results ?? result;
          if (Array.isArray(results)) {
            for (const r of results) {
              console.log(
                `─ ${r.score?.toFixed(3) ?? "N/A"}  ${r.text?.slice(0, 100) ?? JSON.stringify(r).slice(0, 100)}...`
              );
            }
          } else {
            console.log(JSON.stringify(result, null, 2));
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── query (semantic content retrieval) ─────────────────────────────────
  const query = collection
    .command("query")
    .description("Query a collection's content (semantic retrieval via ZeroEntropy)")
    .argument("<id>", "Collection ID")
    .requiredOption("--query <query>", "Natural-language question or phrase")
    .option("--limit <number>", "Max results", parseInt)
    .option("--include-metadata", "Include document metadata in results")
    .option(
      "--filter <key=value...>",
      "Restrict retrieval to documents matching metadata (repeatable).",
      collectFilter,
      []
    )
    .addHelpText(
      "after",
      `
Searches document CONTENT — the same retrieval path your agents use at runtime.
Use this (not "search") to verify a collection actually answers a question.
--filter constrains retrieval to matching documents. Repeat a key to match any
of several values: --filter region=eu --filter region=us (region in [eu, us]).

Examples:
  $ nexus collection query col-123 --query "how do I reset my PIN?"
  $ nexus collection query col-123 --query "carte SIM" --limit 5 --json
  $ nexus collection query col-123 --query "réinitialiser le PIN" --filter language=fr
  $ nexus collection query col-123 --query "roaming" --filter region=eu --filter region=us

Notes:
  EMPTY RESULTS STRAIGHT AFTER ATTACHING USUALLY MEAN INDEXING, NOT AN EMPTY
  COLLECTION. A document is linked the moment it is attached and answers nothing
  until it finishes embedding. Re-run once "collection documents <id>" shows it
  READY, and give the collection's cached membership a few minutes to catch up.

  Retrieval is RECURSIVE: a document's children are searched too, so results can
  cite documents "collection documents <id>" never lists.

  --limit overrides the collection's k FOR THIS CALL ONLY; it does not change
  what your agents retrieve. Change that with "collection update --k".

  --filter only reaches metadata that has been INDEXED. A metadata edit made
  with "document update" needs "document reprocess <id>" before it filters.

  --filter MATCHES SCALAR METADATA ONLY. An attribute stored as an ARRAY is not
  filterable, and asking for one is not an error — it returns zero results,
  which looks exactly like an empty collection or a bad query. Drop the filter
  and re-run: if the documents come back, the attribute was an array.

  THERE IS NO DOCUMENT NAME ON A RESULT. It is content, score, documentId and
  metadata. Mapping a hit back to something readable takes a second call,
  "nexus document get <documentId>". "collection search" does return
  documentName, so a reader arriving from that command finds the field missing
  here rather than renamed.

  metadata IS THE SNIPPET'S, NOT THE DOCUMENT'S, and it is a literal null
  without --include-metadata. With the flag it is the retrieval provider's own
  snippet payload minus this pipeline's injected keys — and still null when the
  provider attached none. So a null never means "you forgot the flag", and a
  document whose stored metadata "document get" shows can answer null here with
  nothing having been dropped.

  Under --json this answers {results: [...]}, which is neither "collection
  list"'s bare array nor "collection documents"'s {data, meta}.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const filterFlags = opts.filter as string[];
        const result = await client.skills.queryCollection(id, {
          query: opts.query,
          limit: opts.limit,
          includeMetadata: opts.includeMetadata,
          ...(filterFlags.length > 0 && { metadataFilter: parseFilterPairs(filterFlags) })
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const results = result.results ?? result;
          if (Array.isArray(results)) {
            for (const r of results) {
              console.log(
                `─ ${r.score?.toFixed(3) ?? "N/A"}  ${r.content?.slice(0, 100) ?? JSON.stringify(r).slice(0, 100)}...`
              );
            }
          } else {
            console.log(JSON.stringify(result, null, 2));
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── search-multiple ───────────────────────────────────────────────────
  const searchMultiple = collection
    .command("search-multiple")
    .description("Search several collections by document name (slug match — not content)")
    .requiredOption("--query <query>", "Substring to match against document names")
    .requiredOption("--collection-ids <ids>", "Comma-separated collection IDs")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Matches document NAMES, exactly like "nexus collection search" — this is the
multi-collection form of SEARCH, not of "query". There is no multi-collection
content retrieval: to search CONTENT across several collections, run
"nexus collection query" once per collection.

Examples:
  $ nexus collection search-multiple --query "pricing" --collection-ids col-1,col-2
  $ nexus collection search-multiple --query "reset password" --collection-ids col-1 --limit 5 --json

Notes:
  EVERY HIT SCORES 1.000 here too — this endpoint does not rank.

  METADATA IS ALWAYS null, HERE AND ON "collection search". Both name-matching
  commands return the field present and empty, and neither takes a flag that
  fills it. --include-metadata lives on "nexus collection query" — the CONTENT
  retrieval command — so reaching metadata means changing which search you run,
  not adding a flag to this one.

  The results do not say which collection each hit came from. Search the
  collections one at a time when that matters.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const collectionIds = opts.collectionIds.split(",").map((id: string) => id.trim());
        const result = await client.skills.searchMultipleCollections({
          query: opts.query,
          collectionIds,
          limit: opts.limit
        });

        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const results = result.results ?? result;
          if (Array.isArray(results)) {
            for (const r of results) {
              console.log(
                `─ ${r.score?.toFixed(3) ?? "N/A"}  ${r.text?.slice(0, 100) ?? JSON.stringify(r).slice(0, 100)}...`
              );
            }
          } else {
            console.log(JSON.stringify(result, null, 2));
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── documents ──────────────────────────────────────────────────────────
  const documents = addPaginationOptions(
    collection
      .command("documents")
      .description("List documents in a collection")
      .argument("<id>", "Collection ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus collection documents col-123
  $ nexus collection documents col-123 --limit 20 --json

Notes:
  DIRECT LINKS ONLY. Children of a linked document are not listed here even
  though retrieval reaches them — list those with "nexus document children <id>".

  This reads the database, so it is the authoritative answer right after an
  attach or a remove, in a way "collection query" is not.

  STATUS is the answer to "why does query return nothing": a document only
  contributes to retrieval once it reads READY.

  Soft-deleted documents are excluded, so a document deleted elsewhere leaves
  this list silently rather than appearing as a broken row.

  --json IS {data: [...], meta: {total, page, limit, totalPages, hasMore}}, NOT
  a bare array — and "collection list", the command beside it, IS a bare array.
  Read meta.hasMore here rather than counting the rows you got.`
      )
  );

  documents.action(async (id: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.skills.listCollectionDocuments(
        id,
        getPaginationParams(opts)
      );

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

  // ── attach-documents ───────────────────────────────────────────────────
  const attachDocuments = collection
    .command("attach-documents")
    .description("Attach documents to a collection")
    .argument("<id>", "Collection ID")
    .requiredOption("--document-ids <ids>", "Comma-separated document IDs")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection attach-documents col-123 --document-ids doc-1,doc-2,doc-3

Notes:
  SILENTLY DROPS FOLDER DOCUMENTS. Any id naming a folder — FOLDER, a website
  folder from "document add-website", the folder an imported Google Sheet or a
  Google Drive import produces — is filtered out server-side, and the call still
  succeeds. Attach the CHILDREN instead: "nexus document children <folder-id>".
  Passing only folder ids attaches nothing at all and still succeeds.

  THE RESPONSE COUNTS NOTHING, SO IT CANNOT TELL YOU WHAT WAS DROPPED. It
  carries the collection id and nothing else — no attached count, no rejected
  list — so "it worked" and "every id I sent was a folder" print the same line.
  The only proof is the read: "nexus collection documents <id>".

  ALL OR NOTHING ON EXISTENCE. If any id is unknown, deleted, or owned by
  another organization the whole call is a 404 and nothing is attached.

  ATTACH DOCUMENTS THAT ARE READY. A PENDING or PROCESSING document links
  without error and contributes nothing to retrieval until it finishes; an ERROR
  document never will. Check first with "nexus document get <id>".

  Re-attaching an already-attached document is a no-op, not an error, so this
  command is safe to re-run.

  Verify with "nexus collection documents <id>" — that read is immediate, while
  "collection query" can lag by minutes behind the attach.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.skills.attachDocumentsToCollection(id, {
          documentIds: opts.documentIds.split(",")
        });
        printSuccess("Documents attached to collection.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── remove-document ────────────────────────────────────────────────────
  const removeDocument = collection
    .command("remove-document")
    .description("Remove a document from a collection")
    .argument("<id>", "Collection ID")
    .argument("<document-id>", "Document ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection remove-document col-123 doc-456

Notes:
  REMOVES THE LINK, NOT THE DOCUMENT. The document stays in the knowledge base,
  stays in every other collection holding it, and is still listed by
  "nexus document list". Use "nexus document delete" to remove the document.

  SUCCESS IS NOT EVIDENCE ANYTHING WAS REMOVED. This is idempotent: a document
  that was never in the collection reports removed just the same. Only
  "nexus collection documents <id>" answers whether the link is gone.

  RETRIEVAL KEEPS ANSWERING FROM THE REMOVED DOCUMENT FOR A WHILE. The
  collection's membership is cached; this route clears the link in the database
  but not that cache, so "collection query" and any agent reading this
  collection can keep returning the document until the entry expires — up to 15
  minutes. There is no flag to force it. Removing a document from an agent's
  reach IMMEDIATELY means deleting the document, not unlinking it.

  Removing every document leaves an empty collection, not a deleted one.`
    )
    .action(async (id: string, documentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.skills.removeCollectionDocument(id, documentId);
        printSuccess("Document removed from collection.", { id, documentId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── stats ──────────────────────────────────────────────────────────────
  const stats = collection
    .command("stats")
    .description("Get collection statistics")
    .argument("<id>", "Collection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection stats col-123
  $ nexus collection stats col-123 --json

Notes:
  Counted live from the current links, so this is accurate the instant an attach
  or remove returns — unlike the DOCS column of "collection list".

  embeddedCount is the documents that are actually retrievable. documentCount
  minus embeddedCount minus pendingCount is the number that ERRORED, and those
  never contribute to a query no matter how long you wait.

  DIRECT LINKS ONLY, so these counts do not include the children retrieval
  reaches. lastUpdatedAt is null for an empty collection.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const stats = await client.skills.getCollectionStatistics(id);
        printRecord(stats);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(list, SKILLS_LIST_COLLECTIONS_CONTRACT);
  bindCommand(get, SKILLS_GET_COLLECTION_CONTRACT);
  bindCommand(create, SKILLS_CREATE_COLLECTION_CONTRACT);
  bindCommand(update, SKILLS_UPDATE_COLLECTION_CONTRACT);
  bindCommand(remove, SKILLS_DELETE_COLLECTION_CONTRACT);
  bindCommand(search, SKILLS_SEARCH_COLLECTION_CONTRACT);
  bindCommand(query, SKILLS_QUERY_COLLECTION_CONTRACT);
  bindCommand(searchMultiple, SKILLS_SEARCH_MULTIPLE_COLLECTIONS_CONTRACT);
  bindCommand(attachDocuments, SKILLS_ATTACH_COLLECTION_DOCUMENTS_CONTRACT);
  bindCommand(removeDocument, SKILLS_REMOVE_COLLECTION_DOCUMENT_CONTRACT);
  bindCommand(stats, SKILLS_GET_COLLECTION_STATISTICS_CONTRACT);
  bindCommand(documents, SKILLS_LIST_COLLECTION_DOCUMENTS_CONTRACT);
}
