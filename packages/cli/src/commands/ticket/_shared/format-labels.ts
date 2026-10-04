/** Renders a ticket's `labels` array for the human-readable record output. */
export function formatLabels(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}
