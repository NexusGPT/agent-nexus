import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { isJsonMode } from "../../output";
import { parseFilterPairs } from "../../util/metadata";
import { SKILLS_QUERY_COLLECTION_CONTRACT } from "../collection.contract.generated";

const QUERY_HELP = `
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

  metadata IS THE SNIPPET'S, NOT THE DOCUMENT'S. Without --include-metadata the
  collection's own includeMetadata setting decides: it is a literal null unless
  the collection turns metadata on. When present it is the retrieval provider's
  own snippet payload minus this pipeline's injected keys — and still null when
  the provider attached none. So a null never means "you forgot the flag", and
  a document whose stored metadata "document get" shows can answer null here
  with nothing having been dropped.

  Under --json this answers {results: [...]}, which is neither "collection
  list"'s bare array nor "collection documents"'s {data, meta}.`;

/** Commander collector for repeatable `--filter key=value` options. */
function collectFilter(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** `nexus collection query` — semantic content retrieval. */
export function registerCollectionQueryCommand(collection: Command, program: Command): Command {
  const leaf = collection
    .command("query")
    .description("Query a collection's content (semantic retrieval — not names)")
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
    .addHelpText("after", QUERY_HELP)
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

  bindCommand(leaf, SKILLS_QUERY_COLLECTION_CONTRACT);
  return leaf;
}
