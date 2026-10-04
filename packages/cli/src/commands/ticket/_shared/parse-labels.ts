/**
 * Parse a `--labels` value into the array the API expects. An empty value
 * yields `[]`, which on update clears the ticket's non-type labels.
 */
export function parseLabels(raw: string): string[] {
  return raw
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}
