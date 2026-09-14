/**
 * LEAVES THAT CANNOT BE SWEPT BLIND FOR A REASON THAT IS NOT ABOUT THEIR IDS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS SEPARATE FROM `id-graph.residue.ts`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That file answers "this PARAM has no producer". This one answers "this LEAF
 * cannot be exercised at all", which is a different shape: `workspace search`
 * resolves its `slug` perfectly well and still cannot be called, because it
 * needs a search term nothing can invent.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 EVERY ROW HERE WAS MEASURED AGAINST LIVE STAGING, NOT REASONED OUT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Each one arrived as a FAILED row in a real CI run of `CLI: Sweep`, and each was
 * a FALSE failure: the route was healthy and the harness had called it wrong. A
 * false FAILED is worse than an honest skip — it sends somebody to debug a
 * working route — and on a gating check it reds every PR in the repository until
 * somebody rips the gate out. That is the cost this file exists to avoid.
 *
 * The `evidence` field carries the refusal VERBATIM, so a reader can tell a row
 * that is still true from one that was fixed upstream.
 *
 * ⚠️ A ROW HERE IS A CLAIM ABOUT A COMMAND THAT MAY CHANGE. If a leaf later
 * declares its requirement in a way commander can see (a `.requiredOption()`),
 * the derivation catches it and this row becomes dead weight. There is no
 * mechanical check for that, which is the honest limit of this table.
 */

export type LeafResidueReason =
  /**
   * The leaf needs an input it does not DECLARE — hand-rolled cross-field
   * validation commander cannot express, typically an OR ("pass A or B").
   *
   * The derivation reads `.requiredOption()` and sees nothing here, because
   * there is nothing to see: commander has no way to say "one of these two".
   */
  | "undeclared-required-input"
  /**
   * 🚨 THE EXIT CODE CARRIES THE RESOURCE'S STATE, NOT THE ROUTE'S HEALTH.
   *
   * This is the general rule, and it is the CLI's own documented contract rather
   * than an inference: `execution poll --help` says "THE EXIT CODE CARRIES
   * status … A COMPLETED run exits 0 and a FAILED one exits non-zero."
   *
   * Such a leaf cannot be swept blind IN EITHER DIRECTION. Its non-zero is not
   * evidence the route is broken — it is evidence the execution failed, which is
   * the command working perfectly. And its ZERO is not evidence the route is
   * healthy either; it only means the resource happened to be in the good state.
   * A sweep of it measures the fixture, never the endpoint.
   *
   * Nothing in the Public API v1 contract declares this property, so it cannot
   * be derived and has to be declared. The alternative — a per-leaf table of
   * "expected" exit codes — would be a second, unchecked opinion about a
   * vocabulary `src/exit-codes.ts` already owns.
   */
  | "exit-carries-resource-state"
  /**
   * 🚨 THE ROUTE IS A READ, AND IT ANSWERS 404 FOR A WHOLE CLASS OF THE IDS ITS
   * OWN PRODUCER LISTS.
   *
   * The leaf is bound, the contract says `GET`, the id threads perfectly, and
   * the call still fails — because success is conditional on a PROPERTY of the
   * resource the id names, and the producer offers no way to select for it. The
   * sweep takes `usable[0]` (`id-graph.thread.ts`), so the verdict is decided by
   * whichever row the list happened to return first.
   *
   * ⚠️ THIS IS NOT `exit-carries-resource-state`, AND CONFLATING THEM LOSES THE
   * DISTINCTION THAT MATTERS. There the command reports a resource's status and
   * is working perfectly when it exits non-zero. Here the ROUTE returns a real
   * 404 that the harness is right to call a failure — the defect is that the
   * harness cannot ask for an id the route can serve.
   *
   * A 404 on an id the producer is STILL LISTING is a `FAILED` row, not a skip,
   * so this shape reds a gating check intermittently on ordinary tenant data.
   * That is strictly worse than the coverage it buys.
   */
  | "route-conditional-on-resource-shape";

