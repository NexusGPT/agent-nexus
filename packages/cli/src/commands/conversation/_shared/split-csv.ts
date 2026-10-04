/**
 * Split a CSV CLI value into an array of trimmed, non-empty items.
 * Only safe for values that can never contain a literal comma (e.g. enum
 * identifiers like `USER,AGENT,SYSTEM`). A free-form string would be
 * silently mangled by the split — same constraint as the server-side
 * `csvOrArray` schema in conversation.schemas.ts.
 */
export function splitCsv<T extends string>(value: string | undefined): T[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as T[];
  return items.length > 0 ? items : undefined;
}
