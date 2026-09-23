import { KEY_COLUMN } from "./key-column";

/**
 * Render one `Record<keyof T, string>` as an aligned block.
 *
 * The KEY comes from the record's own key, never from the description, so a
 * description cannot name a field the type does not have. A description may
 * carry its own newlines for a value that will not fit the remaining width; it
 * is the author's job to indent those continuations.
 */
export function renderFields(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, description]) => `    ${key.padEnd(KEY_COLUMN)}${description}`)
    .join("\n");
}
