import type { Command } from "commander";

import { registerDocumentAddWebsiteCommand } from "./document/add-website.command";
import { registerDocumentChildrenCommand } from "./document/children.command";
import { registerDocumentCreateFolderCommand } from "./document/create-folder.command";
import { registerDocumentCreateGoogleSheetCommand } from "./document/create-google-sheet.command";
import { registerDocumentCreateTextCommand } from "./document/create-text.command";
import { registerDocumentDeleteCommand } from "./document/delete.command";
import { registerDocumentDownloadCommand } from "./document/download.command";
import { registerDocumentGetCommand } from "./document/get.command";
import { registerDocumentListCommand } from "./document/list.command";
import { registerDocumentPreviewCommand } from "./document/preview.command";
import { registerDocumentReprocessCommand } from "./document/reprocess.command";
import { registerDocumentUpdateCommand } from "./document/update.command";
import { registerDocumentUploadCommand } from "./document/upload.command";

const DOCUMENT_HELP = `
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
    loop waiting for 100 on a leaf can only exit by timing out.`;

/**
 * `nexus document …` — the knowledge documents namespace.
 *
 * ## Which leaves are bound, and why the answer is not "the read-only ones"
 *
 * `bindCommand` now runs at the END of each leaf's own file, after that leaf's
 * options exist — the ordering the single call site at the foot of this file
 * used to give. WHICH leaves carry one is a decision about the namespace, so it
 * is recorded here, once, rather than six times.
 *
 * THE FOUR ID-TAKING READS — get, preview, download, children — are bound.
 * Binding them proves `method: "GET"` off the v1 contract, which is the only
 * thing `id-graph.ts` accepts as evidence that a leaf is safe for the
 * id-threaded sweep to call. Until that, all four sat in
 * `id-graph.uncovered.generated.ts` as `unbound-no-provable-method` — not
 * because they mutate, but because nothing had proved they do not.
 *
 * 🚨 ONLY TWO OF THE FOUR ARE SWEEPABLE, AND `preview`/`download` ARE BOUND
 * ANYWAY ON PURPOSE — DO NOT DELETE THOSE TWO `bindCommand` CALLS. Both route
 * through one `if (!document.storageUrl) throw new NotFoundException(...)`, so
 * they 404 for every folder, text document and crawled page — which
 * `document list` lists, and which the sweep threads because it takes the FIRST
 * row. A 404 on an id the producer is still listing is a FAILED row, and
 * `CLI: Sweep` gates staging, so that would red the repository on ordinary
 * tenant data.
 *
 * The binding is still right: it makes the method provable, ships
 * `--print-contract`, and is what lets `id-graph.leaf-residue.ts` classify them
 * `declared-unsweepable` — a DECLARED refusal with the reason at hand.
 * Unbinding them instead would return them to `unbound-no-provable-method`,
 * which is true by accident and reads as an invitation to bind them again.
 * Found by bugbot on PR #5680; the entry in `id-graph.leaf-residue.ts` owns the
 * evidence.
 *
 * `add-website` and `list` are bound as well. The four mutating leaves —
 * upload, update, delete, reprocess — are deliberately NOT bound. A binding
 * would make their methods provable and move them to `bound-but-mutates`, which
 * is a truer reason and still an excluded row: the sweep calls what it reaches,
 * and there is no read-only form of a DELETE to call instead. Binding them is a
 * help-text decision, not a coverage one, and it belongs to whoever makes it.
 *
 * 🚨 THE CALL ORDER BELOW IS THE PUBLISHED ORDER AND IS NOT ALPHABETICAL.
 * Commander emits `--help` in registration order and
 * `content/docs/cli/commands/document.mdx` is generated from that tree, so
 * sorting these calls rewrites a published page and reds
 * `cli-docs-are-generated`. The imports above are sorted because lint wants
 * them sorted; the CALLS keep the original order.
 */
export function registerDocumentCommands(program: Command): void {
  const document = program.command("document").description("Manage knowledge documents");

  document.addHelpText("after", DOCUMENT_HELP);

  registerDocumentListCommand(document, program);
  registerDocumentGetCommand(document, program);
  registerDocumentUploadCommand(document, program);
  registerDocumentCreateTextCommand(document, program);
  registerDocumentAddWebsiteCommand(document, program);
  registerDocumentPreviewCommand(document, program);
  registerDocumentDeleteCommand(document, program);
  registerDocumentUpdateCommand(document, program);
  registerDocumentDownloadCommand(document, program);
  registerDocumentChildrenCommand(document, program);
  registerDocumentReprocessCommand(document, program);
  registerDocumentCreateFolderCommand(document, program);
  registerDocumentCreateGoogleSheetCommand(document, program);
}
