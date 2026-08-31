import type { CreateCollectionBody, UpdateCollectionBody } from "@agent-nexus/sdk";
import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import {
  isJsonMode,
  printList,
  printPaginationMeta,
  printRecord,
  printSuccess,
  printTable
} from "../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../util/body";
import { confirmable, confirmDestructive } from "../util/confirm";
import { parseIdList, parseRequiredIdList } from "../util/ids";
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
  • "attach-documents" EXPANDS A FOLDER TO ITS CONTENTS. A website folder, an
    imported Google Sheet folder or a plain folder attaches every document
    under it (recursively) as of that moment — the folder row itself is never
    linked, and documents added to the folder later are not pulled in.
  • Attaching and removing reach retrieval at DIFFERENT moments, and only one of
    them lags. Removing is immediate — it clears the cached document list every
    query is filtered by. Attaching is not, because the document still has to
    finish indexing, so "query" can lag an attach by minutes while
    "collection documents" is accurate immediately.`
  );

  // ── list ──────────────────────────────────────────────────────────────
  const list = collection
    .command("list")
    .description("List knowledge collections")
    .option("--search <query>", "Search by name")
    .option("--limit <number>", "Max results", parseInt)
    .option("--offset <number>", "Skip this many results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection list
  $ nexus collection list --search "product" --limit 10
  $ nexus collection list --limit 20 --offset 20
  $ nexus collection list --json

Notes:
  DOCS IS A STORED COUNTER, NOT A LIVE COUNT. Attaching and removing documents
  both rewrite it, but DELETING a document does not, so it reads high after
  "nexus document delete" until the next attach or remove. "nexus collection
  stats <id>" counts the links themselves.

  --search matches name, display name and description, case-insensitively.
  --limit DEFAULTS TO 20 AND IS CAPPED AT 100. Over 100 is a 400, not a clamp.

  PAGE WITH --offset, NOT WITH --page. The route counts from an offset rather
  than numbering pages, so page two of a 20-row page is "--limit 20 --offset 20".
  --offset DEFAULTS TO 0 and its floor is 0; a negative value is a 400.

  THE TOTAL PRINTS UNDER THE TABLE, AND IS HOW YOU KNOW WHEN TO STOP. Page until
  the "more available" mark is gone; do not stop on a short page, because a page
  can be short for other reasons.
  --json IS A BARE ARRAY ([] when empty), with no envelope and no meta — so the
  total is NOT in it, and a script that pages has to count what it has received
  against a total read some other way. Two siblings in this same namespace answer
  differently — "collection documents" is {data, meta} and "collection query" is
  {results} — so one jq expression cannot read all three.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const offset = typeof opts.offset === "number" ? opts.offset : 0;
        const result = await client.skills.listCollections({
          search: opts.search,
          limit: opts.limit,
          offset: opts.offset
        });

        const items = result.items ?? [];
        printTable(items, [
          { key: "id", label: "ID", width: 36 },
          { key: "name", label: "NAME", width: 25 },
          { key: "displayName", label: "DISPLAY NAME", width: 25 },
          { key: "documentCount", label: "DOCS", width: 6 }
        ]);
        // TABLE MODE ONLY — `printPaginationMeta` returns early under --json, and
        // that is the point: this command's documented JSON shape is a BARE ARRAY,
        // so adding a total to it would be a breaking change for every script
        // already reading it. Without the total an operator paging by --offset has
        // no way to know when to stop, which would make --offset half a feature.
        //
        // An ABSENT total supports no conclusion about further rows, so it is
        // reported as one. Defaulting it to 0 and comparing answers "exhausted",
        // and the operator stops paging believing they hold the whole collection.
        printPaginationMeta({
          total: result.total,
          paging:
            result.total === undefined
              ? "did-not-say"
              : offset + items.length < result.total
                ? "has-more"
                : "exhausted"
        });
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
  $ nexus collection get 11111111-1111-4111-8111-111111111111
  $ nexus collection get 11111111-1111-4111-8111-111111111111 --json

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
  $ nexus collection update 11111111-1111-4111-8111-111111111111 --display-name "Updated FAQ"
  $ nexus collection update 11111111-1111-4111-8111-111111111111 --k 20 --reranker zerank-1
  $ nexus collection update 11111111-1111-4111-8111-111111111111 --body '{"displayName":"Updated"}'

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
  const remove = confirmable(collection.command("delete"))
    .description("Delete a collection")
    .argument("<id>", "Collection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection delete 11111111-1111-4111-8111-111111111111
  $ nexus collection delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  THE DOCUMENTS SURVIVE. This deletes the collection and its document links.
  Every document stays in the knowledge base, keeps its place in any other
  collection, and is still listed by "nexus document list". Nothing here removes
  a document — use "nexus document delete" for that.

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete collection ${id}?`, opts))) return;

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
    .option("--include-metadata", "Include each document's stored search metadata")
    .addHelpText(
      "after",
      `
Matches document NAMES only (case-insensitive substring). To search document
CONTENT (the semantic retrieval your agents use), use "nexus collection query".

Examples:
  $ nexus collection search 11111111-1111-4111-8111-111111111111 --query "invoice"
  $ nexus collection search 11111111-1111-4111-8111-111111111111 --query "pricing" --limit 5 --json
  $ nexus collection search 11111111-1111-4111-8111-111111111111 --query "invoice" --include-metadata

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

  metadata IS A LITERAL null WITHOUT --include-metadata. With the flag it is the
  DOCUMENT's own attribute bag — the same one "nexus document get --json" prints
  under this same name — so it still reads null for a document that carries
  none. The flag on "collection query" fills the same field from a DIFFERENT
  source: the snippet's retrieval-provider payload, not the document's column.
  So a null here never means "you forgot the flag".

  READ IT UNDER --json. The table output is score and name only, so
  --include-metadata on its own changes nothing you can see.

  Only documents linked DIRECTLY to the collection are searched.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.searchCollection(id, {
          query: opts.query,
          limit: opts.limit,
          includeMetadata: opts.includeMetadata
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
  $ nexus collection query 11111111-1111-4111-8111-111111111111 --query "how do I reset my PIN?"
  $ nexus collection query 11111111-1111-4111-8111-111111111111 --query "carte SIM" --limit 5 --json
  $ nexus collection query 11111111-1111-4111-8111-111111111111 --query "réinitialiser le PIN" --filter language=fr
  $ nexus collection query 11111111-1111-4111-8111-111111111111 --query "roaming" --filter region=eu --filter region=us

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

  METADATA IS ALWAYS null HERE, and this is the only collection read where that
  is a property of the ROUTE rather than of your arguments: the multi-collection
  search schema carries no includeMetadata field and the server hardcodes the
  null. "collection search" and "collection query" both take --include-metadata,
  so reaching metadata means running one of those per collection.

  The results do not say which collection each hit came from. Search the
  collections one at a time when that matters.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const collectionIds = parseIdList(String(opts.collectionIds));
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
  $ nexus collection documents 11111111-1111-4111-8111-111111111111
  $ nexus collection documents 11111111-1111-4111-8111-111111111111 --limit 20 --json

Notes:
  DIRECT LINKS ONLY. Children of a linked document are not listed here even
  though retrieval reaches them — list those with "nexus document children <id>".

  This reads the database, so it is the authoritative answer right after an
  attach or a remove, in a way "collection query" is not.

  STATUS is the answer to "why does query return nothing": a document only
  contributes to retrieval once it reads READY.

  Soft-deleted documents are excluded, so a document deleted elsewhere leaves
  this list silently rather than appearing as a broken row.

  --json IS {data: [...], meta: {total, page, limit, totalPages, paging}}, NOT
  a bare array — and "collection list", the command beside it, IS a bare array.
  Read meta.paging here rather than counting the rows you got.`
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
    .requiredOption("--document-ids <ids>", "Comma-separated document IDs", (raw: string) =>
      parseRequiredIdList(raw, "--document-ids")
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection attach-documents 11111111-1111-4111-8111-111111111111 --document-ids 22222222-2222-4222-8222-222222222222,33333333-3333-4333-8333-333333333333

Notes:
  A DOCUMENT ID IS A UUID, AND THIS ROUTE IS THE ONE THAT DOES NOT SAY SO.
  AttachCollectionDocumentsBodySchema types documentIds as a plain string array,
  while "collection remove-document" types the same id as a UUID and refuses
  anything else with a 400. So a malformed id reaches the database here instead
  of being named at the edge — it lands in the all-or-nothing 404 below, which
  names no id.

  A FOLDER ID EXPANDS TO ITS CONTENTS. Any id naming a folder — FOLDER, a
  website folder from "document add-website", the folder an imported Google
  Sheet or a Google Drive import produces — attaches every document under it,
  recursively, as of that moment. The folder row itself is never linked, and
  documents added to the folder later are not pulled in; re-attach the folder
  to pick them up. An EMPTY folder attaches nothing and still succeeds.

  THE RESPONSE COUNTS NOTHING, SO IT CANNOT TELL YOU WHAT AN EXPANSION LINKED.
  It carries the collection id and nothing else — no attached count, no
  per-folder breakdown. The only proof is the read:
  "nexus collection documents <id>".

  ALL OR NOTHING ON EXISTENCE. If any id is unknown, deleted, or owned by
  another organization the whole call is a 404 and nothing is attached. The
  refusal NAMES the ids it could not resolve, each in quotes, and carries them
  again under error.details.missingDocumentIds for --json.

  WHITESPACE AND REPEATS ARE YOURS TO SPEND. This flag trims around every comma
  and drops the empty entries, so "doc-1, doc-2," sends two ids. A REPEATED id
  is one attachment, not a 404 — the route de-duplicates before it resolves.
  A list that is empty once trimmed is refused here, by name, with no request.

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
          // Already an array: the option's own parser split, trimmed and dropped
          // the empty entries, so the refusal for `--document-ids " , "` lands
          // before a request is built rather than as a 400 naming no flag.
          documentIds: opts.documentIds as string[]
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
  $ nexus collection remove-document 11111111-1111-4111-8111-111111111111 22222222-2222-4222-8222-222222222222

Notes:
  REMOVES THE LINK, NOT THE DOCUMENT. The document stays in the knowledge base,
  stays in every other collection holding it, and is still listed by
  "nexus document list". Use "nexus document delete" to remove the document.

  SUCCESS IS NOT EVIDENCE ANYTHING WAS REMOVED. This is idempotent: a document
  that was never in the collection reports removed just the same. Only
  "nexus collection documents <id>" answers whether the link is gone.

  RETRIEVAL STOPS AT THE NEXT QUERY. This route clears the link AND the cached
  membership that "collection query" and any agent reading this collection are
  filtered by, so the document is out of reach on the next query rather than
  minutes later. No flag is needed.

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
  $ nexus collection stats 11111111-1111-4111-8111-111111111111
  $ nexus collection stats 11111111-1111-4111-8111-111111111111 --json

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
