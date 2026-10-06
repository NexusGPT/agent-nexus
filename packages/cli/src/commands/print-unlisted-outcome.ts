/**
 * Prints an outcome whose discriminant this binary does not list — the
 * `VibeUnlistedVariant` arm of an operator mutation's answer.
 *
 * A published binary routinely talks to a backend newer than itself, and the
 * server's own word is the only honest thing it can say about such an outcome.
 * So the human rendering is that word, marked as newer than this CLI, with every
 * field the server sent.
 *
 * Under `--json` it is an ERROR DOCUMENT (`CLI_OUTCOME_NOT_LISTED`) whose `hint`
 * carries the answer exactly as received — never the bare answer. The exit is not
 * 0, and a non-zero run whose stdout is a payload rather than `{ error }` reads as
 * a success to every consumer that parses before it checks the status; that is
 * the shape `json-one-document.test.ts` refuses as `error-masked`.
 *
 * 🔴 THE EXIT IS NEVER `success`. Every caller is a mutation — a tick, a
 * provision, a disable, a converge, a teardown, a deploy trigger — and a binary
 * that cannot read the outcome cannot say whether the thing happened. Exiting 0
 * would tell a script it did. `unmeasured` is the taxonomy's word for exactly
 * this: the operation ran and its result could not be measured.
 */

import { CLI_OUTCOME_NOT_LISTED, printFailure } from "../errors";
import { EXIT_CODES } from "../exit-codes";
import { color, isJsonMode, printRecord } from "../output";
import type { VibeUnlistedVariant } from "../vibe-unlisted-variant";

/** The marker an unlisted outcome carries in the terminal, after the server's word. */
export const UNLISTED_OUTCOME_NOTE =
  "— outcome not known to this CLI version; upgrade with: npm i -g @agent-nexus/cli";

export function printUnlistedOutcome<D extends string>(
  discriminant: D,
  outcome: VibeUnlistedVariant<D>
): void {
  process.exitCode = EXIT_CODES.unmeasured;
  if (isJsonMode()) {
    printFailure(
      `The server answered with an outcome this CLI version does not list: ${String(outcome[discriminant])}. Whether the operation took effect was not measured.`,
      CLI_OUTCOME_NOT_LISTED,
      `The server's answer, as received: ${JSON.stringify(outcome)} — upgrade with: npm i -g @agent-nexus/cli`
    );
    return;
  }
  // Every other field the server sent, under its own name: this binary has no
  // words for them, and dropping them would hide what the newer backend said.
  const rest = Object.keys(outcome)
    .filter((key) => key !== discriminant)
    .map((key) => ({ key, label: key }));
  printRecord(outcome, [
    {
      key: discriminant,
      label: "Outcome",
      format: (word) => `${color.yellow(String(word))} ${color.dim(UNLISTED_OUTCOME_NOTE)}`
    },
    ...rest
  ]);
}
