import { readStdin, resolveInputValue } from "./stdin";

/**
 * Resolve a `--body` flag value into a parsed object.
 *
 * Accepts:
 *  - `"-"` → reads JSON from stdin
 *  - A path ending in `.json` → reads and parses the file
 *  - A raw JSON string → parses directly
 *
 * Returns `undefined` when `raw` is `undefined` (flag not provided).
 */
export async function resolveBody(
  raw: string | undefined
): Promise<Record<string, unknown> | undefined> {
  if (raw === undefined) return undefined;

  let jsonStr: string;

  if (raw === "-") {
    jsonStr = await readStdin();
  } else if (raw.endsWith(".json")) {
    try {
      const fs = await import("node:fs/promises");
      jsonStr = (await fs.readFile(raw, "utf-8")).trim();
    } catch (err) {
      throw new Error(
        `Could not read file "${raw}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    jsonStr = raw;
  }

  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Invalid JSON in --body: ${jsonStr.length > 120 ? jsonStr.slice(0, 120) + "…" : jsonStr}`
    );
  }
}

/**
 * Resolve a `--input` style flag value into parsed JSON.
 *
 * Like {@link resolveBody}, but for arbitrary JSON inputs (objects, arrays,
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

/**
 * Merge a `--body` JSON object with explicit CLI flags.
 * Flags take precedence — any non-`undefined` flag value overwrites the body field.
 */
export function mergeBodyWithFlags(
  body: Record<string, unknown> | undefined,
  flags: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...body };
  for (const [key, value] of Object.entries(flags)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