export interface LeafResidueEntry {
  readonly leaf: string;
  readonly reason: LeafResidueReason;
  /** The refusal, verbatim, from the run that found it. */
  readonly evidence: string;
  readonly because: string;
}

export const LEAF_RESIDUE: readonly LeafResidueEntry[] = [
  {
    leaf: "workspace search",
    reason: "undeclared-required-input",
    evidence: "Provide --query and/or at least one --frontmatter key=value filter to search.",
    because:
      "A search needs a search term, and no id graph can invent one. The requirement is an OR " +
      "across two flags, which commander cannot express as a `.requiredOption()`, so the " +
      "derivation reads zero mandatory options and admits the leaf. It also refuses with the " +
      "GENERIC failure code rather than `invalid-input`, so the runtime category rule does not " +
      "catch it either — this row is the only thing standing between it and a false FAILED."
  },
  {
    leaf: "chat status",
    reason: "undeclared-required-input",
    evidence: "This command needs the conversation it is about: pass --session-token or --chat-id.",
    because:
      "Needs a conversation, identified either way. An OR across two flags again, so nothing " +
      "static sees it. It DOES refuse with `invalid-input`, so the runtime rule would skip it " +
      "correctly — this row keeps it out of the population entirely, which costs one live call " +
      "less per run and states the reason where a reader will find it."
  },
  {
    leaf: "chat resume",
    reason: "undeclared-required-input",
    evidence: "This command needs the conversation it is about: pass --session-token or --chat-id.",
    because:
      "Same conversation requirement as `chat status`, and the same OR commander cannot express."
  },
  {
    leaf: "execution diagnose",
    reason: "exit-carries-resource-state",
    evidence: "Execution e530d967-0afc-4c32-82cc-db074e358e63 FAILED.",
    because:
      "It exits non-zero because the execution it diagnosed had FAILED, which is the command " +
      "doing its job. Threading it a discovered execution id means the verdict is decided by " +
      "whichever run the list happened to return first, so the same healthy route reds or greens " +
      "by luck. See the reason's docblock for why a zero here would be no better."
  },
  {
    leaf: "document preview",
    reason: "route-conditional-on-resource-shape",
    evidence: "This document does not have a downloadable file",
    because:
      "🚨 THE `evidence` ABOVE IS READ FROM THE HANDLER, NOT FROM A SWEEP RUN, which is a " +
      "deviation from this file's header and is stated rather than hidden. It is the verbatim " +
      "`NotFoundException` message in " +
      "`apps/backend/src/documents/application/use-cases/shared/resolve-document-signed-url.ts`, " +
      "which both `getPreviewUrl` and `getDownloadUrl` route through: `if (!document.storageUrl) " +
      "throw new NotFoundException(...)`. " +
      "`Document.storageUrl` is nullable in `schema.prisma`, and `DocumentsService.createFolder` " +
      "writes no `storageUrl` and then sets status READY — so a folder is listed, READY, and 404s " +
      "here. `add-website` and `create-google-sheet` both return folders too. The v1 `list` " +
      "`where` filters scope and `deletedAt` only, so nothing excludes them, and the sweep passes " +
      "no filters. This leaf's own `--help` already said it: \"A text document, a crawled page or " +
      'a folder has no file behind it and answers 404 here."'
  },
  {
    leaf: "document download",
    reason: "route-conditional-on-resource-shape",
    evidence: "This document does not have a downloadable file",
    because:
      "The same single function and the same branch as `document preview` — the two differ only " +
      "in `attachFileName`, so they are one hazard with two names and neither can be swept while " +
      "the other cannot."
  }
];

/** The declared reason a leaf cannot be swept, or `undefined`. */
export function leafResidueFor(leaf: string): LeafResidueEntry | undefined {
  return LEAF_RESIDUE.find((entry) => entry.leaf === leaf);
}
