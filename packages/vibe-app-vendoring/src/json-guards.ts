/**
 * The narrow shape checks this package needs, hand-written.
 *
 * 🔴 NOT a stylistic preference, and not a lowering of the bar. These modules
 * are shared with `@agent-nexus/cli`, which is published standalone and bundles
 * everything it imports — so a Zod import here lands Zod in that binary, which
 * is the weight its publishing model exists to avoid and which
 * `packages/cli/src/wire-types-bundle.test.ts` refuses outright. The package's
 * empty dependency list is the contract; see `tsup.config.ts`.
 *
 * What is validated is also narrower than a boundary: a `package.json` and a
 * lockfile read off the local disk, where the only questions are "is this an
 * object" and "is this map string-valued". `core/code-quality.md` names a type
 * guard as the correct instrument for exactly that, in place of a cast.
 */

/** A JSON object — not null, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A `{ [name]: string }` map, as every npm dependency field is.
 *
 * Returns null rather than throwing, so a caller can tell "absent" from
 * "present and malformed" and refuse only the second.
 */
export function asStringMap(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  for (const entry of Object.values(value)) {
    if (typeof entry !== "string") return null;
  }
  return value as Record<string, string>;
}

/** `JSON.parse`, with the failure returned rather than thrown. */
export function parseJson(
  raw: string
): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
}
