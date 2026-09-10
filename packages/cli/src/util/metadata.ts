/**
 * Metadata/filter flag helpers for the `document` and `collection` commands.
 *
 * YAML frontmatter is read server-side at upload time, so the CLI only parses
 * explicit `key=value` flags here. Values are always strings or string arrays —
 * the shape the Public API accepts.
 */

export type DocumentMetadata = Record<string, string | string[]>;

/** Parse repeated `--metadata key=value` flags. A bare `key` becomes `key=""`. */
export function parseMetadataPairs(pairs: string[]): DocumentMetadata {
  const out: DocumentMetadata = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      out[pair] = "";
    } else {
      out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }
  return out;
}

/**
 * Parse repeated `--filter key=value` flags into a metadata filter. Unlike
 * {@link parseMetadataPairs}, a key repeated across flags accumulates into an
 * array — `--filter region=eu --filter region=us` → `{ region: ["eu", "us"] }` —
 * which the backend turns into an `$in` (match any). A single occurrence stays
 * a scalar (`$eq`). Those operators are the retrieval filter's contract and hold
 * whichever provider is bound — `translate-ze-filter-to-pinecone.ts` is a
 * validating pass-through, not a rewrite.
 */
export function parseFilterPairs(pairs: string[]): DocumentMetadata {
  const grouped = new Map<string, string[]>();
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    const key = (eq === -1 ? pair : pair.slice(0, eq)).trim();
    const value = eq === -1 ? "" : pair.slice(eq + 1).trim();
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  const out: DocumentMetadata = {};
  for (const [key, values] of grouped) {
    out[key] = values.length === 1 ? values[0] : values;
  }
  return out;
}
