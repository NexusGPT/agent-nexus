/**
 * The `--variables` flag, parsed.
 *
 * `create` and `test-send` both take a flat positional map as a JSON string and
 * both have to decide what an unparseable one means. They agree on the parse and
 * disagree on the REFUSAL — one says "--variables must be valid JSON." and the
 * other says "Invalid JSON for --variables." with an example hint — so this unit
 * owns the parse and each caller keeps its own wording rather than having one
 * silently imposed on the other.
 */
export type TemplateVariablesParse =
  | { readonly ok: true; readonly variables: Record<string, string> | undefined }
  | { readonly ok: false };

/**
 * Parse a `--variables` JSON string, or report that it is not JSON.
 *
 * An absent flag is `{ ok: true, variables: undefined }` and not a failure: the
 * variables are optional, and `undefined` is what the API call sends when the
 * template declares no placeholders.
 *
 * ⚠️ VALID JSON IS THE WHOLE OF THE CHECK. `"[]"`, `"null"` and `"7"` all parse,
 * so a non-object reaches the API as the variables map. Twilio rejects it there;
 * nothing here narrows it, and a caller must not read `ok` as "this is a map".
 */
export function templateVariablesFromJson(raw: string | undefined): TemplateVariablesParse {
  if (!raw) return { ok: true, variables: undefined };

  try {
    return { ok: true, variables: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}
