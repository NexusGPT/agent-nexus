import { resolveInputValue } from "./stdin";

/**
 * Resolve a `--input` style flag value into parsed JSON.
 *
 * Like `resolveBody` in `body.resolve.ts`, but for arbitrary JSON inputs (objects, arrays,
 * scalars) and with the more permissive file detection used by other
 * file-or-stdin flags (`--prompt`, `--content`, …):
 *  - `"-"` → reads JSON from stdin
 *  - A path to an existing file → reads and parses the file contents
 *  - Anything else → parses the literal value as inline JSON
 *
 * Returns `undefined` when `raw` is `undefined` (flag not provided).
 */
export async function resolveInputJson(
  raw: string | undefined,
  flagName = "--input"
): Promise<unknown> {
  if (raw === undefined) return undefined;

  const jsonStr = await resolveInputValue(raw);

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Invalid JSON in ${flagName}: ${jsonStr.length > 120 ? jsonStr.slice(0, 120) + "…" : jsonStr}`
    );
  }
}
