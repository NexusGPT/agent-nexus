import { CLI_INVALID_ARGUMENTS } from "./errors";

/**
 * DID THE CLI REFUSE BEFORE SENDING ANYTHING, OR DID THE SERVER REJECT A
 * COMPLETE REQUEST? Both exit 5, and they are opposites.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ITS OWN MODULE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It is the safety property of the whole id-thread sweep, and it lived inside
 * `scripts/id-thread-sweep.ts` where the vitest suite could not reach it. The
 * only proof it worked was a fixture run somebody had to remember to do by hand.
 * A guarantee nothing in CI exercises is a guarantee until the day it is not.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DISTINCTION, AND WHY THE EXIT CODE CANNOT CARRY IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `invalid-input` (5) is reached from two places in `errors.ts`:
 *
 *   · `refuse()` declines CLIENT-SIDE, having opened no socket, and stamps the
 *     document `CLI_INVALID_ARGUMENTS`. Its own docblock: "the invocation was
 *     refused before anything was sent".
 *   · a 400, 409 or 422 arrives OVER THE WIRE from a request that went out and
 *     came back, and the document carries the API's own code instead.
 *
 * The first means this harness failed to supply an input - a SKIP, because the
 * route was never exercised. The second means the route refused a complete
 * request - a FAILURE. The exit code is identical for both, so keying on it
 * loses exactly the information that decides the verdict.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE DEFAULT IS `false`, AND THAT DIRECTION IS THE WHOLE SAFETY PROPERTY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * An unparseable body, a missing field, a code this does not recognise - every
 * one of them returns `false`, and `false` means FAILED.
 *
 * Guessing "client-side" on doubt would record a broken route as a skip and let
 * the run exit 0: a control reporting success while the thing it guards is down.
 * That is strictly worse than the false FAILED it replaced. A false FAILED is
 * loud and costs somebody an afternoon; a false SKIP is silent and costs the
 * guarantee. When the two cannot be told apart, the harness takes the loud one.
 */
/**
 * Every balanced `{...}` region in `text`, outermost only.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY LINE-SPLITTING WAS NOT ENOUGH, AND WHY THAT WAS INVISIBLE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `emitDocument` pretty-prints UNCONDITIONALLY - `JSON.stringify(value, null, 2)`
 * with no compact branch - so every error document the CLI emits spans multiple
 * lines. The sweep concatenates stdout with stderr, so the moment ANY other
 * stream text lands beside the document, the whole blob stops being valid JSON
 * and not one of its lines is valid either: they are `{`, `  "error": {`, and so
 * on. The previous reader tried exactly those two things, so a real client-side
 * refusal read as unparseable and became FAILED.
 *
 * That failed in the SAFE direction and was still a defect worth this much
 * comment, because the feature was not degraded - it was INERT. Every refusal
 * became FAILED, which is what the code did before the discriminator existed.
 *
 * ⚠️ AND THE TESTS PASSED THROUGHOUT. The fixture emitted SINGLE-LINE JSON, a
 * shape the CLI never produces, so eleven tests and a mutation control all
 * exercised a format that does not exist in production. A double is a CLAIM
 * about the real component; this one was never checked against it.
 *
 * Scanning is string-aware: a brace inside a JSON string must not close the
 * region, or a `message` containing `}` truncates the document and the parse
 * fails on valid output.
 */
function balancedObjects(text: string): string[] {
  const found: string[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] !== "{") {
      index += 1;
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let closed = -1;

    for (let scan = index; scan < text.length; scan += 1) {
      const character = text[scan];

      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          closed = scan;
          break;
        }
      }
    }

    if (closed === -1) {
      // Unbalanced from here - a truncated document, or a stray brace in prose.
      // Neither is a reason to stop looking for a later, complete one.
      index += 1;
      continue;
    }

    found.push(text.slice(index, closed + 1));
    index = closed + 1;
  }

  return found;
}

export function isClientSideRefusal(output: string): boolean {
  for (const candidate of balancedObjects(output)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      // Balanced braces are not the same as valid JSON. Never a reason to
      // assume anything about what it was.
      continue;
    }

    const error = (parsed as { error?: { code?: unknown } }).error;
    if (error?.code === CLI_INVALID_ARGUMENTS) return true;
  }
  return false;
}
