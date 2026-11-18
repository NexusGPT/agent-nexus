import { color } from "../../output";
import type { McpCallResult } from "./call-wire";

/**
 * Print a successful tool result for a human.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * IT PRINTS, AND THAT IS WHY IT IS NOT A DESCRIPTOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Its two siblings — `resolveMcpCallInputs` and `describeMcpCallFailure` — return
 * descriptors so the ERROR document stays visible at the leaf's exit. This one is
 * the opposite case: it is the body of `printEnvelope`'s human callback, which is
 * the one path `--json` does not take at all. There is no document to keep in
 * sight, so a descriptor here would buy nothing and would only make the caller
 * re-walk a shape to print it.
 *
 * 🔴 IT MUST STAY INSIDE `printEnvelope`'s CALLBACK. Called beside it, this writes
 * to stdout under `--json` as well, and a second document on the stream a script
 * parses is the defect `json-one-document.test.ts` exists to catch.
 *
 * ## The media blocks are COUNTED, never rendered
 *
 * A base64 image on a terminal is noise, and the operator who wants it has
 * `--json`. So the count plus that pointer is the whole of it — and the blank line
 * before it is there because the tool's own text is unbounded and may end
 * mid-sentence.
 */
export function renderMcpCallResult(result: McpCallResult): void {
  console.log(color.bold(result.toolName));
  console.log(result.text);

  if (result.mediaBlocks.length > 0) {
    console.log();
    console.log(
      color.dim(
        `${String(result.mediaBlocks.length)} image block(s) returned — read --json for the base64 data.`
      )
    );
  }
}
