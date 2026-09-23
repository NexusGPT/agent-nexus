/**
 * Commander collector for repeatable `--metadata key=value` options.
 *
 * 🔴 A SUBCOMMAND BOUNDARY IS NOT THE CONCERN BOUNDARY HERE. Four leaves take
 * repeatable metadata — `upload`, `create-text`, `add-website` and `update` —
 * and commander needs the SAME function reference shape on each. Copying it
 * into four command files is four things to drift, and
 * `flag-defaults-never-overwrite-body.test.ts` reads an identifier in that
 * argument position as the marker of a coercion rather than a default, so the
 * identifier is load-bearing beyond its body.
 */
export function collectMetadata(value: string, previous: string[]): string[] {
  return [...previous, value];
}
