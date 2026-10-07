/**
 * A `--flag <json>` whose value must be a JSON OBJECT, refused in this process.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS SHARED RATHER THAN WRITTEN AT EACH FLAG
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both MCP namespaces take arguments for a tool as a JSON object on the command
 * line, and `nexus mcp call --input` had the only copy of this check. A second
 * copy on `nexus mcp-server call --arguments` would be two spellings of one
 * refusal, free to disagree — and the two namespaces are already one suffix apart,
 * so an operator who reaches the wrong one and gets a DIFFERENT error message
 * learns the wrong thing about which verb was wrong.
 *
 * ## 🔴 AN ARRAY AND A SCALAR ARE REFUSED, NOT COERCED
 *
 * `typeof [] === "object"` and `typeof null === "object"`, so a bare `typeof`
 * check accepts both. A tool's arguments are a named map in the protocol, so an
 * array would be sent and answered with a 400 from a schema — a worse message than
 * naming the shape here, before anything is dialled.
 *
 * ## It returns the REASON rather than throwing
 *
 * The caller owns how a refusal is reported — which exit code, which hint, which
 * command to suggest next — and that differs per flag. A thrown error here would
 * have to be caught and re-categorised at every call site, and the generic handler
 * would otherwise label a caller's typo as an unknown CLI error.
 */

/** The parsed object, or the sentence explaining why it is not one. */
export type JsonObjectFlag =
  | { readonly object: Record<string, unknown> }
  | { readonly reason: string };

/**
 * Parse a JSON-object flag value.
 *
 * @param raw - The flag's value, or `undefined` when it was not passed.
 * @param flag - The flag's own spelling, so the refusal names what the caller typed.
 * @returns `{ object }` — `{}` when the flag was absent — or `{ reason }`.
 */
export function parseJsonObjectFlag(raw: string | undefined, flag: string): JsonObjectFlag {
  if (raw === undefined) return { object: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { reason: `${flag} is not valid JSON: ${detail}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { reason: `${flag} must be a JSON OBJECT, not an array or a scalar.` };
  }
  return { object: parsed as Record<string, unknown> };
}
