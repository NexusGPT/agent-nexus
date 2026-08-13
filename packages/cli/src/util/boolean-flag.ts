import { InvalidArgumentError } from "commander";

/**
 * A BOOLEAN FLAG REFUSES WHAT IT DOES NOT UNDERSTAND. IT NEVER COERCES.
 *
 * ── The defect this replaces ─────────────────────────────────────────────────
 *
 * `opts.active === "true"` reads every unrecognised value as FALSE. So
 * `deployment update --active TRUE` DEACTIVATED a live customer-facing channel
 * and printed success; `custom-model update --enabled maybe` disabled a
 * production model and returned `{"success":true}`. The operator typed an
 * affirmative and got the opposite, under a success envelope. There is no error
 * anywhere in that sequence — the coercion IS the bug, and it is silent by
 * construction.
 *
 * ── Why refuse rather than coerce harder ─────────────────────────────────────
 *
 * The tempting repair is a wider coercion — accept `1`, `yes`, `on`, `y`. That
 * rebuilds the same defect one rung up: every value outside the new list still
 * becomes `false`, and the list has no principled end. Refusing has an end.
 *
 * ── Where the line sits, and why it is not arbitrary ─────────────────────────
 *
 * CASE IS A TYPING ARTIFACT; A SYNONYM IS A GUESS. `TRUE` and `True` can only
 * mean one thing, so accepting them costs nothing and guesses nothing. `yes`,
 * `1` and `on` require the CLI to decide what the operator meant, which is the
 * step that produced both defects above. So: `true`/`false`, any case, and
 * everything else is an error naming both accepted values and what was given.
 *
 * ── Why it is a commander parser and not a check in the action ───────────────
 *
 * `InvalidArgumentError` from a parser refuses at PARSE time — before the action
 * runs, before a client is built, in commander's own error format. Two copies of
 * this logic already existed (`role.ts`'s `readBoolean`, `vibe.ts`'s
 * `parseBoolFlag`), both correct and both throwing from inside the action, so
 * the refusal arrived after the command had already started work.
 * `parseTimeoutSeconds` in `client.ts` is the house precedent for the parser
 * form; this follows it.
 */
export function booleanFlag(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  throw new InvalidArgumentError(
    `expected "true" or "false", got "${raw}". This flag never guesses: a value it ` +
      `does not recognise is refused rather than read as false.`
  );
}

/** The placeholder every boolean flag uses, so the gate can find them. */
export const BOOLEAN_FLAG_PLACEHOLDER = "<bool>";
