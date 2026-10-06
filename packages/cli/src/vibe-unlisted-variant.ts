import type { VibeUnlistedValue } from "./vibe-deploy-state-vocabulary";

/**
 * True for an enum value `words` has an entry for — the guard a reader asks
 * before indexing its words by a field the contract reads leniently. `words` is
 * a `Record` over the LISTED set, so the listed set and the reader's vocabulary
 * are one declaration and cannot disagree.
 */
export function isListedKey<K extends string>(
  words: Readonly<Record<K, unknown>>,
  value: K | VibeUnlistedValue
): value is K {
  return Object.prototype.hasOwnProperty.call(words, value);
}

/**
 * A variant of a server outcome union whose DISCRIMINANT this binary does not
 * list — a backend newer than the binary learned it first. The contract reads it
 * rather than failing the response (`unlistedDiscriminantSchema` in
 * `@nexus/types`), as a loose object carrying the server's own word and every
 * field it sent; this is the binary's twin of that arm, the same shape the audit
 * feed's `AuditPayloadUnlisted` has.
 *
 * Kept OUT of each listed union, never folded into it: an arm whose discriminant
 * is not a literal stops `switch (x.kind)` from narrowing ANY arm. So a reader
 * types the response `Listed | VibeUnlistedVariant<"kind">`, asks
 * {@link isListedVariant} first, prints the unlisted case as the server's word,
 * and switches exhaustively on the listed half.
 */
export type VibeUnlistedVariant<D extends string> = { [K in D]: VibeUnlistedValue } & {
  [field: string]: unknown;
};

/**
 * Every discriminant a listed union carries, as a value. A `Record` over the
 * listed set rather than an array, so it is exhaustive BY CONSTRUCTION: a variant
 * added to the union does not compile here until it is listed, and a key the
 * union does not carry is an excess property — no gate needed to hold the two
 * together.
 */
export type ListedDiscriminants<L, D extends keyof L> = Readonly<
  Record<Extract<L[D], string>, true>
>;

/**
 * True for a value whose discriminant `listed` names. Narrows the read union to
 * the listed half, which the caller then switches on exhaustively.
 */
export function isListedVariant<D extends string, L extends { [K in D]: string }>(
  discriminant: D,
  listed: ListedDiscriminants<L, D>,
  value: L | VibeUnlistedVariant<D>
): value is L {
  const word: string = value[discriminant];
  return Object.keys(listed).includes(word);
}
