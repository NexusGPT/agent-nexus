/**
 * A coverage money figure, with the floating-point residue taken off.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * `String(amount)` PRINTS `16250.000000000002`, AND THAT NUMBER IS CORRECT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `savingsProjection.amount` is `impactPersonHours × ratePerHour`, and
 * `ratePerHour` is `workloadCost ÷ workloadPersonHours` — so the headline is a
 * division multiplied back by its own divisor. In IEEE-754 that is not an
 * identity: `(260000 / 7360) * 7360` is `16250.000000000002`. The engine is
 * right, the payload is right, and `--json` must keep every digit — a caller
 * reconciling the rate against the amount needs the number that was used.
 *
 * What is wrong is printing those digits in a HUMAN table. `printRecord`'s
 * `format` is the human channel and leaves the JSON document untouched
 * (`output.ts` states that split), and every other figure in this record is
 * already formatted for it — the ratio two fields up is `(ratio * 100).toFixed(2)`.
 * `String()` on the money was the one field that was not, so a reader saw twelve
 * digits of residue on the one number a demo puts on screen and had no way to
 * tell it from a broken model.
 *
 * Two decimals, not zero: these are currency amounts and a blended rate is two
 * significant figures wide — `35.33/h` rounded to whole units is `35`, a 1%
 * error printed directly beside the total it produced. The dashboard makes the
 * same split for the same reason (`formatFigures.ts`: `formatMoney` pins 0,
 * `formatRate` pins 2); a CLI table has one column and no room for two rules, so
 * it takes the finer of the two.
 *
 * `Number(...)` around the `toFixed` is what drops a trailing `.00`, so a whole
 * amount still reads `16250` rather than `16250.00`. Deliberately NOT `Intl`:
 * this string is read in a terminal on an unknown locale, and grouping
 * separators that move with `LANG` are a worse cost here than they are in a
 * browser that already knows the reader's language.
 */
export function coverageMoney(amount: number): string {
  return String(Number(amount.toFixed(2)));
}
