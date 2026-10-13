/**
 * Metadata/filter flag helpers for the `document` and `collection` commands.
 *
 * YAML frontmatter is read server-side at upload time, so the CLI only parses
 * explicit `key=value` flags here. Values are always strings or string arrays —
 * the shape the Public API accepts.
 */

import { invalidInput } from "../errors";

export type DocumentMetadata = Record<string, string | string[]>;

/**
 * The shape of a metadata key the API accepts: letters, digits, `-` or `_`,
 * never a leading `_`, at most 64 characters. The retrieval index refuses a key
 * that starts with `_` or is longer than 64 bytes, and one refused key fails the
 * whole write, so the CLI refuses it before the request leaves the machine.
 *
 * A copy of `DOCUMENT_METADATA_KEY_PATTERN` in `@nexus/types`, which the
 * published CLI cannot import at runtime.
 * `metadata-key-rule-matches-the-contract.test.ts` pins the two pattern sources
 * and the two rule texts equal.
 */
export const METADATA_KEY_PATTERN = /^[A-Za-z0-9-][A-Za-z0-9_-]{0,63}$/;

/** The rule {@link METADATA_KEY_PATTERN} enforces, in the words the API prints. */
export const METADATA_KEY_RULE =
  "a metadata key uses letters, digits, - or _, does not start with _, and is at most 64 characters";

/**
 * Refuse metadata whose keys the API would refuse, naming the first bad key and
 * the rule. Both parsers call it on what they built, so every `--metadata` and
 * `--filter` flag is refused before any request is sent.
 */
function assertMetadataKeys(metadata: Record<string, unknown>): void {
  const refusedKey = Object.keys(metadata).find((key) => !METADATA_KEY_PATTERN.test(key));
  if (refusedKey !== undefined) {
    throw invalidInput(`Metadata key "${refusedKey}" is refused: ${METADATA_KEY_RULE}.`);
  }
}

/**
 * Parse repeated `--metadata key=value` flags, refusing a key the API would
 * refuse. A bare `key` becomes `key=""`.
 *
 * Collected in a `Map` and materialised with `Object.fromEntries`, so a
 * `__proto__` key becomes an own property the key rule refuses; assigned onto
 * a plain object it would set the prototype instead, leave no key for the
 * guard to see, and send an empty `metadata` that replaces the document's.
 */
export function parseMetadataPairs(pairs: string[]): DocumentMetadata {
  const parsed = new Map<string, string>();
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      parsed.set(pair.trim(), "");
    } else {
      parsed.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  const metadata = Object.fromEntries(parsed);
  assertMetadataKeys(metadata);
  return metadata;
}

/**
 * Parse repeated `--filter key=value` flags into a metadata filter. Unlike
 * {@link parseMetadataPairs}, a key repeated across flags accumulates into an
 * array — `--filter region=eu --filter region=us` → `{ region: ["eu", "us"] }` —
 * which the backend turns into an `$in` (match any). A single occurrence stays
 * a scalar (`$eq`). Those operators are the retrieval filter's contract and hold
 * whichever provider is bound — `translate-ze-filter-to-pinecone.ts` is a
 * validating pass-through, not a rewrite.
 *
 * Materialised with `Object.fromEntries` for the same reason as
 * {@link parseMetadataPairs}: a `__proto__` key stays an own key the rule sees,
 * and a key the API would refuse is refused here.
 */
export function parseFilterPairs(pairs: string[]): DocumentMetadata {
  const grouped = new Map<string, string[]>();
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    const key = (eq === -1 ? pair : pair.slice(0, eq)).trim();
    const value = eq === -1 ? "" : pair.slice(eq + 1).trim();
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  const filter = Object.fromEntries(
    [...grouped].map(([key, values]) => [key, values.length === 1 ? values[0] : values])
  );
  assertMetadataKeys(filter);
  return filter;
}
