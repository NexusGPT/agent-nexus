/**
 * Shared by `add-member` and `remove-member`, which both echo the WHOLE group
 * back and render the same column. One copy, so the em-dash placeholder cannot
 * differ between the two verbs that are supposed to print identically.
 */

/** Renders a group's `memberUserIds` array for the human-readable record output. */
export function formatUserIds(value: unknown): string {
  return Array.isArray(value) && value.length > 0 ? value.join(", ") : "—";
}
