import type { AddWebsiteDocumentBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, readStringField, resolveBody } from "../../util/body";
import { parseMetadataPairs } from "../../util/metadata";
import {
  DOCUMENT_ADD_WEBSITE__BODY_MODE,
  DOCUMENT_ADD_WEBSITE_CONTRACT
} from "../document.contract.generated";
import { collectMetadata } from "./collect-metadata";

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

const ADD_WEBSITE_HELP = `
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
  re-attach the folder to pick them up.`;

/** `nexus document add-website` */
export function registerDocumentAddWebsiteCommand(document: Command, program: Command): Command {
  const leaf = document
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
    .addHelpText("after", ADD_WEBSITE_HELP)
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
  bindCommand(leaf, DOCUMENT_ADD_WEBSITE_CONTRACT);
  return leaf;
}
