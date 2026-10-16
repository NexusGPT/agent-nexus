// ---------------------------------------------------------------------------
// An absent field — `null` on the wire, a sentence in the terminal.
// ---------------------------------------------------------------------------

/**
 * A field that is ABSENT, carrying the sentence a human should read instead.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `x ?? "(none)"` IN A `printSuccess` PAYLOAD PUTS DISPLAY COPY ON THE WIRE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `printSuccess` renders ONE object down two channels, so the `??` that makes a
 * null readable in the terminal also replaces the null in `--json`. A script then
 * has to detect absence by matching English — the working detection against CLI
 * 0.21.9 literally read `if moved_from and "belonged to no Role" not in
 * str(moved_from)` — which breaks silently the day the copy is reworded, and the
 * fields it happens on are consequential: whether another team just lost a system,
 * and whether a Role has an owner at all (NEX-3628). Worse, the SAME field is a
 * proper `null` on the matching GET, because reads go through `printRecord`, whose
 * `format` is human-only and leaves the JSON document untouched.
 *
 * So `x ?? absent("(none)")` keeps the `??` idiom and splits the two channels:
 * `--json` gets `null`, the terminal gets the sentence. It is deliberately the
 * only way to say it — a bare string in the payload is, and should be, a value the
 * caller is expected to parse.
 */
const ABSENT_TEXT = Symbol("the human rendering of an absent value");

/** A `null` on the wire that reads as a sentence in the terminal. */
export interface AbsentValue {
  readonly [ABSENT_TEXT]: string;
}

/** `null` under `--json`; `text` in the human rendering. See {@link AbsentValue}. */
export function absent(text: string): AbsentValue {
  return { [ABSENT_TEXT]: text };
}

export function isAbsent(value: unknown): value is AbsentValue {
  return typeof value === "object" && value !== null && ABSENT_TEXT in value;
}

/**
 * The sentence an {@link AbsentValue} carries, for the human channel.
 *
 * The symbol key stays private to this file: a printer that could read it
 * could also put it on a payload by hand, and then the `--json` mapping below
 * would be one call site away from being bypassed.
 */
export function absentText(value: AbsentValue): string {
  return value[ABSENT_TEXT];
}

/**
 * The payload as a script reads it.
 *
 * An {@link AbsentValue} carries its text on a SYMBOL key, which `JSON.stringify`
 * omits — so an unmapped one would serialize as `{}` rather than as the display
 * copy it replaces. Mapping it to `null` here is what makes the field mean the
 * same thing on the write as it does on the matching read.
 */
export function jsonPayload(data: object | undefined): Record<string, unknown> {
  if (data === undefined) return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, isAbsent(value) ? null : value])
  );
}
