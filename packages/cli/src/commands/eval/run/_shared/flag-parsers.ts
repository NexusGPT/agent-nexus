import type { PromptEvalCheckpointSelection } from "@agent-nexus/sdk";

import { refuse } from "../../../../errors";

/** `--conversations a,b` and `--variants "A","B"` are comma-separated lists. */
export function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * `--checkpoints <conv>:<n,..|all>`, repeatable. `all` is expressed by OMITTING
 * the conversation from the parsed list — the server already means "every
 * checkpoint" for a conversation nobody narrowed, so sending an explicit list
 * of all of them would be a second way to say the same thing that goes stale
 * the moment a checkpoint is added.
 *
 * 🔴 THE TWO `refuse(...)` CALLS BELOW DISCARD THE EXIT CODE, AND THAT IS NOT
 * REPAIRABLE HERE. This is a commander `argParser`, not an action: it runs
 * DURING option parsing, so assigning `process.exitCode` would leave the
 * invocation running — the malformed selection is dropped, the matrix is still
 * created, real money is still spent, and the process would then exit non-zero
 * over a run that succeeded. The honest repair is to refuse the invocation
 * (`throw new InvalidArgumentError`), which replaces this package's own error
 * envelope with commander's and changes the exit code, so it is a behaviour
 * change with its own evidence rather than part of a pure move.
 */
export function collectCheckpoints(
  raw: string,
  previous: PromptEvalCheckpointSelection[]
): PromptEvalCheckpointSelection[] {
  const separator = raw.lastIndexOf(":");
  if (separator <= 0) {
    refuse(`--checkpoints must be <conversationId>:<n,..|all>; got "${raw}"`);
    return previous;
  }
  const conversationId = raw.slice(0, separator);
  const spec = raw.slice(separator + 1).trim();
  if (spec === "all") return previous;

  const turnIndexes = splitList(spec).map((n) => Number.parseInt(n, 10));
  if (turnIndexes.some((n) => Number.isNaN(n) || n < 0)) {
    refuse(`--checkpoints turn indexes must be non-negative integers; got "${spec}"`);
    return previous;
  }
  return [...previous, { conversationId, turnIndexes }];
}

/** USD on the flag, ten-thousandths on the wire. `0.0001` is the smallest cap. */
export function toUsdTenThousandths(raw: string): number | null {
  const usd = Number.parseFloat(raw);
  if (Number.isNaN(usd) || usd <= 0) return null;
  return Math.max(1, Math.round(usd * 10_000));
}

/**
 * The server caps judge repetitions at 5, so the CLI refuses out of range
 * rather than sending it.
 *
 * The PREDICATE is shared and the refusal is not: `process.exitCode = refuse(…)`
 * has to sit in the action handler itself — governance reads the exit on the
 * statement that emits it — so each call site keeps its own message literal.
 */
export function repetitionsOutOfRange(repetitions: number | undefined): boolean {
  return repetitions !== undefined && (repetitions < 1 || repetitions > 5);
}
