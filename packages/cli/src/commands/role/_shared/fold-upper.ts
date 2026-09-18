/**
 * Case-fold a flag value before it is checked against a contract enum.
 *
 * The wire values are upper-case and nobody types them that way, so folding is
 * what keeps `--status pending` working. It is passed to `enumOption` as its
 * NORMALISER rather than applied in the action: normalising first and validating
 * the OUTPUT asserts that the thing which actually goes on the wire is an enum
 * member, whatever the operator typed.
 */
export function foldUpper(raw: string): string {
  return raw.toUpperCase();
}
