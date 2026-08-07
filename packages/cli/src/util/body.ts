import { readStdin, resolveInputValue } from "./stdin";

/**
 * Resolve a `--body` flag value that commander guarantees is present
 * (`requiredOption`), into a parsed object.
 *
 * Accepts:
 *  - `"-"` → reads JSON from stdin
 *  - A path ending in `.json` → reads and parses the file
 *  - A raw JSON string → parses directly
 *
 * Separate from {@link resolveBody} rather than an overload of it: TypeScript
 * overloads are the natural spelling, but the base `no-redeclare` rule does not
 * understand them and reports two errors. Two named functions say the same thing
 * and let the required case return a `Record` with no narrowing step and no
 * unreachable guard at the call site.
 */
export async function resolveRequiredBody(raw: string): Promise<Record<string, unknown>> {
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
 * {@link resolveRequiredBody} for an OPTIONAL `--body`.
 *
 * Returns `undefined` when the flag was not provided, and the caller must deal
 * with that itself — silently substituting `{}` sends the server a DIFFERENT
 * request rather than no request.
 */
export async function resolveBody(
  raw: string | undefined
): Promise<Record<string, unknown> | undefined> {
  return raw === undefined ? undefined : resolveRequiredBody(raw);
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

/**
 * THE boundary where operator-supplied JSON becomes a typed SDK argument.
 *
 * `--body` accepts arbitrary JSON — a literal, a file, or stdin — so what
 * arrives is `Record<string, unknown>` and nothing in the CLI can narrow it. The
 * CLI cannot validate it either: `safeParse` means a Zod import, and Zod pulls
 * the generated Prisma enums, which is the +5MB a published binary exists to
 * keep out. The server validates and returns a 400 with the field names, which
 * is a better error than anything a hand-rolled check here would produce.
 *
 * So the assertion is unavoidable. What is avoidable is it appearing inline at
 * every call site, where each one reads as a local shortcut rather than as the
 * one place a whole class of unchecked value enters. Naming it once means a
 * reader asking "where does unvalidated operator input cross into typed code?"
 * gets a single answer, and `as any` — which would also switch OFF checking on
 * everything downstream of the call — never has to be reached for.
 *
 * It takes a REQUIRED `Record`. An earlier version accepted `undefined` and
 * substituted `{}`, which turned "the operator omitted `--body`" into "the
 * operator sent an empty object" — a different request, reaching the server as
 * `{"auth":{}}` where it used to send nothing at all. A missing body is the
 * caller's problem to state, not this function's to invent.
 */
export function asRequestBody<T>(body: Record<string, unknown>): T {
  return body as unknown as T;
}
