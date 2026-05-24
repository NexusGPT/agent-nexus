import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { isJsonMode, printList, printRecord, printSuccess, printTable } from "../output";
import { mergeBodyWithFlags, resolveBody } from "../util/body";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

export function registerCollectionCommands(program: Command): void {
  const collection = program.command("collection").description("Manage knowledge collections");

  // ── list ──────────────────────────────────────────────────────────────
  collection
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
  $ nexus collection list --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.skills.listCollections({
          search: opts.search,
          limit: opts.limit
        });

        const items = (result as any).items ?? [];
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
  collection
    .command("get")
    .description("Get collection details")
    .argument("<id>", "Collection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection get col-123
  $ nexus collection get col-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const col = await client.skills.getCollection(id);
        printRecord(col as unknown as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "displayName", label: "Display Name" },
          { key: "description", label: "Description" },
          { key: "k", label: "k (results)" },
          { key: "reranker", label: "Reranker", format: (v) => (v ? "yes" : "no") },
          { key: "documentCount", label: "Documents" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────────
  collection
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

Notes:
  --name is a unique slug identifier. Use --display-name for the human-readable label.`
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

        const col = await client.skills.createCollection(body as any);
        printSuccess("Collection created.", {
          id: (col as any).id,
          name: (col as any).name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── update ────────────────────────────────────────────────────────────
  collection
    .command("update")
    .description("Update a collection")
    .argument("<id>", "Collection ID")
    .option("--display-name <name>", "Display name")
    .option("--description <text>", "Description")
    .option("--k <number>", "Number of results", parseInt)
    .option("--reranker <bool>", "Enable reranker (true/false)")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection update col-123 --display-name "Updated FAQ"
  $ nexus collection update col-123 --k 20 --reranker true
  $ nexus collection update col-123 --body '{"displayName":"Updated"}'`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.displayName !== undefined) flags.displayName = opts.displayName;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.k !== undefined) flags.k = opts.k;
        if (opts.reranker !== undefined) flags.reranker = opts.reranker === "true";

        const body = mergeBodyWithFlags(base, flags);

        await client.skills.updateCollection(id, body as any);
        printSuccess("Collection updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────
  collection
    .command("delete")
    .description("Delete a collection")
    .argument("<id>", "Collection ID")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection delete col-123
  $ nexus collection delete col-123 --yes`
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
  collection
    .command("search")
    .description("Search a collection")
    .argument("<id>", "Collection ID")
    .requiredOption("--query <query>", "Search query")
    .option("--limit <number>", "Max results", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection search col-123 --query "how to reset password"
  $ nexus collection search col-123 --query "pricing" --limit 5 --json`
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
          const results = (result as any).results ?? result;
          if (Array.isArray(results)) {
            for (const r of results) {
              console.log(
                `─ ${(r as any).score?.toFixed(3) ?? "N/A"}  ${(r as any).content?.slice(0, 100) ?? JSON.stringify(r).slice(0, 100)}...`
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
  addPaginationOptions(
    collection
      .command("documents")
      .description("List documents in a collection")
      .argument("<id>", "Collection ID")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus collection documents col-123
  $ nexus collection documents col-123 --limit 20 --json`
      )
  ).action(async (id: string, opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const result = await (client.skills as any).listCollectionDocuments(
        id,
        getPaginationParams(opts)
      );
      const data = (result as any).data ?? (result as any).items ?? result;
      const meta = (result as any).meta;

      printList(Array.isArray(data) ? data : [data], meta, [
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
  collection
    .command("attach-documents")
    .description("Attach documents to a collection")
    .argument("<id>", "Collection ID")
    .requiredOption("--document-ids <ids>", "Comma-separated document IDs")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection attach-documents col-123 --document-ids doc-1,doc-2,doc-3`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await (client.skills as any).attachDocumentsToCollection(id, {
          documentIds: opts.documentIds.split(",")
        });
        printSuccess("Documents attached to collection.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── remove-document ────────────────────────────────────────────────────
  collection
    .command("remove-document")
    .description("Remove a document from a collection")
    .argument("<id>", "Collection ID")
    .argument("<document-id>", "Document ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection remove-document col-123 doc-456`
    )
    .action(async (id: string, documentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await (client.skills as any).removeCollectionDocument(id, documentId);
        printSuccess("Document removed from collection.", { id, documentId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── stats ──────────────────────────────────────────────────────────────
  collection
    .command("stats")
    .description("Get collection statistics")
    .argument("<id>", "Collection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus collection stats col-123
  $ nexus collection stats col-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const stats = await (client.skills as any).getCollectionStatistics(id);
        printRecord(stats as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
