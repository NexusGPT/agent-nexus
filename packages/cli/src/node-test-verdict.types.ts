/**
 * THE VOCABULARY A SINGLE-NODE TEST IS JUDGED IN.
 *
 * Declared here rather than beside {@link import("./node-test-verdict").judgeNodeTest}
 * so the judge and the refusal printer can both name it without either importing
 * the other. `node-test-verdict.ts` carries the doctrine — why the verdict is
 * read from `data` and never from `status`, and why there are three outcomes
 * rather than two.
 */

/**
 * What a single-node test actually reports. A CLOSED union, so a caller cannot
 * handle the good arm and let both failures fall through a default — the shape
 * that produced the defect this module exists to close.
 */
export type NodeTestVerdict =
  /** The node ran and reported no error. The only arm that exits `0`. */
  | { readonly outcome: "passed" }
  /**
   * The node ran and FAILED. `message` is the executor's own message, read from
   * `data.error` or `data.errorDetails.message`; neither is guaranteed by the
   * SDK's type, so it falls back to a sentence rather than to `undefined`.
   */
  | { readonly outcome: "node-failed"; readonly message: string }
  /**
   * The test was dispatched to the background. `data` is `null` and there is no
   * outcome to judge. `status` is carried so the refusal can name what the
   * response actually said rather than asserting `"PENDING"`.
   */
  | { readonly outcome: "not-finished"; readonly status: string };

/** Every arm that is not a pass, so a caller that forgets to branch is a type error. */
export type FailedNodeTestVerdict = Exclude<NodeTestVerdict, { outcome: "passed" }>;
