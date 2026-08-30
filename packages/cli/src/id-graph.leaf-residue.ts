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
  | "exit-carries-resource-state";

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
  }
];

/** The declared reason a leaf cannot be swept, or `undefined`. */
export function leafResidueFor(leaf: string): LeafResidueEntry | undefined {
  return LEAF_RESIDUE.find((entry) => entry.leaf === leaf);
}
